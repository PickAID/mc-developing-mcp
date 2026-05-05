import type { SqliteDatabase } from "./sqlite.js";

export function initializeSourceIndexSchema(database: SqliteDatabase): void {
  database.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      package_id TEXT
    );

    CREATE TABLE IF NOT EXISTS java_symbols (
      path TEXT NOT NULL,
      package_name TEXT,
      simple_name TEXT NOT NULL,
      qualified_name TEXT NOT NULL,
      FOREIGN KEY(path) REFERENCES files(path) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_java_symbols_simple_name
      ON java_symbols(simple_name);

    CREATE TABLE IF NOT EXISTS java_members (
      path TEXT NOT NULL,
      package_name TEXT,
      owner_simple_name TEXT NOT NULL,
      owner_qualified_name TEXT NOT NULL,
      member_name TEXT NOT NULL,
      member_kind TEXT NOT NULL,
      signature TEXT,
      return_type TEXT,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      FOREIGN KEY(path) REFERENCES files(path) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_java_members_member_name
      ON java_members(member_name);

    CREATE INDEX IF NOT EXISTS idx_java_members_member_kind
      ON java_members(member_name, member_kind);

    CREATE INDEX IF NOT EXISTS idx_java_members_owner_member
      ON java_members(owner_qualified_name, member_name);

    CREATE INDEX IF NOT EXISTS idx_java_members_owner_member_kind
      ON java_members(owner_qualified_name, member_name, member_kind);

    CREATE VIRTUAL TABLE IF NOT EXISTS fts_files
      USING fts5(path UNINDEXED, content);

    CREATE TABLE IF NOT EXISTS source_chunks (
      path TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      chunk_type TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      token_count INTEGER NOT NULL,
      content TEXT NOT NULL,
      PRIMARY KEY(path, chunk_id),
      FOREIGN KEY(path) REFERENCES files(path) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS fts_chunks
      USING fts5(path UNINDEXED, chunk_id UNINDEXED, content);
  `);
}
