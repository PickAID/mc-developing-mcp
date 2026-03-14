#!/usr/bin/env python3
"""Initialize the documentation database."""

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS_DB = ROOT / "data" / "minecraft_docs.sqlite"

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-65536;
PRAGMA mmap_size=268435456;
PRAGMA temp_store=MEMORY;

CREATE TABLE IF NOT EXISTS doc_pages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    library     TEXT NOT NULL,
    version     TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'general',
    slug        TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL,
    format      TEXT NOT NULL DEFAULT 'markdown',
    source_url  TEXT NOT NULL DEFAULT '',
    fetched_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(library, version, slug)
);

CREATE INDEX IF NOT EXISTS idx_dp_lib_ver ON doc_pages(library, version);
CREATE INDEX IF NOT EXISTS idx_dp_category ON doc_pages(category);
CREATE INDEX IF NOT EXISTS idx_dp_lib ON doc_pages(library);

CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
    doc_id      UNINDEXED,
    library     UNINDEXED,
    version     UNINDEXED,
    title,
    content,
    category,
    tokenize = 'porter unicode61'
);
"""


def main() -> None:
    DOCS_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DOCS_DB))
    _ = conn.executescript(SCHEMA)
    conn.commit()
    print(f"Docs DB initialized: {DOCS_DB}")
    conn.close()


if __name__ == "__main__":
    main()
