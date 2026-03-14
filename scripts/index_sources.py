#!/usr/bin/env python3
"""Build a version-isolated source code index from Java files using tree-sitter.

Uses tree-sitter-java for proper AST parsing — captures everything regex missed:
  - Class/interface/enum/record declarations with inheritance (extends/implements)
  - Method signatures with return types, parameter types, and annotations
  - Constructor declarations with parameter types
  - Field declarations with types and annotations
  - Inner/nested class relationships
  - KubeJS-specific: GROUP.common/client/server event registrations
  - Mixin-specific: @Mixin(target), @Inject(method=), @Shadow, @Overwrite

Everything stored in data/minecraft_sources.sqlite with version+loader isolation.

Usage:
    python scripts/index_sources.py              # full index
    python scripts/index_sources.py --rebuild    # drop + rebuild
    python scripts/index_sources.py --version 1.21.1 --loader kubejs
    python scripts/index_sources.py --dry-run    # count files only
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sqlite3
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional, Tuple

import tree_sitter_java as tsjava
from tree_sitter import Language, Parser

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]
SOURCES_ROOT = ROOT / "sources"
DATA_DIR = ROOT / "data"
SOURCES_DB = DATA_DIR / "minecraft_sources.sqlite"

# ---------------------------------------------------------------------------
# Tree-sitter setup (module-level singleton — fast)
# ---------------------------------------------------------------------------
JAVA_LANG = Language(tsjava.language())
_parser = Parser(JAVA_LANG)

# KubeJS event registration pattern (not in AST — grep the source text)
_KUBEJS_EVENT_RE = re.compile(r'GROUP\.\w+\s*\(\s*"(\w+)"')


# ---------------------------------------------------------------------------
# AST helpers
# ---------------------------------------------------------------------------
def _node_text(src: bytes, node) -> str:
    """Extract UTF-8 text for a tree-sitter node."""
    return src[node.start_byte:node.end_byte].decode("utf-8", errors="replace")


def _first_child_of_type(node, type_name: str):
    """Return first direct child with the given type, or None."""
    for ch in node.children:
        if ch.type == type_name:
            return ch
    return None


def _children_of_type(node, type_name: str):
    """Return all direct children with the given type."""
    return [ch for ch in node.children if ch.type == type_name]


def _annotation_names(src: bytes, decl_node) -> List[str]:
    """Extract annotation names from a declaration's modifiers."""
    modifiers = _first_child_of_type(decl_node, "modifiers")
    if modifiers is None:
        return []
    out: List[str] = []
    for ch in modifiers.children:
        if ch.type in ("annotation", "marker_annotation"):
            name = ch.child_by_field_name("name")
            if name is not None:
                out.append(_node_text(src, name))
    return out


def _annotation_args(src: bytes, decl_node, anno_name: str) -> Optional[str]:
    """Extract the argument string for a specific annotation, if present."""
    modifiers = _first_child_of_type(decl_node, "modifiers")
    if modifiers is None:
        return None
    for ch in modifiers.children:
        if ch.type == "annotation":
            name = ch.child_by_field_name("name")
            if name and _node_text(src, name) == anno_name:
                args = ch.child_by_field_name("arguments")
                if args:
                    return _node_text(src, args)
    return None


def _modifier_keywords(decl_node) -> List[str]:
    """Extract modifier keywords (public, static, abstract, final, etc.)."""
    modifiers = _first_child_of_type(decl_node, "modifiers")
    if modifiers is None:
        return []
    return [ch.type for ch in modifiers.children
            if ch.type not in ("annotation", "marker_annotation") and not ch.is_named]


def _extract_superclass(src: bytes, class_node) -> Optional[str]:
    """Extract superclass name from class_declaration."""
    sc = class_node.child_by_field_name("superclass")
    if sc is None:
        return None
    # superclass node wraps the type — get its first named child
    for ch in sc.named_children:
        return _node_text(src, ch)
    return None


def _extract_interfaces(src: bytes, class_node) -> List[str]:
    """Extract implemented interface names from class/enum/record."""
    ifaces = class_node.child_by_field_name("interfaces")
    if ifaces is None:
        return []
    # super_interfaces -> type_list -> type_identifier*
    type_list = _first_child_of_type(ifaces, "type_list")
    if type_list is None:
        return []
    return [_node_text(src, ch) for ch in type_list.named_children]


