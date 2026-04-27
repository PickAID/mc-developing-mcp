import { createRequire } from "node:module";

export interface SqliteStatement {
  all(...parameters: unknown[]): Record<string, unknown>[];
  get(...parameters: unknown[]): Record<string, unknown> | undefined;
  run(...parameters: unknown[]): unknown;
}

export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

const require = createRequire(import.meta.url);

export function openSourceIndexDatabase(databasePath: string): SqliteDatabase {
  const sqlite = require("node:sqlite") as {
    DatabaseSync: new (path: string) => SqliteDatabase;
  };

  return new sqlite.DatabaseSync(databasePath);
}
