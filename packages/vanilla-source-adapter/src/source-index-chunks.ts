import { createRequire } from "node:module";

import type { SourceIndexMatch } from "@mcpskill/source-index";

const require = createRequire(import.meta.url);

export interface IndexedSourceChunk {
  path: string;
  chunkId: string;
  startLine: number;
  endLine: number;
  content: string;
}

export function readIndexedSourceChunk(
  databasePath: string,
  match: SourceIndexMatch
): IndexedSourceChunk | undefined {
  try {
    const database = openSqliteDatabase(databasePath);
    try {
      const query = match.chunkId
        ? [
            "SELECT path, chunk_id AS chunkId, start_line AS startLine,",
            "end_line AS endLine, content FROM source_chunks",
            "WHERE path = ? AND chunk_id = ? LIMIT 1"
          ].join(" ")
        : [
            "SELECT path, chunk_id AS chunkId, start_line AS startLine,",
            "end_line AS endLine, content FROM source_chunks",
            "WHERE path = ? ORDER BY start_line LIMIT 1"
          ].join(" ");
      const row = match.chunkId
        ? database.prepare(query).get(match.path, match.chunkId)
        : database.prepare(query).get(match.path);

      return row ? mapIndexedChunk(row) : undefined;
    } finally {
      database.close();
    }
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }
    throw error;
  }
}

interface SqliteStatement {
  get(...parameters: unknown[]): Record<string, unknown> | undefined;
}

interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  close(): void;
}

function openSqliteDatabase(databasePath: string): SqliteDatabase {
  const sqlite = require("node:sqlite") as {
    DatabaseSync: new (path: string) => SqliteDatabase;
  };
  return new sqlite.DatabaseSync(databasePath);
}

function mapIndexedChunk(row: Record<string, unknown>): IndexedSourceChunk {
  return {
    path: String(row.path),
    chunkId: String(row.chunkId),
    startLine: Number(row.startLine),
    endLine: Number(row.endLine),
    content: String(row.content)
  };
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