def _extract_extends_interfaces(src: bytes, iface_node) -> List[str]:
    """Extract extended interfaces from interface_declaration."""
    for ch in iface_node.named_children:
        if ch.type == "extends_interfaces":
            type_list = _first_child_of_type(ch, "type_list")
            if type_list:
                return [_node_text(src, c) for c in type_list.named_children]
    return []


def _extract_type_params(src: bytes, decl_node) -> Optional[str]:
    """Extract type parameters like <T, E extends Comparable<E>>."""
    tp = decl_node.child_by_field_name("type_parameters")
    if tp is None:
        return None
    return _node_text(src, tp)


def _method_signature(src: bytes, method_node) -> str:
    """Build compact method signature (everything before the body)."""
    body = method_node.child_by_field_name("body")
    if body is not None:
        end = body.start_byte
    else:
        end = method_node.end_byte
    sig = src[method_node.start_byte:end].decode("utf-8", errors="replace").strip()
    # Remove annotation lines from the signature for compactness
    lines = sig.split("\n")
    sig_lines = [l.strip() for l in lines if not l.strip().startswith("@")]
    return " ".join(sig_lines).strip()


def _extract_params(src: bytes, params_node) -> List[Tuple[str, str]]:
    """Extract (type, name) pairs from formal_parameters."""
    result: List[Tuple[str, str]] = []
    for ch in params_node.named_children:
        if ch.type in ("formal_parameter", "spread_parameter"):
            type_node = ch.child_by_field_name("type")
            name_node = ch.child_by_field_name("name")
            if type_node and name_node:
                result.append((_node_text(src, type_node), _node_text(src, name_node)))
    return result


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
@dataclass
class ClassInfo:
    name: str
    kind: str                     # class, interface, enum, record, @interface
    superclass: Optional[str]
    interfaces: List[str]
    type_params: Optional[str]
    annotations: List[str]
    line_num: int
    end_line: int
    is_inner: bool
    parent_class: Optional[str]   # for inner classes


@dataclass
class MethodInfo:
    name: str
    return_type: str
    params: List[Tuple[str, str]]  # [(type, name), ...]
    annotations: List[str]
    signature: str                 # compact one-line signature
    line_num: int
    is_constructor: bool


@dataclass
class FieldInfo:
    name: str
    field_type: str
    annotations: List[str]
    line_num: int


@dataclass
class EventInfo:
    name: str
    line_num: int
    kind: str  # kubejs_event, mixin_target, inject_method, subscribe_event


@dataclass
class FileInfo:
    rel_path: str
    package_name: str
    line_count: int
    content: str = ""
    classes: List[ClassInfo] = field(default_factory=list)
    methods: List[MethodInfo] = field(default_factory=list)
    fields: List[FieldInfo] = field(default_factory=list)
    events: List[EventInfo] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Corpus discovery (unchanged from original — proven correct)
# ---------------------------------------------------------------------------
@dataclass
class Corpus:
    version: str
    loader: str
    source_dirs: List[Path]
    source_root: Path


