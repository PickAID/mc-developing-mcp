#!/usr/bin/env python3
# pyright: basic
"""Source-only MCP server for Minecraft Java corpora.

Protocol: newline-delimited JSON-RPC on stdin/stdout.

Configuration:
  1. config.json in the project root (parent of mcp_server/)
  2. MC_MCP_CONFIG env var — path to an alternate config file
  3. MC_MCP_MODE env var — "minimal" | "balanced" | "performance" (overrides mode key)
  Built-in defaults apply if no config is found (equivalent to "balanced").
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from collections import OrderedDict
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES_ROOT = ROOT / "sources"
DATA_DIR = ROOT / "data"
SOURCES_DB = DATA_DIR / "minecraft_sources.sqlite"
DOCS_DB = DATA_DIR / "minecraft_docs.sqlite"
WORKSPACE = ROOT / "references" / "workspace"
CONTROL_FILE = WORKSPACE / "control.json"


# ---------------------------------------------------------------------------
# Performance configuration
# ---------------------------------------------------------------------------

@dataclass
class ServerConfig:
    """Tunable performance parameters. All sizes in bytes unless noted."""
    # SQLite page cache (negative = KiB, passed directly to PRAGMA cache_size)
    sources_cache_kib: int = -131072   # 128 MiB
    sources_mmap_bytes: int = 536870912  # 512 MiB
    docs_cache_kib: int = -65536       # 64 MiB
    docs_mmap_bytes: int = 268435456   # 256 MiB
    # sqlite3 module statement cache
    cached_statements: int = 512
    # Prepared-statement pool inside MCPServer
    stmt_pool_limit: int = 256
    # LRU caches (entry count)
    lru_find_class: int = 4096
    lru_class_detail: int = 2048
    lru_source: int = 8192
    lru_hierarchy: int = 2048
    # Query limits
    max_search_results: int = 200
    max_list_package: int = 1000
    max_search_docs: int = 100


_PROFILES: dict[str, dict] = {
    "minimal": {
        # For constrained machines (RAM < 4 GB)
        "sources_cache_kib": -16384,     # 16 MiB
        "sources_mmap_bytes": 134217728, # 128 MiB
        "docs_cache_kib": -8192,         # 8 MiB
        "docs_mmap_bytes": 67108864,     # 64 MiB
        "cached_statements": 128,
        "stmt_pool_limit": 64,
        "lru_find_class": 512,
        "lru_class_detail": 256,
        "lru_source": 1024,
        "lru_hierarchy": 256,
        "max_search_results": 50,
        "max_list_package": 500,
        "max_search_docs": 50,
    },
    "balanced": {},  # all defaults
    "performance": {
        # For high-end workstations (RAM >= 16 GB)
        "sources_cache_kib": -524288,    # 512 MiB
        "sources_mmap_bytes": 2147483648, # 2 GiB
        "docs_cache_kib": -131072,       # 128 MiB
        "docs_mmap_bytes": 536870912,    # 512 MiB
        "cached_statements": 1024,
        "stmt_pool_limit": 1024,
        "lru_find_class": 16384,
        "lru_class_detail": 8192,
        "lru_source": 32768,
        "lru_hierarchy": 8192,
        "max_search_results": 500,
        "max_list_package": 2000,
        "max_search_docs": 200,
    },
}


def _load_config() -> ServerConfig:
    """Load config from file + env vars. File → profile → per-key overrides → env mode."""
    # 1. Locate config file
    config_path_env = os.environ.get("MC_MCP_CONFIG", "").strip()
    if config_path_env:
        cfg_file = Path(config_path_env)
    else:
        cfg_file = ROOT / "config.json"

    raw: dict = {}
    if cfg_file.exists():
        try:
            with cfg_file.open("r", encoding="utf-8") as f:
                raw = json.load(f)
        except Exception:
            raw = {}

    # 2. Apply mode preset (env var wins over config file key)
    mode = os.environ.get("MC_MCP_MODE", "").strip().lower() or str(raw.get("mode", "balanced")).lower()
    if mode not in _PROFILES:
        mode = "balanced"
    params: dict = dict(_PROFILES[mode])  # copy preset (empty dict = defaults for balanced)

    # 3. Apply per-key overrides from config file (override mode preset)
    _int_keys = {
        "sources_cache_kib", "sources_mmap_bytes", "docs_cache_kib", "docs_mmap_bytes",
        "cached_statements", "stmt_pool_limit", "lru_find_class", "lru_class_detail",
        "lru_source", "lru_hierarchy", "max_search_results", "max_list_package", "max_search_docs",
    }
    for key in _int_keys:
        if key in raw:
            try:
                params[key] = int(raw[key])
            except (TypeError, ValueError):
                pass

    cfg = ServerConfig()
    for key, val in params.items():
        if hasattr(cfg, key):
            setattr(cfg, key, val)
    return cfg


_CONFIG = _load_config()

_SUPPORTED_PROTOCOL_VERSIONS = ("2025-06-18", "2024-11-05")

_TOOL_SCHEMAS: dict[str, dict[str, object]] = {
    "versions": {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    },
    "search": {
        "type": "object",
        "properties": {
            "version": {"type": "string"},
            "loader": {"type": "string"},
            "query": {"type": "string"},
            "limit": {"type": "integer"},
        },
        "required": ["version", "loader", "query"],
        "additionalProperties": False,
    },
    "search_docs": {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "library": {"type": "string"},
            "version": {"type": "string"},
            "limit": {"type": "integer"},
        },
        "required": ["query"],
        "additionalProperties": False,
    },
    "read_doc": {
        "type": "object",
        "properties": {
            "id": {"type": "integer"},
        },
        "required": ["id"],
        "additionalProperties": False,
    },
    "find_class": {
        "type": "object",
        "properties": {
            "version": {"type": "string"},
            "loader": {"type": "string"},
            "class_name": {"type": "string"},
        },
        "required": ["version", "loader", "class_name"],
        "additionalProperties": False,
    },
    "get_class_detail": {
        "type": "object",
        "properties": {
            "version": {"type": "string"},
            "loader": {"type": "string"},
            "class_name": {"type": "string"},
        },
        "required": ["version", "loader", "class_name"],
        "additionalProperties": False,
    },
    "get_hierarchy": {
        "type": "object",
        "properties": {
            "version": {"type": "string"},
            "loader": {"type": "string"},
            "class_name": {"type": "string"},
        },
        "required": ["version", "loader", "class_name"],
        "additionalProperties": False,
    },
    "find_implementations": {
        "type": "object",
        "properties": {
            "version": {"type": "string"},
            "loader": {"type": "string"},
            "interface_or_class": {"type": "string"},
        },
        "required": ["version", "loader", "interface_or_class"],
        "additionalProperties": False,
    },
    "read_source": {
        "type": "object",
        "properties": {
            "version": {"type": "string"},
            "loader": {"type": "string"},
            "path": {"type": "string"},
            "start": {"type": "integer"},
            "end": {"type": "integer"},
        },
        "required": ["version", "loader", "path"],
        "additionalProperties": False,
    },
    "list_package": {
        "type": "object",
        "properties": {
            "version": {"type": "string"},
            "loader": {"type": "string"},
            "package_prefix": {"type": "string"},
            "limit": {"type": "integer"},
        },
        "required": ["version", "loader", "package_prefix"],
        "additionalProperties": False,
    },
}


@dataclass(frozen=True)
class CorpusInfo:
    version: str
    loader: str
    source_root: Path


def load_json(path: Path) -> dict[str, object]:
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)
    return data if isinstance(data, dict) else {}


def load_corpora() -> dict[tuple[str, str], CorpusInfo]:
    corpora: dict[tuple[str, str], CorpusInfo] = {}
    if not CONTROL_FILE.exists():
        return corpora
    data = load_json(CONTROL_FILE)
    corpora_obj = data.get("corpora")
    if not isinstance(corpora_obj, dict):
        return corpora
    for version, loaders_obj in corpora_obj.items():
        if not isinstance(loaders_obj, dict):
            continue
        for loader, meta_obj in loaders_obj.items():
            if not isinstance(meta_obj, dict):
                continue
            source_root_obj = meta_obj.get("source_root")
            if not isinstance(source_root_obj, str) or not source_root_obj.strip():
                continue
            root_path = Path(source_root_obj)
            if not root_path.is_absolute():
                root_path = ROOT / root_path
            corpora[(str(version), str(loader))] = CorpusInfo(
                version=str(version),
                loader=str(loader),
                source_root=root_path.resolve(),
            )
    return corpora


def _fts5_escape(query: str) -> str:
    tokens = [tok.strip() for tok in query.split() if tok.strip()]
    return " OR ".join(f'"{tok.replace(chr(34), "")}"' for tok in tokens)


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


@lru_cache(maxsize=256)
def _normalize_sql(sql: str) -> str:
    return " ".join(sql.split())


class _LRUCache:
    def __init__(self, maxsize: int = 4096):
        self._cache: OrderedDict[str, object] = OrderedDict()
        self._maxsize = maxsize

    def get(self, key: str) -> object | None:
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        return None

    def put(self, key: str, value: object) -> None:
        if key in self._cache:
            self._cache.move_to_end(key)
        self._cache[key] = value
        if len(self._cache) > self._maxsize:
            self._cache.popitem(last=False)


_EMPTY_RESULT: dict[str, object] = {}


class MCPServer:
    def __init__(self, config: ServerConfig = _CONFIG) -> None:
        self._config = config
        self.corpora: dict[tuple[str, str], CorpusInfo] = load_corpora()
        self.conn: sqlite3.Connection | None = None
        self.docs_conn: sqlite3.Connection | None = None
        self._stmt_pool: OrderedDict[str, sqlite3.Cursor] = OrderedDict()
        self._stmt_pool_limit = config.stmt_pool_limit
        try:
            self.conn = sqlite3.connect(
                f"file:{SOURCES_DB}?mode=rw",
                uri=True,
                cached_statements=config.cached_statements,
            )
            self.conn.row_factory = sqlite3.Row
            self.conn.execute(f"PRAGMA cache_size={config.sources_cache_kib}")
            self.conn.execute(f"PRAGMA mmap_size={config.sources_mmap_bytes}")
            self.conn.execute("PRAGMA temp_store=MEMORY")
            self.conn.execute("PRAGMA query_only=ON")
        except sqlite3.Error:
            self.conn = None
        try:
            if DOCS_DB.exists():
                self.docs_conn = sqlite3.connect(f"file:{DOCS_DB}?mode=ro", uri=True)
                self.docs_conn.row_factory = sqlite3.Row
                self.docs_conn.execute(f"PRAGMA cache_size={config.docs_cache_kib}")
                self.docs_conn.execute(f"PRAGMA mmap_size={config.docs_mmap_bytes}")
                self.docs_conn.execute("PRAGMA temp_store=MEMORY")
        except sqlite3.Error:
            self.docs_conn = None
        self._cache: dict[str, object] = {}
        self._find_class_cache = _LRUCache(config.lru_find_class)
        self._class_detail_cache = _LRUCache(config.lru_class_detail)
        self._source_cache = _LRUCache(config.lru_source)
        self._hierarchy_cache = _LRUCache(config.lru_hierarchy)
        self._initialized = False

    def _invalidate_statement(self, sql: str) -> None:
        key = _normalize_sql(sql)
        cursor = self._stmt_pool.pop(key, None)
        if cursor is not None:
            try:
                cursor.close()
            except sqlite3.Error:
                pass

    def _get_statement_cursor(self, sql: str) -> sqlite3.Cursor | None:
        if self.conn is None:
            return None
        key = _normalize_sql(sql)
        cursor = self._stmt_pool.get(key)
        if cursor is not None:
            self._stmt_pool.move_to_end(key)
            return cursor
        try:
            cursor = self.conn.cursor()
        except sqlite3.Error:
            return None
        self._stmt_pool[key] = cursor
        if len(self._stmt_pool) > self._stmt_pool_limit:
            _, old_cursor = self._stmt_pool.popitem(last=False)
            try:
                old_cursor.close()
            except sqlite3.Error:
                pass
        return cursor

    def _require_param(self, params: dict[str, object], name: str) -> str:
        value = params.get(name)
        if value is None:
            raise ValueError(f"{name} is required")
        text = str(value).strip()
        if not text:
            raise ValueError(f"{name} is required")
        return text

    def _require_version_loader(self, params: dict[str, object]) -> tuple[str, str]:
        return self._require_param(params, "version"), self._require_param(params, "loader")

    def _coerce_int(self, value: object, default: int) -> int:
        if value is None:
            return default
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int):
            return value
        if isinstance(value, str):
            try:
                return int(value)
            except ValueError:
                return default
        return default

    def _parse_limit(self, value: object, default: int, max_value: int) -> int:
        limit = self._coerce_int(value, default)
        if limit < 1:
            return 1
        return min(limit, max_value)

    def _rows(self, sql: str, args: tuple[object, ...]) -> list[sqlite3.Row]:
        cursor = self._get_statement_cursor(sql)
        if cursor is None:
            return []
        try:
            return cursor.execute(sql, args).fetchall()
        except sqlite3.Error:
            self._invalidate_statement(sql)
            return []

    def _row(self, sql: str, args: tuple[object, ...]) -> sqlite3.Row | None:
        cursor = self._get_statement_cursor(sql)
        if cursor is None:
            return None
        try:
            return cursor.execute(sql, args).fetchone()
        except sqlite3.Error:
            self._invalidate_statement(sql)
            return None

    def _doc_rows(self, sql: str, args: tuple[object, ...]) -> list[sqlite3.Row]:
        if self.docs_conn is None:
            return []
        try:
            return self.docs_conn.execute(sql, args).fetchall()
        except sqlite3.Error:
            return []

    def _doc_row(self, sql: str, args: tuple[object, ...]) -> sqlite3.Row | None:
        if self.docs_conn is None:
            return None
        try:
            return self.docs_conn.execute(sql, args).fetchone()
        except sqlite3.Error:
            return None

    def _get_source_root(self, version: str, loader: str) -> Path | None:
        info = self.corpora.get((version, loader))
        return info.source_root if info else None

    def _safe_source_path(self, source_root: Path, rel_path: str) -> Path:
        full = (source_root / rel_path).resolve()
        try:
            _ = full.relative_to(source_root)
        except ValueError as exc:
            raise ValueError("path escapes source root") from exc
        return full

    def _find_file_for_class(self, version: str, loader: str, class_name: str) -> sqlite3.Row | None:
        sql = (
            "SELECT id, rel_path, package_name, class_name, class_kind, superclass, "
            "interfaces, type_params, line_count FROM source_files "
            "WHERE version=? AND loader=? AND class_name=? LIMIT 1"
        )
        return self._row(sql, (version, loader, class_name))

    def _find_class_row(self, version: str, loader: str, class_name: str) -> sqlite3.Row | None:
        sql = (
            "SELECT name, kind, superclass, interfaces, type_params, annotations, "
            "line_num, end_line, is_inner, parent_class FROM source_classes "
            "WHERE version=? AND loader=? AND name=? ORDER BY is_inner ASC, line_num ASC LIMIT 1"
        )
        row = self._row(sql, (version, loader, class_name))
        if row is not None:
            return row
        file_row = self._find_file_for_class(version, loader, class_name)
        if file_row is None:
            return None
        file_id = int(file_row["id"])
        sql = (
            "SELECT name, kind, superclass, interfaces, type_params, annotations, "
            "line_num, end_line, is_inner, parent_class FROM source_classes "
            "WHERE file_id=? ORDER BY is_inner ASC, line_num ASC LIMIT 1"
        )
        return self._row(sql, (file_id,))

    def _search_fts(self, version: str, loader: str, escaped_query: str, limit: int) -> list[dict[str, object]]:
        sql = (
            "SELECT rel_path, class_name, package_name, superclass, bm25(source_fts) AS rank "
            "FROM source_fts WHERE source_fts MATCH ? AND version=? AND loader=? ORDER BY rank LIMIT ?"
        )
        rows = self._rows(sql, (escaped_query, version, loader, limit))
        return [
            {
                "rel_path": row["rel_path"],
                "class_name": row["class_name"],
                "package_name": row["package_name"],
                "superclass": row["superclass"],
                "rank": row["rank"],
            }
            for row in rows
        ]

    def _search_fts_third_party(self, escaped_query: str, limit: int) -> list[dict[str, object]]:
        sql = (
            "SELECT rel_path, class_name, package_name, superclass, bm25(source_fts) AS rank "
            "FROM source_fts WHERE source_fts MATCH ? AND version='third_party' ORDER BY rank LIMIT ?"
        )
        rows = self._rows(sql, (escaped_query, limit))
        return [
            {
                "rel_path": row["rel_path"],
                "class_name": row["class_name"],
                "package_name": row["package_name"],
                "superclass": row["superclass"],
                "rank": row["rank"],
            }
            for row in rows
        ]

    def versions(self, params: dict[str, object]) -> list[dict[str, object]]:
        del params
        rows = self._rows(
            "SELECT version, loader, COUNT(*) AS file_count FROM source_files GROUP BY version, loader ORDER BY version, loader",
            (),
        )
        return [{"version": r["version"], "loader": r["loader"], "file_count": r["file_count"]} for r in rows]

    def search(self, params: dict[str, object]) -> list[dict[str, object]]:
        version, loader = self._require_version_loader(params)
        query = self._require_param(params, "query")
        limit = self._parse_limit(params.get("limit"), 20, self._config.max_search_results)
        escaped_query = _fts5_escape(query)
        if not escaped_query:
            return []
        primary = self._search_fts(version, loader, escaped_query, limit)
        if len(primary) >= 3:
            return primary
        fallback = self._search_fts_third_party(escaped_query, limit)
        combined: list[dict[str, object]] = []
        seen: set[tuple[str, str]] = set()
        for row in primary + fallback:
            key = (str(row.get("rel_path", "")), str(row.get("class_name", "")))
            if key in seen:
                continue
            seen.add(key)
            combined.append(row)
            if len(combined) >= limit:
                break
        return combined

    def search_docs(self, params: dict[str, object]) -> list[dict[str, object]]:
        """Search documentation by keyword. Params: query (required), library (optional), version (optional), limit (optional)."""
        query = self._require_param(params, "query")
        limit = self._parse_limit(params.get("limit"), 20, self._config.max_search_docs)
        escaped = _fts5_escape(query)
        if not escaped:
            return []

        library = params.get("library")
        version = params.get("version")

        if library and version:
            sql = (
                "SELECT dp.id, dp.library, dp.version, dp.category, dp.slug, dp.title, "
                "snippet(doc_fts, 4, '<b>', '</b>', '...', 40) AS snippet, bm25(doc_fts) AS rank "
                "FROM doc_fts JOIN doc_pages dp ON dp.id = doc_fts.doc_id "
                "WHERE doc_fts MATCH ? AND dp.library=? AND dp.version=? ORDER BY rank LIMIT ?"
            )
            rows = self._doc_rows(sql, (escaped, str(library), str(version), limit))
        elif library:
            sql = (
                "SELECT dp.id, dp.library, dp.version, dp.category, dp.slug, dp.title, "
                "snippet(doc_fts, 4, '<b>', '</b>', '...', 40) AS snippet, bm25(doc_fts) AS rank "
                "FROM doc_fts JOIN doc_pages dp ON dp.id = doc_fts.doc_id "
                "WHERE doc_fts MATCH ? AND dp.library=? ORDER BY rank LIMIT ?"
            )
            rows = self._doc_rows(sql, (escaped, str(library), limit))
        else:
            sql = (
                "SELECT dp.id, dp.library, dp.version, dp.category, dp.slug, dp.title, "
                "snippet(doc_fts, 4, '<b>', '</b>', '...', 40) AS snippet, bm25(doc_fts) AS rank "
                "FROM doc_fts JOIN doc_pages dp ON dp.id = doc_fts.doc_id "
                "WHERE doc_fts MATCH ? ORDER BY rank LIMIT ?"
            )
            rows = self._doc_rows(sql, (escaped, limit))

        return [
            {
                "id": row["id"],
                "library": row["library"],
                "version": row["version"],
                "category": row["category"],
                "slug": row["slug"],
                "title": row["title"],
                "snippet": row["snippet"],
                "rank": row["rank"],
            }
            for row in rows
        ]

    def read_doc(self, params: dict[str, object]) -> dict[str, object]:
        """Read a doc page. Params: id (int, from search_docs results)."""
        doc_id = self._coerce_int(params.get("id"), 0)
        if doc_id <= 0:
            raise ValueError("id is required (positive integer)")
        row = self._doc_row(
            "SELECT library, version, category, slug, title, content, format, source_url "
            "FROM doc_pages WHERE id=?",
            (doc_id,),
        )
        if row is None:
            return {}
        return {
            "library": row["library"],
            "version": row["version"],
            "category": row["category"],
            "slug": row["slug"],
            "title": row["title"],
            "content": row["content"],
            "format": row["format"],
            "source_url": row["source_url"],
        }

    def find_class(self, params: dict[str, object]) -> dict[str, object]:
        version, loader = self._require_version_loader(params)
        class_name = self._require_param(params, "class_name")
        cache_key = f"fc:{version}:{loader}:{class_name}"
        cached = self._find_class_cache.get(cache_key)
        if cached is not None:
            if cached is _EMPTY_RESULT:
                return {}
            if isinstance(cached, dict):
                return cached
            return {}
        sql = (
            "SELECT rel_path, package_name, class_kind, superclass, interfaces, type_params, line_count "
            "FROM source_files WHERE version=? AND loader=? AND class_name=? LIMIT 1"
        )
        row = self._row(sql, (version, loader, class_name))
        if row is None:
            sql = (
                "SELECT rel_path, package_name, class_kind, superclass, interfaces, type_params, line_count "
                "FROM source_files WHERE version='third_party' AND class_name=? LIMIT 1"
            )
            row = self._row(sql, (class_name,))
        if row is None:
            self._find_class_cache.put(cache_key, _EMPTY_RESULT)
            return {}
        result = {
            "rel_path": row["rel_path"],
            "package_name": row["package_name"],
            "class_kind": row["class_kind"],
            "superclass": row["superclass"],
            "interfaces": row["interfaces"],
            "type_params": row["type_params"],
            "line_count": row["line_count"],
        }
        self._find_class_cache.put(cache_key, result)
        return result

    def get_class_detail(self, params: dict[str, object]) -> dict[str, object]:
        version, loader = self._require_version_loader(params)
        class_name = self._require_param(params, "class_name")
        cache_key = f"cd:{version}:{loader}:{class_name}"
        cached = self._class_detail_cache.get(cache_key)
        if cached is not None:
            if isinstance(cached, dict):
                return cached
            return {"classes": [], "methods": [], "fields": [], "events": []}
        file_row = self._find_file_for_class(version, loader, class_name)
        if file_row is None:
            empty_result: dict[str, object] = {"classes": [], "methods": [], "fields": [], "events": []}
            self._class_detail_cache.put(cache_key, empty_result)
            return empty_result
        file_id = int(file_row["id"])
        class_rows = self._rows(
            "SELECT name, kind, superclass, interfaces, type_params, annotations, line_num, end_line, is_inner, parent_class FROM source_classes WHERE file_id=? ORDER BY line_num",
            (file_id,),
        )
        method_rows = self._rows(
            "SELECT name, return_type, params, annotations, signature, line_num, is_constructor FROM source_methods WHERE file_id=? ORDER BY line_num",
            (file_id,),
        )
        field_rows = self._rows(
            "SELECT name, field_type, annotations, line_num FROM source_fields WHERE file_id=? ORDER BY line_num",
            (file_id,),
        )
        event_rows = self._rows(
            "SELECT name, kind, line_num FROM source_events WHERE file_id=? ORDER BY line_num",
            (file_id,),
        )
        result: dict[str, object] = {
            "rel_path": file_row["rel_path"],
            "package_name": file_row["package_name"],
            "class_name": file_row["class_name"],
            "classes": [dict(r) for r in class_rows],
            "methods": [dict(r) for r in method_rows],
            "fields": [dict(r) for r in field_rows],
            "events": [dict(r) for r in event_rows],
        }
        self._class_detail_cache.put(cache_key, result)
        return result

    def get_hierarchy(self, params: dict[str, object]) -> dict[str, object]:
        version, loader = self._require_version_loader(params)
        class_name = self._require_param(params, "class_name")
        cache_key = f"gh:{version}:{loader}:{class_name}"
        cached = self._hierarchy_cache.get(cache_key)
        if cached is not None:
            if isinstance(cached, dict):
                return cached
            return {"class_name": class_name, "extends_chain": [], "implements": []}
        current = self._find_class_row(version, loader, class_name)
        if current is None:
            result = {"class_name": class_name, "extends_chain": [], "implements": []}
            self._hierarchy_cache.put(cache_key, result)
            return result
        extends_chain: list[str] = []
        implements: list[str] = []
        seen_supers: set[str] = set()
        seen_ifaces: set[str] = set()
        while current is not None:
            for iface in _split_csv(current["interfaces"]):
                if iface not in seen_ifaces:
                    seen_ifaces.add(iface)
                    implements.append(iface)
            superclass = current["superclass"]
            if not superclass:
                break
            superclass_name = str(superclass).strip()
            if not superclass_name or superclass_name in seen_supers:
                break
            seen_supers.add(superclass_name)
            extends_chain.append(superclass_name)
            current = self._find_class_row(version, loader, superclass_name)
        result = {"class_name": class_name, "extends_chain": extends_chain, "implements": implements}
        self._hierarchy_cache.put(cache_key, result)
        return result

    def find_implementations(self, params: dict[str, object]) -> list[dict[str, object]]:
        version, loader = self._require_version_loader(params)
        target = self._require_param(params, "interface_or_class")
        rows = self._rows(
            "SELECT sc.name, sc.kind, sf.rel_path, sc.superclass, sc.interfaces "
            "FROM source_classes sc JOIN source_files sf ON sf.id=sc.file_id "
            "WHERE sc.version=? AND sc.loader=? AND (sc.superclass=? OR sc.interfaces LIKE ?) "
            "ORDER BY sc.name, sf.rel_path",
            (version, loader, target, f"%{target}%"),
        )
        return [
            {
                "name": row["name"],
                "kind": row["kind"],
                "rel_path": row["rel_path"],
                "superclass": row["superclass"],
                "interfaces": row["interfaces"],
            }
            for row in rows
        ]

    def read_source(self, params: dict[str, object]) -> dict[str, object]:
        version, loader = self._require_version_loader(params)
        rel_path = self._require_param(params, "path")
        start = max(1, self._coerce_int(params.get("start"), 1))
        end = self._coerce_int(params.get("end"), 200)
        if end < start:
            end = start
        cache_key = f"rs:{version}:{loader}:{rel_path}:{start}:{end}"
        cached = self._source_cache.get(cache_key)
        if cached is not None:
            if isinstance(cached, dict):
                return cached
            return {"content": "", "total_lines": 0, "path": rel_path}

        row = self._row(
            "SELECT sc.content FROM source_content sc "
            "JOIN source_files sf ON sf.id = sc.file_id "
            "WHERE sf.version=? AND sf.loader=? AND sf.rel_path=?",
            (version, loader, rel_path),
        )
        if row is not None:
            lines = str(row["content"]).splitlines()
            clamped_end = min(end, len(lines))
            content = "" if start > len(lines) else "\n".join(lines[start - 1 : clamped_end])
            result = {"content": content, "total_lines": len(lines), "path": rel_path}
            self._source_cache.put(cache_key, result)
            return result

        source_root = self._get_source_root(version, loader)
        if source_root is None:
            raise ValueError(f"No corpus configured for {version}/{loader}")
        source_path = self._safe_source_path(source_root, rel_path)
        if not source_path.exists() or not source_path.is_file():
            raise ValueError(f"Source file not found: {rel_path}")
        lines = source_path.read_text(encoding="utf-8", errors="replace").splitlines()
        clamped_end = min(end, len(lines))
        content = "" if start > len(lines) else "\n".join(lines[start - 1 : clamped_end])
        result = {"content": content, "total_lines": len(lines), "path": str(source_path)}
        self._source_cache.put(cache_key, result)
        return result

    def list_package(self, params: dict[str, object]) -> list[dict[str, object]]:
        version, loader = self._require_version_loader(params)
        package_prefix = self._require_param(params, "package_prefix")
        limit = self._parse_limit(params.get("limit"), 100, self._config.max_list_package)
        rows = self._rows(
            "SELECT class_name, class_kind, rel_path, superclass, line_count FROM source_files "
            "WHERE version=? AND loader=? AND package_name LIKE ? "
            "ORDER BY package_name, class_name LIMIT ?",
            (version, loader, f"{package_prefix}%", limit),
        )
        return [
            {
                "class_name": row["class_name"],
                "class_kind": row["class_kind"],
                "rel_path": row["rel_path"],
                "superclass": row["superclass"],
                "line_count": row["line_count"],
            }
            for row in rows
        ]

    def initialize(self, params: dict[str, object]) -> dict[str, object]:
        requested_obj = params.get("protocolVersion")
        requested = str(requested_obj).strip() if requested_obj is not None else ""
        if requested in _SUPPORTED_PROTOCOL_VERSIONS:
            protocol_version = requested
        else:
            protocol_version = _SUPPORTED_PROTOCOL_VERSIONS[0]
        self._initialized = True
        return {
            "protocolVersion": protocol_version,
            "capabilities": {
                "tools": {
                    "listChanged": False,
                }
            },
            "serverInfo": {
                "name": "minecraft-mcp-service",
                "version": "0.0.6",
            },
        }

    def notifications_initialized(self, params: dict[str, object]) -> None:
        del params
        self._initialized = True
        return None

    def ping(self, params: dict[str, object]) -> dict[str, object]:
        del params
        return {}

    def tools_list(self, params: dict[str, object]) -> dict[str, object]:
        del params
        tools: list[dict[str, object]] = []
        descriptions = {
            "versions": "List available version/loader corpora and indexed file counts.",
            "search": "Full-text search source classes by version/loader/query.",
            "search_docs": "Search indexed Minecraft/KubeJS documentation.",
            "read_doc": "Read one documentation page by search result id.",
            "find_class": "Find one class by exact class_name in a version/loader.",
            "get_class_detail": "Return classes/methods/fields/events for one class file.",
            "get_hierarchy": "Get extends chain and implemented interfaces for a class.",
            "find_implementations": "Find classes extending/implementing an interface or base.",
            "read_source": "Read source lines by version/loader/path with optional range.",
            "list_package": "List classes under a package prefix.",
        }
        for name, schema in _TOOL_SCHEMAS.items():
            tools.append(
                {
                    "name": name,
                    "description": descriptions.get(name, ""),
                    "inputSchema": schema,
                }
            )
        return {"tools": tools}

    def tools_call(self, params: dict[str, object]) -> dict[str, object]:
        name = self._require_param(params, "name")
        arguments_obj = params.get("arguments")
        arguments = arguments_obj if isinstance(arguments_obj, dict) else {}
        try:
            result = self._dispatch(name, arguments)
            return {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(result, ensure_ascii=False),
                    }
                ],
                "structuredContent": result,
                "isError": False,
            }
        except Exception as exc:
            return {
                "content": [{"type": "text", "text": str(exc)}],
                "isError": True,
            }

    def _dispatch(self, method: str, params: dict[str, object]) -> object:
        handlers: dict[str, object] = {
            "versions": self.versions,
            "search": self.search,
            "search_docs": self.search_docs,
            "read_doc": self.read_doc,
            "find_class": self.find_class,
            "get_class_detail": self.get_class_detail,
            "get_hierarchy": self.get_hierarchy,
            "find_implementations": self.find_implementations,
            "read_source": self.read_source,
            "list_package": self.list_package,
            "initialize": self.initialize,
            "ping": self.ping,
            "tools/list": self.tools_list,
            "tools/call": self.tools_call,
            "notifications/initialized": self.notifications_initialized,
        }
        handler_obj = handlers.get(method)
        if handler_obj is None:
            raise LookupError(f"Unknown method: {method!r}")
        if not callable(handler_obj):
            raise LookupError(f"Unknown method: {method!r}")
        return handler_obj(params)

    def handle(self, request: dict[str, object]) -> object:
        method_obj = request.get("method")
        if method_obj is None:
            raise ValueError("method is required")
        method = str(method_obj).strip()
        if not method:
            raise ValueError("method is required")
        params_obj = request.get("params")
        params = params_obj if isinstance(params_obj, dict) else {}
        return self._dispatch(method, params)


def _jsonrpc_error_response(request_id: object, code: int, message: str, data: object | None = None) -> dict[str, object]:
    error: dict[str, object] = {"code": code, "message": message}
    if data is not None:
        error["data"] = data
    return {"jsonrpc": "2.0", "id": request_id, "error": error}


def _jsonrpc_result_response(request_id: object, result: object) -> dict[str, object]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def main() -> int:
    server = MCPServer()
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        request_id: object = None
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError as exc:
            response = _jsonrpc_error_response(None, -32700, "Parse error", {"detail": str(exc)})
            _ = sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
            _ = sys.stdout.flush()
            continue
        if not isinstance(parsed, dict):
            response = _jsonrpc_error_response(None, -32600, "Invalid Request")
            _ = sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
            _ = sys.stdout.flush()
            continue
        request = parsed
        request_id = request.get("id")
        try:
            result = server.handle(request)
            if request_id is None:
                continue
            response = _jsonrpc_result_response(request_id, result)
        except LookupError as exc:
            if request_id is None:
                continue
            response = _jsonrpc_error_response(request_id, -32601, "Method not found", {"detail": str(exc)})
        except ValueError as exc:
            if request_id is None:
                continue
            response = _jsonrpc_error_response(request_id, -32602, "Invalid params", {"detail": str(exc)})
        except Exception as exc:
            if request_id is None:
                continue
            response = _jsonrpc_error_response(request_id, -32603, "Internal error", {"detail": str(exc)})
        _ = sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        _ = sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
