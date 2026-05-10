import { createRequire } from "node:module";

import type { DocsPackageRecord } from "./records.js";
import {
  buildDocsSearchHit,
  type DocsSearchHit
} from "./search.js";

const require = createRequire(import.meta.url);

export function readMdmDocsSqliteRecords(
  artifactPath: string
): DocsPackageRecord[] {
  const database = openDatabase(artifactPath);
  try {
    const metadataColumn = hasColumn(database, "docs_entries", "metadata")
      ? ", metadata"
      : "";
    const rows = database.prepare(
      [
        "SELECT entry_id, package_id, kind, title, path, headings, summary,",
        "search_terms, script_scopes, addon_names, event_names, code_symbols",
        `${metadataColumn} FROM docs_entries ORDER BY package_id, entry_id`
      ].join(" ")
    ).all();

    return rows.map(readSqliteDocsEntry);
  } finally {
    database.close();
  }
}

export function searchMdmDocsSqliteRecords(
  artifactPath: string,
  queryText: string,
  limit = 5
): DocsSearchHit[] {
  const normalizedQuery = normalize(queryText);
  if (normalizedQuery.length === 0 || limit <= 0) {
    return [];
  }

  const database = openDatabase(artifactPath);
  try {
    const rows = hasTable(database, "docs_entries_fts")
      ? searchMdmDocsSqliteFts(database, queryText, limit)
      : searchMdmDocsSqliteLike(database, normalizedQuery, limit);

    return rows.map((row) => readSqliteDocsSearchHit(row, normalizedQuery));
  } finally {
    database.close();
  }
}

function searchMdmDocsSqliteFts(
  database: SqliteDatabase,
  queryText: string,
  limit: number
): Array<Record<string, unknown>> {
  const ftsQuery = toFtsMatchQuery(queryText);
  if (ftsQuery.length === 0) {
    return [];
  }
  const metadataColumn = hasColumn(database, "docs_entries", "metadata")
    ? ", docs_entries.metadata"
    : "";

  return database.prepare(
    [
      "SELECT docs_entries.entry_id, docs_entries.package_id, docs_entries.kind,",
      "docs_entries.title, docs_entries.path, docs_entries.headings,",
      "docs_entries.summary, docs_entries.search_terms,",
      "docs_entries.script_scopes, docs_entries.addon_names,",
      "docs_entries.event_names, docs_entries.code_symbols,",
      `bm25(docs_entries_fts) AS search_rank, 'fts' AS search_source${metadataColumn}`,
      "FROM docs_entries_fts",
      "JOIN docs_entries ON docs_entries.entry_id = docs_entries_fts.entry_id",
      "WHERE docs_entries_fts MATCH ?",
      "ORDER BY search_rank, docs_entries.package_id, docs_entries.entry_id",
      "LIMIT ?"
    ].join(" ")
  ).all(ftsQuery, limit);
}

function searchMdmDocsSqliteLike(
  database: SqliteDatabase,
  normalizedQuery: string,
  limit: number
): Array<Record<string, unknown>> {
  const terms = toLikeTerms(normalizedQuery);
  if (terms.length === 0) {
    return [];
  }
  const fields = [
    "title",
    "path",
    "summary",
    "search_terms",
    "script_scopes",
    "addon_names",
    "event_names",
    "code_symbols"
  ];
  const predicates = terms.flatMap(() =>
    fields.map((field) => `lower(${field}) LIKE ? ESCAPE '\\'`)
  );
  const values = terms.flatMap((term) =>
    fields.map(() => `%${escapeLike(term)}%`)
  );
  const metadataColumn = hasColumn(database, "docs_entries", "metadata")
    ? ", metadata"
    : "";

  return database.prepare(
    [
      "SELECT entry_id, package_id, kind, title, path, headings, summary,",
      "search_terms, script_scopes, addon_names, event_names, code_symbols,",
      `NULL AS search_rank, 'like' AS search_source${metadataColumn}`,
      `FROM docs_entries WHERE ${predicates.join(" OR ")}`,
      "ORDER BY package_id, entry_id LIMIT ?"
    ].join(" ")
  ).all(...values, limit);
}