def discover_corpora(
    sources_root: Path,
    filter_version: Optional[str],
    filter_loader: Optional[str],
) -> List[Corpus]:
    """Scan sources/ and infer all version/loader corpora."""
    _VERSION_RE = re.compile(r'^\d+\.\d+')
    corpora: List[Corpus] = []

    for version_dir in sorted(sources_root.iterdir()):
        if not version_dir.is_dir() or not _VERSION_RE.match(version_dir.name):
            continue
        version = version_dir.name
        if filter_version and version != filter_version:
            continue

        for loader_name in ("kubejs", "forge", "neoforge"):
            if filter_loader and loader_name != filter_loader:
                continue
            src = version_dir / loader_name / "sources"
            if src.is_dir():
                corpora.append(Corpus(
                    version=version, loader=loader_name,
                    source_dirs=[src], source_root=src,
                ))

        if not filter_loader or filter_loader == "minecraft":
            mc_dirs = []
            for sub in ("client-src", "server-src"):
                d = version_dir / "minecraft" / sub
                if d.is_dir():
                    mc_dirs.append(d)
            if mc_dirs:
                corpora.append(Corpus(
                    version=version, loader="minecraft",
                    source_dirs=mc_dirs,
                    source_root=version_dir / "minecraft",
                ))

        # Third-party version-isolated libraries: any other dir with sources/ subdir
        _BUILTIN_LOADERS = {"kubejs", "forge", "neoforge", "minecraft", "minecraft-obfuscated-backup"}
        for entry in sorted(version_dir.iterdir()):
            if not entry.is_dir() or entry.name in _BUILTIN_LOADERS:
                continue
            lib_name = entry.name
            if filter_loader and filter_loader != lib_name:
                continue
            src = entry / "sources"
            if src.is_dir():
                corpora.append(Corpus(
                    version=version, loader=lib_name,
                    source_dirs=[src], source_root=src,
                ))

    # Third-party libraries — each library gets its own corpus
    # so they're independently searchable (rhino, mixin, mixinextras, etc.)
    tp_root = sources_root / "third_party" / "sources"
    if tp_root.is_dir():
        # Map directory names to clean library identifiers
        _LIB_MAP = {
            "rhino": "rhino",
            "sponge-mixin": "mixin",
            "mixinextras-common": "mixinextras",
            "mixinextras-forge": "mixinextras-forge",
            "mixinextras-neoforge": "mixinextras-neoforge",
        }
        for lib_dir in sorted(tp_root.iterdir()):
            if not lib_dir.is_dir():
                continue
            # Match directory name to library
            lib_name = None
            for prefix, name in _LIB_MAP.items():
                if lib_dir.name.startswith(prefix):
                    lib_name = name
                    break
            if lib_name is None:
                lib_name = lib_dir.name.split("-")[0]  # fallback: first segment

            if filter_loader and filter_loader != lib_name:
                continue
            if filter_version and filter_version != "third_party":
                continue

            corpora.append(Corpus(
                version="third_party",
                loader=lib_name,
                source_dirs=[lib_dir],
                source_root=tp_root,
            ))

    return corpora


def walk_java_files(corpus: Corpus) -> Generator[Path, None, None]:
    for src_dir in corpus.source_dirs:
        yield from src_dir.rglob("*.java")


# ---------------------------------------------------------------------------
# Tree-sitter extraction
# ---------------------------------------------------------------------------
_CLASS_TYPES = {
    "class_declaration": "class",
    "interface_declaration": "interface",
    "enum_declaration": "enum",
    "record_declaration": "record",
    "annotation_type_declaration": "@interface",
}


def _walk_classes(
    src: bytes,
    node,
    parent_class: Optional[str] = None,
) -> Generator[Tuple[ClassInfo, List[Any]], None, None]:
    """Recursively walk class-like declarations, yielding (ClassInfo, body_children)."""
    for child in node.named_children:
        if child.type in _CLASS_TYPES:
            kind = _CLASS_TYPES[child.type]
            name_node = child.child_by_field_name("name")
            if name_node is None:
                continue
            name = _node_text(src, name_node)

            # Inheritance
            superclass = _extract_superclass(src, child) if kind == "class" else None
            if kind == "interface":
                interfaces = _extract_extends_interfaces(src, child)
            else:
                interfaces = _extract_interfaces(src, child)

            ci = ClassInfo(
                name=name,
                kind=kind,
                superclass=superclass,
                interfaces=interfaces,
                type_params=_extract_type_params(src, child),
                annotations=_annotation_names(src, child),
                line_num=child.start_point[0] + 1,
                end_line=child.end_point[0] + 1,
                is_inner=parent_class is not None,
                parent_class=parent_class,
            )

            # Get body for methods/fields/inner classes
            body = child.child_by_field_name("body")
            body_children = body.named_children if body else []

            yield ci, body_children

            # Recurse for inner classes
            if body:
                yield from _walk_classes(src, body, parent_class=name)


