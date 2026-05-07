import { createRequire } from "node:module";

import type { MdmResourcePackageMetadata } from "./manifest.js";

const require = createRequire(import.meta.url);

export interface MdmSqliteArtifactValidationInput {
  artifactPath: string;
  metadata?: MdmResourcePackageMetadata;
  queryAdapter?: string;
}

export function validateMdmSqliteArtifact(
  input: MdmSqliteArtifactValidationInput
): string | undefined {
  if (input.metadata?.storageKind !== "sqlite_bundle") {
    return undefined;
  }

  const database = openDatabase(input.artifactPath);
  try {
    const userVersion = readUserVersion(database);
    const minUserVersion = input.metadata.sqlite?.minUserVersion;
    if (minUserVersion !== undefined && userVersion < minUserVersion) {
      return `Cached SQLite resource requires user_version >= ${minUserVersion}; found ${userVersion}.`;
    }

    const missingTables = requiredSqliteTables(input).filter(
      (tableName) => !hasTableOrView(database, tableName)
    );
    if (missingTables.length > 0) {
      return `Cached SQLite resource is missing required table(s): ${missingTables.join(", ")}.`;
    }

    if (input.queryAdapter === "source_index_sqlite") {
      const sourceIndexError = validateSourceIndexContent(database);
      if (sourceIndexError) {
        return sourceIndexError;
      }
    }

    return undefined;
  } catch (error) {
    return `Cached SQLite resource is invalid: ${toErrorMessage(error)}.`;
  } finally {
    database.close();
  }
}

function requiredSqliteTables(input: MdmSqliteArtifactValidationInput): string[] {
  if (input.metadata?.sqlite?.requiredTables) {
    return input.metadata.sqlite.requiredTables;
  }
  if (input.queryAdapter === "source_index_sqlite") {
    return [
      "files",
      "java_symbols",
      "java_members",
      "fts_files",
      "source_chunks",
      "fts_chunks"
    ];
  }

  return [];
}

function validateSourceIndexContent(
  database: SqliteDatabase
): string | undefined {
  const fileCount = countRows(database, "files");
  const chunkCount = countRows(database, "source_chunks");
  const ftsChunkCount = countRows(database, "fts_chunks");
  if (fileCount === 0 || chunkCount === 0 || ftsChunkCount === 0) {
    return "Cached source index sqlite must contain indexed files and chunks.";
  }

  return undefined;
}

function readUserVersion(database: SqliteDatabase): number {
  const row = database.prepare("PRAGMA user_version").get();
  const value = row?.user_version;
  return typeof value === "number" ? value : 0;
}

function hasTableOrView(database: SqliteDatabase, tableName: string): boolean {
  const row = database.prepare(
    "SELECT name FROM sqlite_master WHERE type IN ('table', 'view', 'virtual table') AND name = ?"
  ).get(tableName);
  return row !== undefined;
}

function countRows(database: SqliteDatabase, tableName: string): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
  const value = row?.count;
  return typeof value === "number" ? value : 0;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface SqliteDatabase {
  prepare(sql: string): {
    get(...params: unknown[]): Record<string, unknown> | undefined;
  };
  close(): void;
}

function openDatabase(databasePath: string): SqliteDatabase {
  const sqlite = require("node:sqlite") as {
    DatabaseSync: new (path: string) => SqliteDatabase;
  };
  return new sqlite.DatabaseSync(databasePath);
}