function readSqliteDocsSearchHit(
  row: Record<string, unknown>,
  normalizedQuery: string
): DocsSearchHit {
  const record = readSqliteDocsEntry(row);
  const hit = buildDocsSearchHit(record, normalizedQuery, "sqlite");
  if (hit !== undefined) {
    return {
      ...hit,
      matchReasons: [
        ...hit.matchReasons,
        sqliteMatchReason(row.search_source, row.search_rank)
      ]
    };
  }

  return {
    entryId: record.entryId,
    packageId: record.packageId,
    kind: record.kind,
    source: "sqlite",
    title: record.title,
    path: record.path,
    summary: record.summary,
    score: sqliteScore(row.search_source, row.search_rank),
    matchedTerms: [normalizedQuery],
    matchReasons: [sqliteMatchReason(row.search_source, row.search_rank)],
    ...(record.metadata ? { metadata: record.metadata } : {})
  };
}

function readSqliteDocsEntry(row: Record<string, unknown>): DocsPackageRecord {
  const entryId = stringField(row, "entry_id");
  const title = stringField(row, "title");
  const summary = stringField(row, "summary");
  const metadata = parseJsonObject(row.metadata, "metadata");

  return {
    entryId,
    packageId: stringField(row, "package_id"),
    kind: (row.kind === null ? "concept" : optionalKind(row.kind)) ?? "concept",
    title,
    path: stringField(row, "path"),
    headings: parseJsonStringArray(row.headings, "headings"),
    summary,
    searchTerms: parseJsonStringArray(row.search_terms, "search_terms", [
      entryId,
      title,
      summary
    ]),
    scriptScopes: parseJsonStringArray(row.script_scopes, "script_scopes"),
    addonNames: parseJsonStringArray(row.addon_names, "addon_names"),
    eventNames: parseJsonStringArray(row.event_names, "event_names"),
    codeSymbols: parseJsonStringArray(row.code_symbols, "code_symbols"),
    ...(metadata ? { metadata } : {})
  };
}

function parseJsonStringArray(
  value: unknown,
  label: string,
  fallback: string[] = []
): string[] {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value !== "string") {
    throw new Error(`mdm docs sqlite field ${label} must be a JSON string.`);
  }
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new Error(`mdm docs sqlite field ${label} must be a string array.`);
  }
  return parsed;
}

function parseJsonObject(
  value: unknown,
  label: string
): Record<string, unknown> | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`mdm docs sqlite field ${label} must be a JSON string.`);
  }
  const parsed = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`mdm docs sqlite field ${label} must be an object.`);
  }
  return parsed as Record<string, unknown>;
}

function optionalKind(value: unknown): DocsPackageRecord["kind"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return stringField({ kind: value }, "kind") as DocsPackageRecord["kind"];
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`mdm docs field ${field} must be a non-empty string.`);
  }

  return value;
}

function hasTable(database: SqliteDatabase, tableName: string): boolean {
  const rows = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).all(tableName);

  return rows.length > 0;
}

function hasColumn(
  database: SqliteDatabase,
  tableName: string,
  columnName: string
): boolean {
  const rows = database.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
}

function sqliteMatchReason(source: unknown, rank: unknown): string {
  const searchSource = source === "fts" ? "fts" : "like";
  if (typeof rank !== "number") {
    return `sqlite_${searchSource}:match`;
  }

  return `sqlite_${searchSource}:rank=${rank}`;
}

function sqliteScore(source: unknown, rank: unknown): number {
  if (source === "fts" && typeof rank === "number") {
    return Math.max(1, Math.round(1000 - rank * 100));
  }

  return 1;
}

function toFtsMatchQuery(queryText: string): string {
  return queryText
    .trim()
    .split(/\s+/)
    .map((term) => term.replaceAll('"', '""'))
    .filter((term) => term.length > 0)
    .map((term) => `"${term}"`)
    .join(" OR ");
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function toLikeTerms(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[^\p{L}\p{N}._:-]+/u)
        .map((term) => term.trim())
        .filter((term) => term.length > 0)
    )
  ];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

interface SqliteDatabase {
  prepare(sql: string): {
    all(...values: unknown[]): Array<Record<string, unknown>>;
  };
  close(): void;
}

function openDatabase(databasePath: string): SqliteDatabase {
  const sqlite = require("node:sqlite") as {
    DatabaseSync: new (path: string) => SqliteDatabase;
  };
  return new sqlite.DatabaseSync(databasePath);
}