def extract_file(java_path: Path, source_root: Path) -> Optional[FileInfo]:
    """Parse a Java file with tree-sitter and extract all symbols."""
    try:
        src = java_path.read_bytes()
    except Exception:
        return None

    tree = _parser.parse(src)
    root = tree.root_node
    rel_path = str(java_path.relative_to(source_root))
    line_count = src.count(b"\n") + 1

    # Package
    package_name = ""
    pkg_node = _first_child_of_type(root, "package_declaration")
    if pkg_node:
        for ch in pkg_node.named_children:
            if ch.type in ("scoped_identifier", "identifier"):
                package_name = _node_text(src, ch)
                break

    info = FileInfo(
        rel_path=rel_path,
        package_name=package_name,
        line_count=line_count,
        content=src.decode("utf-8", errors="replace"),
    )

    # Walk all class-like declarations (including inner classes)
    for class_info, body_children in _walk_classes(src, root):
        info.classes.append(class_info)

        # Extract methods, constructors, fields from class body
        for member in body_children:
            if member.type == "method_declaration":
                name_node = member.child_by_field_name("name")
                ret_node = member.child_by_field_name("type")
                params_node = member.child_by_field_name("parameters")
                if name_node and params_node:
                    ret_type = _node_text(src, ret_node) if ret_node else "void"
                    info.methods.append(MethodInfo(
                        name=_node_text(src, name_node),
                        return_type=ret_type,
                        params=_extract_params(src, params_node),
                        annotations=_annotation_names(src, member),
                        signature=_method_signature(src, member),
                        line_num=member.start_point[0] + 1,
                        is_constructor=False,
                    ))

            elif member.type == "constructor_declaration":
                name_node = member.child_by_field_name("name")
                params_node = member.child_by_field_name("parameters")
                if name_node and params_node:
                    info.methods.append(MethodInfo(
                        name=_node_text(src, name_node),
                        return_type="<init>",
                        params=_extract_params(src, params_node),
                        annotations=_annotation_names(src, member),
                        signature=_method_signature(src, member),
                        line_num=member.start_point[0] + 1,
                        is_constructor=True,
                    ))

            elif member.type == "field_declaration":
                type_node = member.child_by_field_name("type")
                if type_node is None:
                    continue
                field_type = _node_text(src, type_node)
                field_annos = _annotation_names(src, member)
                for decl in member.named_children:
                    if decl.type == "variable_declarator":
                        fn = decl.child_by_field_name("name")
                        if fn:
                            info.fields.append(FieldInfo(
                                name=_node_text(src, fn),
                                field_type=field_type,
                                annotations=field_annos,
                                line_num=member.start_point[0] + 1,
                            ))

        # Mixin/event extraction handled via regex on source text below

    # KubeJS events and Mixin targets (grep-based, since these are string patterns)
    text_str = src.decode("utf-8", errors="ignore")
    for m in _KUBEJS_EVENT_RE.finditer(text_str):
        line_num = text_str[:m.start()].count("\n") + 1
        info.events.append(EventInfo(
            name=m.group(1), line_num=line_num, kind="kubejs_event",
        ))

    # @Mixin targets from annotations
    for ci in info.classes:
        for anno in ci.annotations:
            if anno == "Mixin":
                # Parse @Mixin(TargetClass.class) from source text around the class
                class_start = ci.line_num - 1
                look_start = max(0, class_start - 5)
                look_lines = text_str.splitlines()[look_start:class_start + 1]
                look_text = "\n".join(look_lines)
                mixin_match = re.search(r'@Mixin\s*\(\s*(?:value\s*=\s*)?(\w+)\.class', look_text)
                if mixin_match:
                    info.events.append(EventInfo(
                        name=mixin_match.group(1),
                        line_num=ci.line_num,
                        kind="mixin_target",
                    ))

    # @Inject targets
    for mi in info.methods:
        if "Inject" in mi.annotations:
            inject_match = re.search(
                r'@Inject\s*\(.*?method\s*=\s*"([^"]+)"',
                text_str.splitlines()[mi.line_num - 2] if mi.line_num > 1 else "",
            )
            # Broader search: look at lines around the method
            if not inject_match:
                look_start = max(0, mi.line_num - 5)
                look_lines = text_str.splitlines()[look_start:mi.line_num]
                look_text = "\n".join(look_lines)
                inject_match = re.search(r'@Inject\s*\(.*?method\s*=\s*"([^"]+)"', look_text)
            if inject_match:
                info.events.append(EventInfo(
                    name=inject_match.group(1),
                    line_num=mi.line_num,
                    kind="inject_method",
                ))

    # @SubscribeEvent (Forge/NeoForge)
    for mi in info.methods:
        if "SubscribeEvent" in mi.annotations:
            info.events.append(EventInfo(
                name=mi.name, line_num=mi.line_num, kind="subscribe_event",
            ))

    # Limit sizes for sanity
    info.methods = info.methods[:500]
    info.fields = info.fields[:500]
    info.classes = info.classes[:100]

    return info


