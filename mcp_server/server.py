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
import re
import sqlite3
import sys
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES_ROOT = ROOT / "sources"
DATA_DIR = ROOT / "data"
SOURCES_DB = DATA_DIR / "minecraft_sources.sqlite"
DOCS_DB = DATA_DIR / "minecraft_docs.sqlite"
WORKSPACE = ROOT / "references" / "workspace"
CONTROL_FILE = WORKSPACE / "control.json"
DEFAULT_KUBEJS_VERSION = "1.20.1"
DEFAULT_KUBEJS_INSTANCE_ROOT = Path(
    "/Users/gedwen/Library/Application Support/PrismLauncher/instances/LearningKubeJSIsJoy"
)


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
    "find_usages": {
        "type": "object",
        "properties": {
            "version": {"type": "string"},
            "loader": {"type": "string"},
            "class_name": {"type": "string"},
            "ref_type": {"type": "string"},
            "limit": {"type": "integer"},
        },
        "required": ["version", "loader", "class_name"],
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
    "kubejs_project_scan": {
        "type": "object",
        "properties": {
            "project_root": {"type": "string"},
            "max_files": {"type": "integer"},
            "refresh": {"type": "boolean"},
        },
        "required": [],
        "additionalProperties": False,
    },
    "kubejs_project_env": {
        "type": "object",
        "properties": {
            "project_root": {"type": "string"},
        },
        "required": [],
        "additionalProperties": False,
    },
    "kubejs_project_search": {
        "type": "object",
        "properties": {
            "project_root": {"type": "string"},
            "query": {"type": "string"},
            "kind": {"type": "string"},
            "limit": {"type": "integer"},
            "max_files": {"type": "integer"},
            "refresh": {"type": "boolean"},
        },
        "required": ["query"],
        "additionalProperties": False,
    },
    "kubejs_project_multi_search": {
        "type": "object",
        "properties": {
            "project_root": {"type": "string"},
            "queries": {"type": "array", "items": {"type": "string"}},
            "kind": {"type": "string"},
            "per_query_limit": {"type": "integer"},
            "max_files": {"type": "integer"},
            "refresh": {"type": "boolean"},
        },
        "required": ["queries"],
        "additionalProperties": False,
    },
    "kubejs_project_context": {
        "type": "object",
        "properties": {
            "project_root": {"type": "string"},
            "max_files": {"type": "integer"},
            "refresh": {"type": "boolean"},
            "sample_queries": {"type": "array", "items": {"type": "string"}},
            "per_query_limit": {"type": "integer"},
        },
        "required": [],
        "additionalProperties": False,
    },
    "kubejs_project_read": {
        "type": "object",
        "properties": {
            "project_root": {"type": "string"},
            "path": {"type": "string"},
            "start": {"type": "integer"},
            "end": {"type": "integer"},
        },
        "required": ["path"],
        "additionalProperties": False,
    },
    "kubejs_project_triage": {
        "type": "object",
        "properties": {
            "project_root": {"type": "string"},
            "issue": {"type": "string"},
            "queries": {"type": "array", "items": {"type": "string"}},
            "max_files": {"type": "integer"},
            "refresh": {"type": "boolean"},
            "per_query_limit": {"type": "integer"},
            "max_queries": {"type": "integer"},
            "top_path_limit": {"type": "integer"},
        },
        "required": [],
        "additionalProperties": False,
    },
    "kubejs_datapack_guardrails": {
        "type": "object",
        "properties": {
            "project_root": {"type": "string"},
            "max_files": {"type": "integer"},
            "refresh": {"type": "boolean"},
        },
        "required": [],
        "additionalProperties": False,
    },
    "smart_search": {
        "type": "object",
        "properties": {
            "version": {"type": "string"},
            "loader": {"type": "string"},
            "query": {"type": "string"},
            "top_k": {"type": "integer"},
            "include_source": {"type": "boolean"},
            "source_lines": {"type": "integer"},
            "include_docs": {"type": "boolean"},
        },
        "required": ["version", "loader", "query"],
        "additionalProperties": False,
    },
    "search_methods": {
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
    "search_by_annotation": {
        "type": "object",
        "properties": {
            "version": {"type": "string"},
            "loader": {"type": "string"},
            "annotation": {"type": "string"},
            "limit": {"type": "integer"},
        },
        "required": ["version", "loader", "annotation"],
        "additionalProperties": False,
    },
    "get_doc_page_by_slug": {
        "type": "object",
        "properties": {
            "library": {"type": "string"},
            "version": {"type": "string"},
            "slug": {"type": "string"},
        },
        "required": ["library", "version", "slug"],
        "additionalProperties": False,
    },
    "diff_versions": {
        "type": "object",
        "properties": {
            "class_name": {"type": "string"},
            "version_a": {"type": "string"},
            "version_b": {"type": "string"},
            "loader_a": {"type": "string"},
            "loader_b": {"type": "string"},
            "loader": {"type": "string"},
        },
        "required": ["class_name", "version_a", "version_b"],
        "additionalProperties": False,
    },
    "list_events": {
        "type": "object",
        "properties": {
            "version": {"type": "string"},
            "loader": {"type": "string"},
            "bus": {"type": "string"},
            "limit": {"type": "integer"},
        },
        "required": ["version", "loader"],
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
        self._kubejs_project_cache: dict[str, dict[str, object]] = {}
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

    def _parse_mc_version_triplet(self, version: str) -> tuple[int, int, int] | None:
        match = re.match(r"^\s*(\d+)\.(\d+)(?:\.(\d+))?", version)
        if match is None:
            return None
        major = int(match.group(1))
        minor = int(match.group(2))
        patch = int(match.group(3) or 0)
        return (major, minor, patch)

    def _mc_version_at_least(self, version: str, target: tuple[int, int, int]) -> bool:
        parsed = self._parse_mc_version_triplet(version)
        if parsed is None:
            return False
        return parsed >= target

    def _extract_issue_queries(self, issue: str, max_queries: int) -> list[str]:
        stop_words = {
            "about", "after", "again", "also", "because", "before", "being", "between", "call", "calls",
            "cannot", "could", "deeper", "doing", "feature", "features", "find", "from", "have", "help",
            "how", "issue", "local", "make", "maybe", "more", "need", "other", "project", "slow", "slowness",
            "some", "that", "their", "them", "there", "they", "this", "tool", "tooling", "tools", "using",
            "what", "when", "where", "which", "with", "would", "your",
        }
        tokens = re.findall(r"[A-Za-z_][A-Za-z0-9_:.]{2,}", issue)
        out: list[str] = []
        seen: set[str] = set()

        for token in tokens:
            normalized = token.strip()
            if not normalized:
                continue
            key = normalized.lower()
            if key in stop_words:
                continue
            if key in seen:
                continue
            seen.add(key)
            out.append(normalized)
            if len(out) >= max_queries:
                break

        issue_lc = issue.lower()
        priority_terms = [
            "HighPriorityData" if "highprioritydata" in issue_lc else "",
            "biome" if "biome" in issue_lc else "",
            "registry" if "registry" in issue_lc else "",
            "worldgen" if "worldgen" in issue_lc else "",
            "StartupEvents.registry" if "startup" in issue_lc and "registry" in issue_lc else "",
        ]
        for term in priority_terms:
            if not term:
                continue
            term_lc = term.lower()
            if term_lc in seen:
                continue
            seen.add(term_lc)
            out.insert(0, term)

        return out[:max_queries]

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
            "SELECT DISTINCT sc.name, sc.kind, sf.rel_path, sc.superclass, sc.interfaces "
            "FROM source_classes sc JOIN source_files sf ON sf.id=sc.file_id "
            "WHERE sc.version=? AND sc.loader=? AND ("
            "  sc.superclass=? OR EXISTS ("
            "    SELECT 1 FROM source_class_interfaces sci "
            "    WHERE sci.class_id=sc.id AND sci.interface_name=?"
            "  )"
            ") ORDER BY sc.name, sf.rel_path",
            (version, loader, target, target),
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

    def find_usages(self, params: dict[str, object]) -> list[dict[str, object]]:
        version, loader = self._require_version_loader(params)
        class_name = self._require_param(params, "class_name")
        ref_type = params.get("ref_type")
        limit = self._parse_limit(params.get("limit"), 50, 500)
        if ref_type:
            rows = self._rows(
                "SELECT sf.rel_path, sf.class_name, sf.package_name, sr.ref_type, sr.target_member "
                "FROM source_references sr JOIN source_files sf ON sf.id=sr.file_id "
                "WHERE sr.version=? AND sr.loader=? AND sr.target_class=? AND sr.ref_type=? "
                "ORDER BY sf.rel_path LIMIT ?",
                (version, loader, class_name, str(ref_type), limit),
            )
        else:
            rows = self._rows(
                "SELECT sf.rel_path, sf.class_name, sf.package_name, sr.ref_type, sr.target_member "
                "FROM source_references sr JOIN source_files sf ON sf.id=sr.file_id "
                "WHERE sr.version=? AND sr.loader=? AND sr.target_class=? "
                "ORDER BY sr.ref_type, sf.rel_path LIMIT ?",
                (version, loader, class_name, limit),
            )
        return [
            {
                "rel_path": row["rel_path"],
                "class_name": row["class_name"],
                "package_name": row["package_name"],
                "ref_type": row["ref_type"],
                "target_member": row["target_member"],
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

    def smart_search(self, params: dict[str, object]) -> list[dict[str, object]]:
        version, loader = self._require_version_loader(params)
        query = self._require_param(params, "query")
        top_k = min(self._coerce_int(params.get("top_k"), 3), 5)
        include_source = bool(params.get("include_source", True))
        source_lines = min(self._coerce_int(params.get("source_lines"), 80), 200)
        include_docs = bool(params.get("include_docs", True))

        escaped = _fts5_escape(query)
        if not escaped:
            return []

        hits = self._search_fts(version, loader, escaped, top_k)
        if len(hits) < 2:
            tp = self._search_fts_third_party(escaped, top_k)
            seen: set[str] = {str(h.get("rel_path", "")) for h in hits}
            for row in tp:
                rp = str(row.get("rel_path", ""))
                if rp not in seen:
                    hits.append(row)
                    seen.add(rp)
                    if len(hits) >= top_k:
                        break

        results: list[dict[str, object]] = []
        for hit in hits[:top_k]:
            cn = str(hit.get("class_name", ""))
            rp = str(hit.get("rel_path", ""))
            hv = str(hit.get("version", version))
            hl = str(hit.get("loader", loader))
            entry: dict[str, object] = {
                "version": hv,
                "loader": hl,
                "class_name": cn,
                "rel_path": rp,
                "package_name": hit.get("package_name", ""),
                "superclass": hit.get("superclass", ""),
                "rank": hit.get("rank"),
            }
            if cn:
                try:
                    detail = self.get_class_detail({"version": hv, "loader": hl, "class_name": cn})
                    entry["methods"] = detail.get("methods", [])
                    entry["fields"] = detail.get("fields", [])
                    entry["events"] = detail.get("events", [])
                except (ValueError, KeyError):
                    entry["methods"] = []
                    entry["fields"] = []
                    entry["events"] = []
            if include_source and rp:
                try:
                    src = self.read_source({"version": hv, "loader": hl, "path": rp, "start": 1, "end": source_lines})
                    entry["source_preview"] = src.get("content", "")
                    entry["total_lines"] = src.get("total_lines", 0)
                except (ValueError, KeyError):
                    entry["source_preview"] = ""
                    entry["total_lines"] = 0
            results.append(entry)

        if include_docs and self.docs_conn is not None:
            try:
                doc_hits = self.search_docs({"query": query, "limit": 3})
                if doc_hits:
                    results.insert(0, {"_doc_hits": doc_hits})
            except (ValueError, KeyError):
                pass

        return results

    def search_methods(self, params: dict[str, object]) -> list[dict[str, object]]:
        version, loader = self._require_version_loader(params)
        query = self._require_param(params, "query")
        limit = self._parse_limit(params.get("limit"), 20, 200)
        fts_query = " OR ".join(f'"{w}"' for w in query.split()) if query.strip() else query
        rows = self._rows(
            "SELECT sm.name, sm.return_type, sm.params, sm.signature, sm.annotations, sm.line_num, "
            "sf.class_name, sf.rel_path, sf.package_name "
            "FROM source_methods_fts fts "
            "JOIN source_methods sm ON sm.id = fts.rowid "
            "JOIN source_files sf ON sf.id = sm.file_id "
            "WHERE fts.name MATCH ? AND sm.version=? AND sm.loader=? "
            "ORDER BY rank LIMIT ?",
            (fts_query, version, loader, limit),
        )
        if not rows:
            rows = self._rows(
                "SELECT sm.name, sm.return_type, sm.params, sm.signature, sm.annotations, sm.line_num, "
                "sf.class_name, sf.rel_path, sf.package_name "
                "FROM source_methods sm JOIN source_files sf ON sf.id = sm.file_id "
                "WHERE sm.version=? AND sm.loader=? AND sm.name LIKE ? "
                "ORDER BY sm.name LIMIT ?",
                (version, loader, f"%{query}%", limit),
            )
        return [
            {
                "method_name": row["name"],
                "class_name": row["class_name"],
                "return_type": row["return_type"],
                "params": row["params"],
                "signature": row["signature"],
                "annotations": row["annotations"],
                "rel_path": row["rel_path"],
                "package_name": row["package_name"],
                "line_num": row["line_num"],
            }
            for row in rows
        ]

    def search_by_annotation(self, params: dict[str, object]) -> list[dict[str, object]]:
        version, loader = self._require_version_loader(params)
        annotation = self._require_param(params, "annotation")
        limit = self._parse_limit(params.get("limit"), 20, 200)
        pattern = f"%{annotation}%"
        class_rows = self._rows(
            "SELECT sc.name, sc.kind, sc.annotations, sc.line_num, sf.rel_path, sf.package_name "
            "FROM source_classes sc JOIN source_files sf ON sf.id = sc.file_id "
            "WHERE sc.version=? AND sc.loader=? AND sc.annotations LIKE ? "
            "ORDER BY sc.name LIMIT ?",
            (version, loader, pattern, limit),
        )
        method_rows = self._rows(
            "SELECT sm.name, sm.return_type, sm.params, sm.annotations, sm.line_num, "
            "sf.class_name, sf.rel_path, sf.package_name "
            "FROM source_methods sm JOIN source_files sf ON sf.id = sm.file_id "
            "WHERE sm.version=? AND sm.loader=? AND sm.annotations LIKE ? "
            "ORDER BY sm.name LIMIT ?",
            (version, loader, pattern, limit),
        )
        results: list[dict[str, object]] = []
        for row in class_rows:
            results.append({
                "match_type": "class",
                "name": row["name"],
                "kind": row["kind"],
                "annotations": row["annotations"],
                "rel_path": row["rel_path"],
                "package_name": row["package_name"],
                "line_num": row["line_num"],
            })
        for row in method_rows:
            results.append({
                "match_type": "method",
                "name": row["name"],
                "class_name": row["class_name"],
                "return_type": row["return_type"],
                "params": row["params"],
                "annotations": row["annotations"],
                "rel_path": row["rel_path"],
                "package_name": row["package_name"],
                "line_num": row["line_num"],
            })
        return results

    def get_doc_page_by_slug(self, params: dict[str, object]) -> dict[str, object]:
        library = self._require_param(params, "library")
        version = self._require_param(params, "version")
        slug = self._require_param(params, "slug")
        row = self._doc_row(
            "SELECT id, library, version, category, slug, title, content, format, source_url "
            "FROM doc_pages WHERE library=? AND version=? AND slug=?",
            (library, version, slug),
        )
        if row is None:
            raise ValueError(f"No doc page: {library}/{version}/{slug}")
        return dict(row)

    def diff_versions(self, params: dict[str, object]) -> dict[str, object]:
        class_name = self._require_param(params, "class_name")
        version_a = self._require_param(params, "version_a")
        version_b = self._require_param(params, "version_b")
        loader_a = str(params.get("loader_a") or params.get("loader") or "forge")
        loader_b = str(params.get("loader_b") or params.get("loader") or "neoforge")

        def _methods(v: str, lo: str) -> dict[str, dict[str, object]]:
            rows = self._rows(
                "SELECT sm.name, sm.return_type, sm.params, sm.signature "
                "FROM source_methods sm JOIN source_files sf ON sf.id = sm.file_id "
                "WHERE sf.version=? AND sf.loader=? AND sf.class_name=?",
                (v, lo, class_name),
            )
            return {str(r["signature"] or r["name"]): dict(r) for r in rows}

        def _fields(v: str, lo: str) -> dict[str, dict[str, object]]:
            rows = self._rows(
                "SELECT sf2.name, sf2.field_type "
                "FROM source_fields sf2 JOIN source_files sf ON sf.id = sf2.file_id "
                "WHERE sf.version=? AND sf.loader=? AND sf.class_name=?",
                (v, lo, class_name),
            )
            return {str(r["name"]): dict(r) for r in rows}

        ma, mb = _methods(version_a, loader_a), _methods(version_b, loader_b)
        fa, fb = _fields(version_a, loader_a), _fields(version_b, loader_b)
        return {
            "class_name": class_name,
            "version_a": f"{version_a}/{loader_a}",
            "version_b": f"{version_b}/{loader_b}",
            "methods_added": [v for k, v in mb.items() if k not in ma],
            "methods_removed": [v for k, v in ma.items() if k not in mb],
            "fields_added": [v for k, v in fb.items() if k not in fa],
            "fields_removed": [v for k, v in fa.items() if k not in fb],
        }

    def list_events(self, params: dict[str, object]) -> list[dict[str, object]]:
        version, loader = self._require_version_loader(params)
        limit = self._parse_limit(params.get("limit"), 100, 2000)
        bus = params.get("bus")
        if bus:
            rows = self._rows(
                "SELECT se.name, se.kind, se.line_num, sf.rel_path, sf.class_name, sf.package_name "
                "FROM source_events se JOIN source_files sf ON sf.id = se.file_id "
                "WHERE se.version=? AND se.loader=? AND se.kind=? ORDER BY se.name LIMIT ?",
                (version, loader, str(bus), limit),
            )
        else:
            rows = self._rows(
                "SELECT se.name, se.kind, se.line_num, sf.rel_path, sf.class_name, sf.package_name "
                "FROM source_events se JOIN source_files sf ON sf.id = se.file_id "
                "WHERE se.version=? AND se.loader=? ORDER BY se.name LIMIT ?",
                (version, loader, limit),
            )
        return [
            {
                "name": row["name"],
                "kind": row["kind"],
                "class_name": row["class_name"],
                "package_name": row["package_name"],
                "rel_path": row["rel_path"],
                "line_num": row["line_num"],
            }
            for row in rows
        ]

    def _safe_project_root(self, project_root: str | Path) -> Path:
        candidate = Path(project_root).expanduser()
        if not candidate.is_absolute():
            candidate = (ROOT / candidate).resolve()
        if not candidate.exists() or not candidate.is_dir():
            raise ValueError("project_root does not exist or is not a directory")
        return candidate.resolve()

    def _resolve_kubejs_project_root(self, params: dict[str, object]) -> Path:
        explicit_root = params.get("project_root")
        if explicit_root is not None and str(explicit_root).strip():
            root = self._safe_project_root(str(explicit_root))
        else:
            if DEFAULT_KUBEJS_INSTANCE_ROOT.exists() and DEFAULT_KUBEJS_INSTANCE_ROOT.is_dir():
                root = DEFAULT_KUBEJS_INSTANCE_ROOT.resolve()
            else:
                root = ROOT
        minecraft_subdir = root / "minecraft"
        if minecraft_subdir.is_dir() and (minecraft_subdir / "kubejs").is_dir():
            return minecraft_subdir.resolve()
        return root.resolve()

    def _detect_kubejs_environment(self, project_root: Path) -> dict[str, object]:
        result: dict[str, object] = {
            "minecraft_version": DEFAULT_KUBEJS_VERSION,
            "loader": "forge",
            "version_source": "default",
            "loader_source": "default",
        }

        candidate_roots = [project_root]
        if project_root.name == "minecraft" and project_root.parent.exists():
            candidate_roots.append(project_root.parent)

        for base in candidate_roots:
            mmc_pack = base / "mmc-pack.json"
            if not mmc_pack.is_file():
                continue
            try:
                obj = json.loads(mmc_pack.read_text(encoding="utf-8", errors="replace"))
            except json.JSONDecodeError:
                continue
            if not isinstance(obj, dict):
                continue
            components_obj = obj.get("components")
            if not isinstance(components_obj, list):
                continue
            for comp in components_obj:
                if not isinstance(comp, dict):
                    continue
                uid_obj = comp.get("uid")
                if not isinstance(uid_obj, str):
                    continue
                version_obj = comp.get("version")
                if uid_obj == "net.minecraft" and isinstance(version_obj, str) and version_obj.strip():
                    result["minecraft_version"] = version_obj.strip()
                    result["version_source"] = str(mmc_pack)
                elif uid_obj == "net.minecraftforge":
                    result["loader"] = "forge"
                    result["loader_source"] = str(mmc_pack)
                elif uid_obj == "net.neoforged":
                    result["loader"] = "neoforge"
                    result["loader_source"] = str(mmc_pack)
            break

        return result

    def _safe_project_file(self, root: Path, rel_path: str) -> Path:
        path = (root / rel_path).resolve()
        try:
            _ = path.relative_to(root)
        except ValueError as exc:
            raise ValueError("path escapes project_root") from exc
        if not path.exists() or not path.is_file():
            raise ValueError("path does not exist or is not a file")
        return path

    def _find_kubejs_roots(self, project_root: Path) -> list[Path]:
        roots: list[Path] = []
        direct_candidates = [
            project_root / "kubejs",
            project_root / "overrides" / "kubejs",
            project_root / ".minecraft" / "kubejs",
            project_root / "local" / "kubejs",
        ]
        for candidate in direct_candidates:
            if candidate.is_dir():
                roots.append(candidate.resolve())
        if roots:
            return roots
        ignored = {".git", "node_modules", "venv", ".venv", "build", "dist", "out"}
        for current_root, dirs, _ in os.walk(project_root):
            dirs[:] = [d for d in dirs if d not in ignored]
            current = Path(current_root)
            if current.name.lower() == "kubejs":
                roots.append(current.resolve())
                if len(roots) >= 5:
                    break
        return roots

    def _iter_kubejs_script_files(self, directory: Path) -> list[Path]:
        ignored_dirs = {".git", "node_modules", "venv", ".venv", "build", "dist", "out", ".cache", "logs"}
        ignored_names = {".ds_store", "thumbs.db", "desktop.ini"}
        out: list[Path] = []
        for current_root, dirs, files in os.walk(directory):
            dirs[:] = [d for d in dirs if d.lower() not in ignored_dirs]
            base = Path(current_root)
            for name in files:
                lower_name = name.lower()
                if lower_name in ignored_names:
                    continue
                if lower_name.endswith(".d.ts"):
                    continue
                if not (lower_name.endswith(".js") or lower_name.endswith(".ts")):
                    continue
                out.append(base / name)
        return out

    def _parse_probejs_dts(self, file_path: Path, rel_path: str) -> list[dict[str, object]]:
        symbols: list[dict[str, object]] = []
        function_re = re.compile(r"^\s*(?:declare\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*:\s*([^;{]+)")
        method_re = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*:\s*([^;{]+);")
        property_re = re.compile(r"^\s*(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)\??:\s*([^;{]+);")
        try:
            lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            return symbols
        for line_num, line in enumerate(lines, start=1):
            fn = function_re.search(line)
            if fn:
                symbols.append(
                    {
                        "name": fn.group(1),
                        "kind": "function",
                        "source": "probejs-dts",
                        "path": rel_path,
                        "line": line_num,
                        "detail": f"({fn.group(2)}) -> {fn.group(3).strip()}",
                        "_search_blob": " ".join(
                            [
                                fn.group(1),
                                "function",
                                "probejs-dts",
                                rel_path,
                                fn.group(2),
                                fn.group(3).strip(),
                            ]
                        ).lower(),
                    }
                )
                continue
            method = method_re.search(line)
            if method:
                symbols.append(
                    {
                        "name": method.group(1),
                        "kind": "method",
                        "source": "probejs-dts",
                        "path": rel_path,
                        "line": line_num,
                        "detail": f"({method.group(2)}) -> {method.group(3).strip()}",
                        "_search_blob": " ".join(
                            [
                                method.group(1),
                                "method",
                                "probejs-dts",
                                rel_path,
                                method.group(2),
                                method.group(3).strip(),
                            ]
                        ).lower(),
                    }
                )
                continue
            prop = property_re.search(line)
            if prop:
                symbols.append(
                    {
                        "name": prop.group(1),
                        "kind": "property",
                        "source": "probejs-dts",
                        "path": rel_path,
                        "line": line_num,
                        "detail": prop.group(2).strip(),
                        "_search_blob": " ".join(
                            [
                                prop.group(1),
                                "property",
                                "probejs-dts",
                                rel_path,
                                prop.group(2).strip(),
                            ]
                        ).lower(),
                    }
                )
        return symbols

    def _parse_snippet_file(self, file_path: Path, rel_path: str) -> list[dict[str, object]]:
        symbols: list[dict[str, object]] = []
        try:
            content = file_path.read_text(encoding="utf-8", errors="replace")
            parsed = json.loads(content)
        except (OSError, json.JSONDecodeError):
            return symbols
        if not isinstance(parsed, dict):
            return symbols
        for snippet_name, snippet_obj in parsed.items():
            if not isinstance(snippet_name, str) or not isinstance(snippet_obj, dict):
                continue
            prefix_obj = snippet_obj.get("prefix")
            desc_obj = snippet_obj.get("description")
            body_obj = snippet_obj.get("body")
            prefixes: list[str] = []
            if isinstance(prefix_obj, str):
                prefixes = [prefix_obj]
            elif isinstance(prefix_obj, list):
                prefixes = [str(p) for p in prefix_obj if str(p).strip()]
            body_lines = 0
            if isinstance(body_obj, list):
                body_lines = len(body_obj)
            elif isinstance(body_obj, str):
                body_lines = len(body_obj.splitlines())
            symbols.append(
                {
                    "name": snippet_name,
                    "kind": "snippet",
                    "source": "probejs-snippet",
                    "path": rel_path,
                    "line": 1,
                    "detail": f"prefix={','.join(prefixes)} lines={body_lines} desc={str(desc_obj)[:120]}",
                    "_search_blob": " ".join(
                        [
                            snippet_name,
                            "snippet",
                            "probejs-snippet",
                            rel_path,
                            ",".join(prefixes),
                            str(desc_obj)[:120],
                        ]
                    ).lower(),
                }
            )
        return symbols

    def _parse_probe_registry_objects(self, file_path: Path, rel_path: str) -> list[dict[str, object]]:
        symbols: list[dict[str, object]] = []
        try:
            parsed = json.loads(file_path.read_text(encoding="utf-8", errors="replace"))
        except (OSError, json.JSONDecodeError):
            return symbols
        if not isinstance(parsed, dict):
            return symbols
        for registry_id, values_obj in parsed.items():
            if not isinstance(registry_id, str) or not isinstance(values_obj, list):
                continue
            for idx, entry in enumerate(values_obj, start=1):
                entry_text = str(entry).strip()
                if not entry_text:
                    continue
                symbols.append(
                    {
                        "name": entry_text,
                        "kind": "registry_object",
                        "source": "probejs-registry-backup",
                        "path": rel_path,
                        "line": idx,
                        "detail": f"registry={registry_id}",
                        "_search_blob": " ".join(
                            [
                                entry_text,
                                "registry_object",
                                "probejs-registry-backup",
                                rel_path,
                                registry_id,
                            ]
                        ).lower(),
                    }
                )
        return symbols

    def _parse_registry_items(self, script_path: Path, rel_path: str) -> list[dict[str, object]]:
        symbols: list[dict[str, object]] = []
        registry_start = re.compile(r"StartupEvents\.registry\(\s*['\"]([^'\"]+)['\"]")
        create_call = re.compile(r"\.create\(\s*['\"]([^'\"]+)['\"]")
        active_registry: tuple[str, int] | None = None
        try:
            lines = script_path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            return symbols
        for line_num, line in enumerate(lines, start=1):
            reg = registry_start.search(line)
            if reg:
                active_registry = (reg.group(1), line_num + 120)
            if active_registry and line_num > active_registry[1]:
                active_registry = None
            create = create_call.search(line)
            if create and active_registry is not None:
                symbols.append(
                    {
                        "name": create.group(1),
                        "kind": "registry_item",
                        "source": "kubejs-script",
                        "path": rel_path,
                        "line": line_num,
                        "detail": f"registry={active_registry[0]}",
                        "_search_blob": " ".join(
                            [
                                create.group(1),
                                "registry_item",
                                "kubejs-script",
                                rel_path,
                                active_registry[0],
                            ]
                        ).lower(),
                    }
                )
        return symbols

    def _build_kubejs_project_index(self, project_root: Path, max_files: int) -> dict[str, object]:
        kubejs_roots = self._find_kubejs_roots(project_root)
        if not kubejs_roots:
            raise ValueError("No kubejs directory found under project_root")

        symbols: list[dict[str, object]] = []
        script_files: list[str] = []
        scanned_files = 0
        script_counts: dict[str, int] = {
            "startup_scripts": 0,
            "server_scripts": 0,
            "client_scripts": 0,
            "local_startup_scripts": 0,
            "local_server_scripts": 0,
        }
        resource_counts: dict[str, int] = {"data": 0, "assets": 0, "config": 0}
        probe_dirs: list[str] = []

        def remaining() -> int:
            return max(0, max_files - scanned_files)

        for kubejs_root in kubejs_roots:
            phase_dirs: list[tuple[str, Path]] = [
                ("startup_scripts", kubejs_root / "startup_scripts"),
                ("server_scripts", kubejs_root / "server_scripts"),
                ("client_scripts", kubejs_root / "client_scripts"),
            ]
            if kubejs_root.name == "kubejs" and kubejs_root.parent.name == "local":
                phase_dirs.extend(
                    [
                        ("local_startup_scripts", kubejs_root / "local_startup_scripts"),
                        ("local_server_scripts", kubejs_root / "local_server_scripts"),
                    ]
                )

            for phase, phase_dir in phase_dirs:
                if not phase_dir.is_dir():
                    continue
                for script in self._iter_kubejs_script_files(phase_dir):
                    if scanned_files >= max_files:
                        break
                    scanned_files += 1
                    script_counts[phase] = script_counts.get(phase, 0) + 1
                    rel_path = script.relative_to(project_root).as_posix()
                    script_files.append(rel_path)
                    symbols.extend(self._parse_registry_items(script, rel_path))
                if scanned_files >= max_files:
                    break

            for resource_name in ("data", "assets", "config"):
                resource_dir = kubejs_root / resource_name
                if not resource_dir.is_dir():
                    continue
                count = 0
                for _ in resource_dir.rglob("*"):
                    count += 1
                    if count >= 20000:
                        break
                resource_counts[resource_name] = resource_counts.get(resource_name, 0) + count
            if scanned_files >= max_files:
                break

            probe_candidates = [
                project_root / ".probe",
                project_root / ".probejs",
                project_root / ".vscode",
                kubejs_root / ".probe",
                kubejs_root / ".probejs",
                kubejs_root / "probe",
                kubejs_root / "probejs",
                kubejs_root / ".vscode",
            ]
            unique_probe_candidates = []
            seen_probe = set()
            for candidate in probe_candidates:
                resolved = candidate.resolve()
                if resolved in seen_probe or not resolved.is_dir():
                    continue
                seen_probe.add(resolved)
                unique_probe_candidates.append(resolved)
                probe_dirs.append(resolved.relative_to(project_root).as_posix())

            for probe_dir in unique_probe_candidates:
                if scanned_files >= max_files:
                    break
                registry_file = probe_dir / "registry_objects.json"
                if registry_file.is_file() and scanned_files < max_files:
                    scanned_files += 1
                    rel_path = registry_file.relative_to(project_root).as_posix()
                    symbols.extend(self._parse_probe_registry_objects(registry_file, rel_path))
                for dts_file in probe_dir.rglob("*.d.ts"):
                    if scanned_files >= max_files:
                        break
                    scanned_files += 1
                    rel_path = dts_file.relative_to(project_root).as_posix()
                    symbols.extend(self._parse_probejs_dts(dts_file, rel_path))

                if scanned_files >= max_files:
                    break
                snippet_patterns = ["*.code-snippets", "*snippet*.json", "*snippets*.json"]
                for pattern in snippet_patterns:
                    if scanned_files >= max_files:
                        break
                    for snippet_file in probe_dir.rglob(pattern):
                        if scanned_files >= max_files:
                            break
                        scanned_files += 1
                        rel_path = snippet_file.relative_to(project_root).as_posix()
                        symbols.extend(self._parse_snippet_file(snippet_file, rel_path))

        now_iso = datetime.now(timezone.utc).isoformat()
        return {
            "project_root": str(project_root),
            "kubejs_roots": [p.relative_to(project_root).as_posix() for p in kubejs_roots],
            "probe_dirs": sorted(set(probe_dirs)),
            "script_counts": script_counts,
            "script_files": sorted(set(script_files)),
            "resource_counts": resource_counts,
            "symbols": symbols,
            "symbol_count": len(symbols),
            "scanned_files": scanned_files,
            "indexed_at": now_iso,
            "max_files": max_files,
            "truncated": remaining() == 0,
        }

    def _get_kubejs_project_index(self, project_root: Path, max_files: int, refresh: bool) -> dict[str, object]:
        cache_key = str(project_root)
        if not refresh:
            cached = self._kubejs_project_cache.get(cache_key)
            if cached is not None:
                return cached
        built = self._build_kubejs_project_index(project_root, max_files)
        self._kubejs_project_cache[cache_key] = built
        return built

    def kubejs_project_env(self, params: dict[str, object]) -> dict[str, object]:
        project_root = self._resolve_kubejs_project_root(params)
        env = self._detect_kubejs_environment(project_root)
        kubejs_roots = self._find_kubejs_roots(project_root)
        return {
            "project_root": str(project_root),
            "minecraft_version": str(env.get("minecraft_version", DEFAULT_KUBEJS_VERSION)),
            "loader": str(env.get("loader", "forge")),
            "version_source": str(env.get("version_source", "default")),
            "loader_source": str(env.get("loader_source", "default")),
            "kubejs_roots": [p.relative_to(project_root).as_posix() for p in kubejs_roots],
        }

    def kubejs_project_scan(self, params: dict[str, object]) -> dict[str, object]:
        project_root = self._resolve_kubejs_project_root(params)
        env = self._detect_kubejs_environment(project_root)
        refresh = bool(params.get("refresh", False))
        max_files = self._parse_limit(params.get("max_files"), 3000, 20000)
        index = self._get_kubejs_project_index(project_root, max_files, refresh)
        by_kind: dict[str, int] = {}
        symbols_obj = index.get("symbols")
        symbols = symbols_obj if isinstance(symbols_obj, list) else []
        for symbol in symbols:
            if not isinstance(symbol, dict):
                continue
            kind = str(symbol.get("kind", "unknown"))
            by_kind[kind] = by_kind.get(kind, 0) + 1
        return {
            "project_root": index.get("project_root", str(project_root)),
            "minecraft_version": str(env.get("minecraft_version", DEFAULT_KUBEJS_VERSION)),
            "loader": str(env.get("loader", "forge")),
            "version_source": str(env.get("version_source", "default")),
            "indexed_max_files": index.get("max_files", max_files),
            "kubejs_roots": index.get("kubejs_roots", []),
            "probe_dirs": index.get("probe_dirs", []),
            "script_counts": index.get("script_counts", {}),
            "resource_counts": index.get("resource_counts", {}),
            "symbol_count": index.get("symbol_count", 0),
            "symbol_count_by_kind": by_kind,
            "scanned_files": index.get("scanned_files", 0),
            "indexed_at": index.get("indexed_at", ""),
            "truncated": bool(index.get("truncated", False)),
        }

    def kubejs_project_search(self, params: dict[str, object]) -> list[dict[str, object]]:
        project_root = self._resolve_kubejs_project_root(params)
        query = self._require_param(params, "query").lower()
        kind_filter_obj = params.get("kind")
        kind_filter = str(kind_filter_obj).strip().lower() if kind_filter_obj is not None else ""
        refresh = bool(params.get("refresh", False))
        max_files = self._parse_limit(params.get("max_files"), 1200, 20000)
        limit = self._parse_limit(params.get("limit"), 50, 500)

        index = self._get_kubejs_project_index(project_root, max_files, refresh)
        symbols_obj = index.get("symbols")
        symbols = symbols_obj if isinstance(symbols_obj, list) else []

        results: list[dict[str, object]] = []
        for symbol in symbols:
            if not isinstance(symbol, dict):
                continue
            kind = str(symbol.get("kind", "")).lower()
            if kind_filter and kind != kind_filter:
                continue
            blob_obj = symbol.get("_search_blob")
            if isinstance(blob_obj, str) and blob_obj:
                haystack = blob_obj
            else:
                haystack = " ".join(
                    [
                        str(symbol.get("name", "")),
                        str(symbol.get("detail", "")),
                        str(symbol.get("path", "")),
                        str(symbol.get("source", "")),
                        kind,
                    ]
                ).lower()
            if query not in haystack:
                continue
            clean_symbol = {k: v for k, v in symbol.items() if k != "_search_blob"}
            results.append(clean_symbol)
            if len(results) >= limit:
                break

        return results

    def kubejs_project_multi_search(self, params: dict[str, object]) -> dict[str, object]:
        project_root = self._resolve_kubejs_project_root(params)
        queries_obj = params.get("queries")
        if not isinstance(queries_obj, list):
            raise ValueError("queries must be an array of strings")
        queries = [str(q).strip() for q in queries_obj if str(q).strip()]
        if not queries:
            raise ValueError("queries must contain at least one non-empty query")
        refresh = bool(params.get("refresh", False))
        max_files = self._parse_limit(params.get("max_files"), 1200, 20000)
        per_query_limit = self._parse_limit(params.get("per_query_limit"), 20, 200)
        kind_filter_obj = params.get("kind")
        kind_filter = str(kind_filter_obj).strip() if kind_filter_obj is not None else ""

        index = self._get_kubejs_project_index(project_root, max_files, refresh)
        out: dict[str, object] = {
            "project_root": str(project_root),
            "indexed_at": index.get("indexed_at", ""),
            "indexed_max_files": index.get("max_files", max_files),
            "results": {},
        }
        results_obj = out.get("results")
        if not isinstance(results_obj, dict):
            return out

        for query in queries:
            payload: dict[str, object] = {
                "project_root": str(project_root),
                "query": query,
                "limit": per_query_limit,
                "max_files": max_files,
                "refresh": False,
            }
            if kind_filter:
                payload["kind"] = kind_filter
            results_obj[query] = self.kubejs_project_search(payload)
        return out

    def kubejs_project_context(self, params: dict[str, object]) -> dict[str, object]:
        env = self.kubejs_project_env(params)
        max_files = self._parse_limit(params.get("max_files"), 1200, 20000)
        per_query_limit = self._parse_limit(params.get("per_query_limit"), 10, 100)
        refresh = bool(params.get("refresh", False))
        sample_queries_obj = params.get("sample_queries")
        if isinstance(sample_queries_obj, list):
            sample_queries = [str(q).strip() for q in sample_queries_obj if str(q).strip()]
        else:
            sample_queries = ["ServerEvents", "ItemEvents", "StartupEvents", "ForgeEvents", "getId", "registry"]
        scan = self.kubejs_project_scan(
            {
                "project_root": env.get("project_root"),
                "max_files": max_files,
                "refresh": refresh,
            }
        )
        multi = self.kubejs_project_multi_search(
            {
                "project_root": env.get("project_root"),
                "queries": sample_queries,
                "per_query_limit": per_query_limit,
                "max_files": max_files,
                "refresh": False,
            }
        )
        return {
            "env": env,
            "scan": scan,
            "sample_queries": sample_queries,
            "query_hits": multi.get("results", {}),
        }

    def kubejs_project_read(self, params: dict[str, object]) -> dict[str, object]:
        project_root = self._resolve_kubejs_project_root(params)
        rel_path = self._require_param(params, "path")
        start = self._coerce_int(params.get("start"), 1)
        end = self._coerce_int(params.get("end"), max(start, start + 199))
        if start < 1:
            start = 1
        if end < start:
            end = start
        safe_file = self._safe_project_file(project_root, rel_path)
        lines = safe_file.read_text(encoding="utf-8", errors="replace").splitlines()
        clamped_end = min(end, len(lines))
        content = "\n".join(lines[start - 1:clamped_end])
        return {
            "project_root": str(project_root),
            "path": rel_path,
            "start": start,
            "end": clamped_end,
            "total_lines": len(lines),
            "content": content,
        }

    def kubejs_project_triage(self, params: dict[str, object]) -> dict[str, object]:
        project_root = self._resolve_kubejs_project_root(params)
        max_files = self._parse_limit(params.get("max_files"), 1500, 20000)
        refresh = bool(params.get("refresh", False))
        per_query_limit = self._parse_limit(params.get("per_query_limit"), 8, 100)
        max_queries = self._parse_limit(params.get("max_queries"), 8, 20)
        top_path_limit = self._parse_limit(params.get("top_path_limit"), 8, 30)

        issue_obj = params.get("issue")
        issue = str(issue_obj).strip() if issue_obj is not None else ""
        explicit_queries_obj = params.get("queries")
        explicit_queries: list[str] = []
        if isinstance(explicit_queries_obj, list):
            explicit_queries = [str(q).strip() for q in explicit_queries_obj if str(q).strip()]

        queries: list[str]
        if explicit_queries:
            queries = explicit_queries[:max_queries]
        elif issue:
            queries = self._extract_issue_queries(issue, max_queries)
        else:
            raise ValueError("Provide either issue text or queries")

        env = self.kubejs_project_env({"project_root": str(project_root)})
        scan = self.kubejs_project_scan(
            {
                "project_root": str(project_root),
                "max_files": max_files,
                "refresh": refresh,
            }
        )

        hits_by_query: dict[str, list[dict[str, object]]] = {}
        path_scores: dict[str, int] = {}
        symbol_examples_by_path: dict[str, list[dict[str, object]]] = {}
        kind_weight = {
            "registry_item": 5,
            "registry_object": 5,
            "function": 3,
            "method": 3,
            "property": 2,
            "snippet": 2,
        }

        for query in queries:
            rows = self.kubejs_project_search(
                {
                    "project_root": str(project_root),
                    "query": query,
                    "limit": per_query_limit,
                    "max_files": max_files,
                    "refresh": False,
                }
            )
            hits_by_query[query] = rows
            for symbol in rows:
                path = str(symbol.get("path", "")).strip()
                if not path:
                    continue
                kind = str(symbol.get("kind", "")).lower()
                score = kind_weight.get(kind, 1)
                path_scores[path] = path_scores.get(path, 0) + score
                examples = symbol_examples_by_path.setdefault(path, [])
                if len(examples) < 3:
                    examples.append(symbol)

        sorted_paths = sorted(path_scores.items(), key=lambda item: (-item[1], item[0]))
        top_paths: list[dict[str, object]] = []
        for path, score in sorted_paths[:top_path_limit]:
            top_paths.append(
                {
                    "path": path,
                    "score": score,
                    "example_symbols": symbol_examples_by_path.get(path, []),
                }
            )

        guidance: list[str] = []
        issue_lc = issue.lower()
        if "highprioritydata" in issue_lc:
            guidance.append(
                "No in-repo HighPriorityData policy text was found; verify behavior from source/event-stage implementation for your target KubeJS version."
            )
        if "biome" in issue_lc or "worldgen" in issue_lc or "registry" in issue_lc:
            guidance.append(
                "For worldgen/biome work, prefer datapack-driven dynamic registries and verify placed-feature wiring before direct mutation assumptions."
            )

        return {
            "project_root": str(project_root),
            "issue": issue,
            "queries": queries,
            "env": env,
            "scan": scan,
            "hits_by_query": hits_by_query,
            "top_paths": top_paths,
            "guidance": guidance,
        }

    def kubejs_datapack_guardrails(self, params: dict[str, object]) -> dict[str, object]:
        project_root = self._resolve_kubejs_project_root(params)
        max_files = self._parse_limit(params.get("max_files"), 2000, 20000)
        refresh = bool(params.get("refresh", False))

        env = self.kubejs_project_env({"project_root": str(project_root)})
        detected_version = str(env.get("minecraft_version", DEFAULT_KUBEJS_VERSION))
        is_1211_or_newer = self._mc_version_at_least(detected_version, (1, 21, 1))

        index = self._get_kubejs_project_index(project_root, max_files, refresh)
        script_files_obj = index.get("script_files")
        script_files = script_files_obj if isinstance(script_files_obj, list) else []

        startup_registry_re = re.compile(r"StartupEvents\.registry\(\s*['\"]([^'\"]+)['\"]")
        server_registry_re = re.compile(r"ServerEvents\.registry\(\s*['\"]([^'\"]+)['\"]")
        generate_data_re = re.compile(r"ServerEvents\.generateData\(")
        high_low_data_re = re.compile(r"ServerEvents\.(highPriorityData|lowPriorityData)\(")

        datapack_registry_hints = {
            "worldgen",
            "biome",
            "configured_feature",
            "placed_feature",
            "dimension",
            "dimension_type",
            "structure",
            "structure_set",
            "template_pool",
            "processor_list",
            "density_function",
            "noise",
            "noise_settings",
            "world_preset",
            "flat_level_generator_preset",
            "damage_type",
            "trim_material",
            "trim_pattern",
            "banner_pattern",
        }

        findings: list[dict[str, object]] = []
        summary = {
            "files_checked": 0,
            "startup_registry_hits": 0,
            "server_registry_hits": 0,
            "generate_data_hits": 0,
            "high_low_priority_hits": 0,
            "guardrail_violations": 0,
        }

        def add_finding(path: str, line: int, severity: str, rule: str, message: str, evidence: str) -> None:
            if severity == "error":
                summary["guardrail_violations"] = int(summary.get("guardrail_violations", 0)) + 1
            findings.append(
                {
                    "path": path,
                    "line": line,
                    "severity": severity,
                    "rule": rule,
                    "message": message,
                    "evidence": evidence,
                }
            )

        for rel_path_obj in script_files:
            rel_path = str(rel_path_obj)
            file_path = self._safe_project_file(project_root, rel_path)
            try:
                lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            summary["files_checked"] = int(summary.get("files_checked", 0)) + 1

            for line_num, line in enumerate(lines, start=1):
                startup_match = startup_registry_re.search(line)
                if startup_match:
                    summary["startup_registry_hits"] = int(summary.get("startup_registry_hits", 0)) + 1
                    registry_key = startup_match.group(1)
                    key_lc = registry_key.lower()
                    if any(hint in key_lc for hint in datapack_registry_hints):
                        add_finding(
                            rel_path,
                            line_num,
                            "error",
                            "startup-registry-datapack-registry",
                            "StartupEvents.registry must not be used for datapack registries/worldgen keys.",
                            line.strip()[:220],
                        )

                server_match = server_registry_re.search(line)
                if server_match:
                    summary["server_registry_hits"] = int(summary.get("server_registry_hits", 0)) + 1

                if generate_data_re.search(line):
                    summary["generate_data_hits"] = int(summary.get("generate_data_hits", 0)) + 1

                high_low_match = high_low_data_re.search(line)
                if high_low_match:
                    summary["high_low_priority_hits"] = int(summary.get("high_low_priority_hits", 0)) + 1
                    event_name = high_low_match.group(1)
                    if is_1211_or_newer:
                        add_finding(
                            rel_path,
                            line_num,
                            "error",
                            "high-low-data-on-1-21-1-plus",
                            "ServerEvents.highPriorityData/lowPriorityData is legacy; use ServerEvents.generateData or ServerEvents.registry on 1.21.1+.",
                            line.strip()[:220],
                        )
                    else:
                        add_finding(
                            rel_path,
                            line_num,
                            "info",
                            "high-low-data-legacy-supported",
                            f"{event_name} is valid in 1.20.x and can emit raw datapack JSON.",
                            line.strip()[:220],
                        )

        guidance: list[str] = []
        guidance.append(
            "1.20.x: ServerEvents.highPriorityData/lowPriorityData can emit raw datapack JSON paths, including worldgen registries."
        )
        guidance.append(
            "1.21.1+: prefer ServerEvents.registry('<datapack-registry-key>') for datapack registries and ServerEvents.generateData('<stage>') for non-registry data generation."
        )
        guidance.append(
            "Never route datapack registries through StartupEvents.registry; datapack registry builder types are rejected in modern KubeJS startup registry flow."
        )

        if is_1211_or_newer and int(summary.get("server_registry_hits", 0)) == 0 and int(summary.get("generate_data_hits", 0)) == 0:
            guidance.append(
                "No ServerEvents.registry/generateData usage detected on 1.21.1+; consider adding one of these hooks for datapack/data generation workflows."
            )

        return {
            "project_root": str(project_root),
            "minecraft_version": detected_version,
            "loader": str(env.get("loader", "forge")),
            "ruleset": "kubejs-datapack-guardrails-v1",
            "summary": summary,
            "findings": findings,
            "guidance": guidance,
        }

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
            "find_usages": "Find all files that reference a class by name (via imports, annotations, field/param/return types). Use to discover where LivingHurtEvent, ItemStack, etc. are used.",
            "read_source": "Read source lines by version/loader/path with optional range.",
            "list_package": "List classes under a package prefix.",
            "kubejs_project_scan": "Scan local KubeJS project and ProbeJS artifacts into an in-memory index.",
            "kubejs_project_env": "Auto-detect KubeJS project environment, structure roots, and Minecraft version (defaults to 1.20.1).",
            "kubejs_project_search": "Search indexed KubeJS/ProbeJS symbols (functions, methods, properties, snippets, registry items).",
            "kubejs_project_multi_search": "Run multiple KubeJS/ProbeJS symbol queries in one MCP call.",
            "kubejs_project_context": "Return env+scan summary plus common symbol query hits in a single call.",
            "kubejs_project_read": "Read a local project file by relative path with optional line range.",
            "kubejs_project_triage": "One-shot issue triage: derive queries, run project search, rank likely files, and return env/scan context.",
            "kubejs_datapack_guardrails": "Check local KubeJS scripts for datapack/worldgen registry misuse and return version-specific migration guidance.",
            "smart_search": "Composite search: FTS + class detail + source preview in one call. Replaces search→get_class_detail→read_source chains. Returns top_k hits each with methods/fields/events and optional source. Use this first for any source research.",
            "search_methods": "Direct method-name search across source_methods. Returns class_name, return_type, params, signature, rel_path. Use when you know a method name but not its class.",
            "search_by_annotation": "Find classes and methods carrying a specific annotation (e.g. EventBusSubscriber, SubscribeEvent, Mod). Returns both class-level and method-level matches.",
            "get_doc_page_by_slug": "Retrieve a doc page by stable (library, version, slug) triple without a numeric id. Use for bookmarked or hardcoded doc references.",
            "diff_versions": "Structural diff for a class between two version/loader pairs. Returns methods_added, methods_removed, fields_added, fields_removed. Use for migration questions.",
            "list_events": "List all events indexed for a version/loader, optionally filtered by kind/bus. Returns name, kind, class_name, rel_path.",
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
            structured_content: dict[str, object]
            if isinstance(result, dict):
                structured_content = result
            else:
                structured_content = {"result": result}
            return {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(result, ensure_ascii=False),
                    }
                ],
                "structuredContent": structured_content,
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
            "find_usages": self.find_usages,
            "read_source": self.read_source,
            "list_package": self.list_package,
            "kubejs_project_scan": self.kubejs_project_scan,
            "kubejs_project_env": self.kubejs_project_env,
            "kubejs_project_search": self.kubejs_project_search,
            "kubejs_project_multi_search": self.kubejs_project_multi_search,
            "kubejs_project_context": self.kubejs_project_context,
            "kubejs_project_read": self.kubejs_project_read,
            "kubejs_project_triage": self.kubejs_project_triage,
            "kubejs_datapack_guardrails": self.kubejs_datapack_guardrails,
            "smart_search": self.smart_search,
            "search_methods": self.search_methods,
            "search_by_annotation": self.search_by_annotation,
            "get_doc_page_by_slug": self.get_doc_page_by_slug,
            "diff_versions": self.diff_versions,
            "list_events": self.list_events,
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
