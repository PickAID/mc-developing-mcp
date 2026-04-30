export interface ModArchiveEntryIndexStatement {
  all(...parameters: unknown[]): Record<string, unknown>[];
  get(...parameters: unknown[]): Record<string, unknown> | undefined;
  run(...parameters: unknown[]): unknown;
}

export interface ModArchiveEntryIndexDatabase {
  exec(sql: string): void;
  prepare(sql: string): ModArchiveEntryIndexStatement;
  close(): void;
}

export function initializeModArchiveEntryIndexSchema(
  database: ModArchiveEntryIndexDatabase
): void {
  database.exec(`
    PRAGMA journal_mode = DELETE;

    CREATE TABLE IF NOT EXISTS mod_archive_entry_index_archives (
      source_archive TEXT PRIMARY KEY,
      archive_key TEXT NOT NULL,
      archive_relative_path TEXT NOT NULL,
      fingerprint_json TEXT NOT NULL,
      indexed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mod_archive_entry_index_entries (
      archive_key TEXT NOT NULL,
      source_archive TEXT NOT NULL,
      archive_relative_path TEXT NOT NULL,
      embedded_archive_path TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      domain TEXT NOT NULL,
      asset_kind TEXT NOT NULL DEFAULT '',
      data_kind TEXT NOT NULL DEFAULT '',
      size_bytes INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mod_archive_entry_index_entries_lookup
      ON mod_archive_entry_index_entries(archive_key, domain, relative_path);

  `);

  if (!hasColumn(database, "mod_archive_entry_index_entries", "asset_kind")) {
    database.exec(
      "ALTER TABLE mod_archive_entry_index_entries ADD COLUMN asset_kind TEXT NOT NULL DEFAULT ''"
    );
  }
  if (!hasColumn(database, "mod_archive_entry_index_entries", "data_kind")) {
    database.exec(
      "ALTER TABLE mod_archive_entry_index_entries ADD COLUMN data_kind TEXT NOT NULL DEFAULT ''"
    );
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_mod_archive_entry_index_entries_asset_lookup
      ON mod_archive_entry_index_entries(archive_key, domain, asset_kind, relative_path);

    CREATE INDEX IF NOT EXISTS idx_mod_archive_entry_index_entries_data_lookup
      ON mod_archive_entry_index_entries(archive_key, domain, data_kind, relative_path);
  `);
}

function hasColumn(
  database: ModArchiveEntryIndexDatabase,
  tableName: string,
  columnName: string
): boolean {
  return database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((row) => row.name === columnName);
}