# ---------------------------------------------------------------------------
# Database schema
# ---------------------------------------------------------------------------
SCHEMA_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-131072;
PRAGMA mmap_size=536870912;
PRAGMA temp_store=MEMORY;

CREATE TABLE IF NOT EXISTS source_files (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    version       TEXT    NOT NULL,
    loader        TEXT    NOT NULL,
    rel_path      TEXT    NOT NULL,
    package_name  TEXT    NOT NULL DEFAULT '',
    class_name    TEXT    NOT NULL DEFAULT '',
    class_kind    TEXT    NOT NULL DEFAULT 'class',
    superclass    TEXT,
    interfaces    TEXT,
    type_params   TEXT,
    line_count    INTEGER NOT NULL DEFAULT 0,
    UNIQUE(version, loader, rel_path)
);

CREATE INDEX IF NOT EXISTS idx_sf_ver_loader    ON source_files (version, loader);
CREATE INDEX IF NOT EXISTS idx_sf_class         ON source_files (class_name);
CREATE INDEX IF NOT EXISTS idx_sf_package       ON source_files (package_name);
CREATE INDEX IF NOT EXISTS idx_sf_ver_class     ON source_files (version, loader, class_name);
CREATE INDEX IF NOT EXISTS idx_sf_superclass    ON source_files (superclass);

CREATE TABLE IF NOT EXISTS source_classes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id       INTEGER NOT NULL REFERENCES source_files(id) ON DELETE CASCADE,
    version       TEXT    NOT NULL,
    loader        TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    kind          TEXT    NOT NULL DEFAULT 'class',
    superclass    TEXT,
    interfaces    TEXT,
    type_params   TEXT,
    annotations   TEXT,
    line_num      INTEGER NOT NULL DEFAULT 0,
    end_line      INTEGER NOT NULL DEFAULT 0,
    is_inner      INTEGER NOT NULL DEFAULT 0,
    parent_class  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sc_ver_loader    ON source_classes (version, loader);
CREATE INDEX IF NOT EXISTS idx_sc_name          ON source_classes (name);
CREATE INDEX IF NOT EXISTS idx_sc_superclass    ON source_classes (superclass);
CREATE INDEX IF NOT EXISTS idx_sc_ver_name      ON source_classes (version, loader, name);

CREATE TABLE IF NOT EXISTS source_methods (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id       INTEGER NOT NULL REFERENCES source_files(id) ON DELETE CASCADE,
    version       TEXT    NOT NULL,
    loader        TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    return_type   TEXT    NOT NULL DEFAULT '',
    params        TEXT    NOT NULL DEFAULT '',
    annotations   TEXT,
    signature     TEXT    NOT NULL DEFAULT '',
    line_num      INTEGER NOT NULL DEFAULT 0,
    is_constructor INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sm_ver_loader    ON source_methods (version, loader);
CREATE INDEX IF NOT EXISTS idx_sm_name          ON source_methods (name);
CREATE INDEX IF NOT EXISTS idx_sm_file          ON source_methods (file_id);
CREATE INDEX IF NOT EXISTS idx_sm_ver_name      ON source_methods (version, loader, name);

CREATE TABLE IF NOT EXISTS source_fields (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id       INTEGER NOT NULL REFERENCES source_files(id) ON DELETE CASCADE,
    version       TEXT    NOT NULL,
    loader        TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    field_type    TEXT    NOT NULL DEFAULT '',
    annotations   TEXT,
    line_num      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sfl_ver_loader   ON source_fields (version, loader);
CREATE INDEX IF NOT EXISTS idx_sfl_name         ON source_fields (name);
CREATE INDEX IF NOT EXISTS idx_sfl_file         ON source_fields (file_id);

CREATE TABLE IF NOT EXISTS source_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id       INTEGER NOT NULL REFERENCES source_files(id) ON DELETE CASCADE,
    version       TEXT    NOT NULL,
    loader        TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    kind          TEXT    NOT NULL,
    line_num      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_se_ver_loader    ON source_events (version, loader);
CREATE INDEX IF NOT EXISTS idx_se_name          ON source_events (name);
CREATE INDEX IF NOT EXISTS idx_se_kind          ON source_events (kind);

CREATE TABLE IF NOT EXISTS source_content (
    file_id   INTEGER PRIMARY KEY REFERENCES source_files(id) ON DELETE CASCADE,
    content   TEXT NOT NULL,
    hash      TEXT NOT NULL DEFAULT ''
);

CREATE VIRTUAL TABLE IF NOT EXISTS source_fts USING fts5(
    file_id       UNINDEXED,
    version       UNINDEXED,
    loader        UNINDEXED,
    rel_path      UNINDEXED,
    class_name,
    package_name,
    superclass,
    interfaces,
    methods_text,
    fields_text,
    events_text,
    annotations_text,
    signatures_text,
    tokenize = 'porter unicode61'
);
"""


# ---------------------------------------------------------------------------
# Indexer
# ---------------------------------------------------------------------------
class SourceIndexer:
    def __init__(self, db_path: Path, rebuild: bool = False) -> None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(db_path))
        if rebuild:
            self.conn.executescript("""
                DROP TABLE IF EXISTS source_fts;
                DROP TABLE IF EXISTS source_content;
                DROP TABLE IF EXISTS source_events;
                DROP TABLE IF EXISTS source_fields;
                DROP TABLE IF EXISTS source_methods;
                DROP TABLE IF EXISTS source_classes;
                DROP TABLE IF EXISTS source_files;
            """)
        self.conn.executescript(SCHEMA_SQL)
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def index_corpus(
        self,
        corpus: Corpus,
        dry_run: bool = False,
        incremental: bool = False,
    ) -> Dict[str, int]:
        stats: Dict[str, int] = {
            "files": 0, "classes": 0, "methods": 0,
            "fields": 0, "events": 0, "skipped": 0,
        }
        batch: List[FileInfo] = []
        batch_size = 200

        for java_path in walk_java_files(corpus):
            stats["files"] += 1
            if dry_run:
                continue

            if incremental:
                rel_path = str(java_path.relative_to(corpus.source_root))
                try:
                    content = java_path.read_bytes()
                except Exception:
                    stats["skipped"] += 1
                    continue
                content_hash = hashlib.sha256(content).hexdigest()
                existing = self.conn.execute(
                    "SELECT sc.hash FROM source_content sc "
                    "JOIN source_files sf ON sf.id = sc.file_id "
                    "WHERE sf.version=? AND sf.loader=? AND sf.rel_path=?",
                    (corpus.version, corpus.loader, rel_path),
                ).fetchone()
                if existing and existing[0] == content_hash:
                    stats["skipped"] += 1
                    continue

            info = extract_file(java_path, corpus.source_root)
            if info is None:
                stats["skipped"] += 1
                continue
            batch.append(info)
            stats["classes"] += len(info.classes)
            stats["methods"] += len(info.methods)
            stats["fields"] += len(info.fields)
            stats["events"] += len(info.events)

            if len(batch) >= batch_size:
                self._flush(batch, corpus.version, corpus.loader)
                batch.clear()

        if batch and not dry_run:
            self._flush(batch, corpus.version, corpus.loader)
        if not dry_run:
            self.conn.commit()
        return stats

    def _flush(self, batch: List[FileInfo], version: str, loader: str) -> None:
        cur = self.conn.cursor()
        for info in batch:
            # Primary class (first non-inner, or first class, or filename)
            primary = next((c for c in info.classes if not c.is_inner), None)
            if primary is None and info.classes:
                primary = info.classes[0]

            class_name = primary.name if primary else Path(info.rel_path).stem
            class_kind = primary.kind if primary else "class"
            superclass = primary.superclass if primary else None
            interfaces = ",".join(primary.interfaces) if primary else None
            type_params = primary.type_params if primary else None

            cur.execute(
                """INSERT INTO source_files
                   (version, loader, rel_path, package_name, class_name, class_kind,
                    superclass, interfaces, type_params, line_count)
                   VALUES (?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(version, loader, rel_path) DO UPDATE SET
                     package_name=excluded.package_name,
                     class_name=excluded.class_name,
                     class_kind=excluded.class_kind,
                     superclass=excluded.superclass,
                     interfaces=excluded.interfaces,
                     type_params=excluded.type_params,
                     line_count=excluded.line_count
                """,
                (version, loader, info.rel_path, info.package_name,
                 class_name, class_kind, superclass, interfaces,
                 type_params, info.line_count),
            )
            file_id = cur.lastrowid
            if not file_id:
                row = cur.execute(
                    "SELECT id FROM source_files WHERE version=? AND loader=? AND rel_path=?",
                    (version, loader, info.rel_path),
                ).fetchone()
                file_id = row[0] if row else 0

            # Clear old data for this file
            for tbl in ("source_classes", "source_methods", "source_fields", "source_events", "source_fts", "source_content"):
                cur.execute(f"DELETE FROM {tbl} WHERE file_id=?", (file_id,))

            content_hash = hashlib.sha256(info.content.encode("utf-8")).hexdigest()
            cur.execute(
                "INSERT OR REPLACE INTO source_content (file_id, content, hash) VALUES (?, ?, ?)",
                (file_id, info.content, content_hash),
            )

            # Classes
            for ci in info.classes:
                cur.execute(
                    """INSERT INTO source_classes
                       (file_id, version, loader, name, kind, superclass, interfaces,
                        type_params, annotations, line_num, end_line, is_inner, parent_class)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (file_id, version, loader, ci.name, ci.kind,
                     ci.superclass, ",".join(ci.interfaces) if ci.interfaces else None,
                     ci.type_params, ",".join(ci.annotations) if ci.annotations else None,
                     ci.line_num, ci.end_line, 1 if ci.is_inner else 0, ci.parent_class),
                )

            # Methods
            for mi in info.methods:
                params_str = ", ".join(f"{t} {n}" for t, n in mi.params)
                cur.execute(
                    """INSERT INTO source_methods
                       (file_id, version, loader, name, return_type, params,
                        annotations, signature, line_num, is_constructor)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (file_id, version, loader, mi.name, mi.return_type,
                     params_str,
                     ",".join(mi.annotations) if mi.annotations else None,
                     mi.signature, mi.line_num,
                     1 if mi.is_constructor else 0),
                )

            # Fields
            for fi in info.fields:
                cur.execute(
                    """INSERT INTO source_fields
                       (file_id, version, loader, name, field_type, annotations, line_num)
                       VALUES (?,?,?,?,?,?,?)""",
                    (file_id, version, loader, fi.name, fi.field_type,
                     ",".join(fi.annotations) if fi.annotations else None,
                     fi.line_num),
                )

            # Events
            for ev in info.events:
                cur.execute(
                    """INSERT INTO source_events
                       (file_id, version, loader, name, kind, line_num)
                       VALUES (?,?,?,?,?,?)""",
                    (file_id, version, loader, ev.name, ev.kind, ev.line_num),
                )

            # FTS5 row
            all_class_names = " ".join(c.name for c in info.classes)
            all_superclasses = " ".join(c.superclass for c in info.classes if c.superclass)
            all_interfaces = " ".join(
                iface for c in info.classes for iface in c.interfaces
            )
            methods_text = " ".join(m.name for m in info.methods)
            fields_text = " ".join(f.name for f in info.fields)
            events_text = " ".join(e.name for e in info.events)
            all_annos = " ".join(
                a for c in info.classes for a in c.annotations
            ) + " " + " ".join(
                a for m in info.methods for a in m.annotations
            )
            sigs_text = " ".join(m.signature for m in info.methods[:50])

            cur.execute(
                """INSERT INTO source_fts
                   (file_id, version, loader, rel_path, class_name, package_name,
                    superclass, interfaces, methods_text, fields_text, events_text,
                    annotations_text, signatures_text)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (file_id, version, loader, info.rel_path,
                 all_class_names, info.package_name,
                 all_superclasses, all_interfaces,
                 methods_text, fields_text, events_text,
                 all_annos.strip(), sigs_text),
            )

        self.conn.commit()

    def optimize(self) -> None:
        try:
            self.conn.execute("INSERT INTO source_fts(source_fts) VALUES('optimize')")
            self.conn.commit()
        except sqlite3.OperationalError:
            pass

    def print_stats(self) -> None:
        fc = self.conn.execute("SELECT COUNT(*) FROM source_files").fetchone()[0]
        cc = self.conn.execute("SELECT COUNT(*) FROM source_classes").fetchone()[0]
        mc = self.conn.execute("SELECT COUNT(*) FROM source_methods").fetchone()[0]
        flc = self.conn.execute("SELECT COUNT(*) FROM source_fields").fetchone()[0]
        ec = self.conn.execute("SELECT COUNT(*) FROM source_events").fetchone()[0]
        fts = self.conn.execute("SELECT COUNT(*) FROM source_fts").fetchone()[0]
        print(f"\n  Database totals:")
        print(f"    source_files:   {fc:>8,}")
        print(f"    source_classes: {cc:>8,}")
        print(f"    source_methods: {mc:>8,}")
        print(f"    source_fields:  {flc:>8,}")
        print(f"    source_events:  {ec:>8,}")
        print(f"    source_fts:     {fts:>8,}")
        print()

        by_vl = self.conn.execute(
            "SELECT version, loader, COUNT(*) FROM source_files "
            "GROUP BY version, loader ORDER BY version, loader"
        ).fetchall()
        print("  Files by version/loader:")
        for v, l, n in by_vl:
            print(f"    {v:12s} / {l:12s}: {n:>6,}")

        # Method stats
        mc_by_kind = self.conn.execute(
            "SELECT is_constructor, COUNT(*) FROM source_methods GROUP BY is_constructor"
        ).fetchall()
        for is_ctor, cnt in mc_by_kind:
            label = "constructors" if is_ctor else "methods"
            print(f"\n  {label}: {cnt:,}")

        # Event stats
        ev_by_kind = self.conn.execute(
            "SELECT kind, COUNT(*) FROM source_events GROUP BY kind ORDER BY COUNT(*) DESC"
        ).fetchall()
        if ev_by_kind:
            print("\n  Events by kind:")
            for kind, cnt in ev_by_kind:
                print(f"    {kind:20s}: {cnt:>6,}")

        # Top superclasses
        top_sc = self.conn.execute(
            "SELECT superclass, COUNT(*) AS n FROM source_classes "
            "WHERE superclass IS NOT NULL GROUP BY superclass ORDER BY n DESC LIMIT 15"
        ).fetchall()
        if top_sc:
            print("\n  Top superclasses:")
            for sc, cnt in top_sc:
                print(f"    {sc:40s}: {cnt:>6,}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(
        description="Index Java sources into SQLite using tree-sitter AST parsing"
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--rebuild", action="store_true")
    parser.add_argument("--incremental", action="store_true")
    parser.add_argument("--version", help="Filter: only this MC version")
    parser.add_argument("--loader", help="Filter: only this loader")
    parser.add_argument("--db", default=str(SOURCES_DB))
    args = parser.parse_args()

    corpora = discover_corpora(SOURCES_ROOT, args.version, args.loader)
    if not corpora:
        print("No source corpora found.")
        return 1

    total_est = 0
    print("Corpora to index:")
    for c in corpora:
        n = sum(1 for _ in walk_java_files(c))
        total_est += n
        print(f"  {c.version:12s} / {c.loader:12s}: {n:>6,} files")
    print(f"\n  Total: {total_est:,} Java files")

    if args.dry_run:
        print("DRY RUN — no database written.")
        return 0

    print(f"\nBuilding index → {args.db}")
    if args.rebuild:
        print("  (--rebuild: dropping existing tables)")
    if args.incremental and not args.rebuild:
        print("  (--incremental: hashing files and skipping unchanged content)")

    indexer = SourceIndexer(Path(args.db), rebuild=args.rebuild)
    t0 = time.time()

    for corpus in corpora:
        label = f"{corpus.version}/{corpus.loader}"
        sys.stdout.write(f"  {label:28s} ... ")
        sys.stdout.flush()
        ct0 = time.time()
        stats = indexer.index_corpus(
            corpus,
            incremental=args.incremental and not args.rebuild,
        )
        elapsed = time.time() - ct0
        sys.stdout.write(
            f"{stats['files']:>6,} files  "
            f"{stats['classes']:>6,} cls  "
            f"{stats['methods']:>7,} meth  "
            f"{stats['fields']:>7,} fld  "
            f"({elapsed:.1f}s)\n"
        )
        sys.stdout.flush()

    print(f"\nOptimizing FTS5 index...")
    indexer.optimize()

    total_time = time.time() - t0
    print(f"Total time: {total_time:.1f}s")
    indexer.print_stats()
    indexer.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
