import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

import type { DocsPackageRecord } from "./records.js";
import {
  buildDocsSearchHit,
  type DocsSearchHit
} from "./search.js";
import { synthesizeGuidanceRecords } from "./guidance-synthesis.js";
import { readMdmDocsArtifactMetadata } from "./mdm-artifact-metadata.js";

const require = createRequire(import.meta.url);

export async function readMdmDocsResourceRecords(
  artifactPath: string,
  options: { storageKind?: string } = {}
): Promise<DocsPackageRecord[]> {
  if (options.storageKind === "sqlite_bundle") {
    return readMdmDocsSqliteRecords(artifactPath);
  }

  return toMdmDocsResourceRecords(
    JSON.parse(await readFile(artifactPath, "utf-8"))
  );
}

export function readMdmDocsSqliteRecords(
  artifactPath: string
): DocsPackageRecord[] {
  const database = openDatabase(artifactPath);
  try {
    const rows = database.prepare(
      [
        "SELECT entry_id, package_id, kind, title, path, headings, summary,",
        "search_terms, script_scopes, addon_names, event_names, code_symbols",
        "FROM docs_entries ORDER BY package_id, entry_id"
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

export function toMdmDocsResourceRecords(value: unknown): DocsPackageRecord[] {
  const artifact = readArtifact(value);
  const records: DocsPackageRecord[] = [];

  for (const payload of Object.values(artifact.payload)) {
    const content = readJsonPayload(payload.content, payload.repoPath);
    if (!content.entries) {
      records.push(
        ...synthesizeGuidanceRecords({
          packageId: artifact.packageId,
          displayName: artifact.displayName,
          repoPath: payload.repoPath,
          content: content.raw,
          packageSearchTerms: artifact.searchTerms
        })
      );
      continue;
    }

    for (const entry of content.entries) {
      records.push({
        entryId: entry.id,
        packageId: artifact.packageId,
        kind: entry.kind ?? "concept",
        title: entry.title,
        path: `${payload.repoPath}#${entry.id}`,
        headings: entry.headings ?? [],
        summary: entry.summary,
        searchTerms: entry.searchTerms ?? [
          entry.id,
          entry.title,
          entry.summary
        ],
        scriptScopes: entry.scriptScopes ?? [],
        addonNames: entry.addonNames ?? [],
        eventNames: entry.eventNames ?? [],
        codeSymbols: entry.codeSymbols ?? [],
        ...docsEntryMetadata(entry)
      });
    }
  }

  return records;
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

  return database.prepare(
    [
      "SELECT docs_entries.entry_id, docs_entries.package_id, docs_entries.kind,",
      "docs_entries.title, docs_entries.path, docs_entries.headings,",
      "docs_entries.summary, docs_entries.search_terms,",
      "docs_entries.script_scopes, docs_entries.addon_names,",
      "docs_entries.event_names, docs_entries.code_symbols,",
      "bm25(docs_entries_fts) AS search_rank, 'fts' AS search_source",
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

  return database.prepare(
    [
      "SELECT entry_id, package_id, kind, title, path, headings, summary,",
      "search_terms, script_scopes, addon_names, event_names, code_symbols,",
      "NULL AS search_rank, 'like' AS search_source",
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
    matchReasons: [sqliteMatchReason(row.search_source, row.search_rank)]
  };
}

function readArtifact(value: unknown): MdmDocsArtifact {
  const record = objectField(value, "mdm docs artifact");
  const packageRecord = objectField(record.package, "mdm docs package");
  const metadata = readMdmDocsArtifactMetadata(packageRecord);

  if (metadata.artifactType !== "docs") {
    return {
      packageId: metadata.packageId,
      displayName: metadata.displayName,
      searchTerms: [],
      payload: {}
    };
  }

  return {
    packageId: metadata.packageId,
    displayName: metadata.displayName,
    searchTerms: metadata.searchTerms,
    payload: Object.fromEntries(
      Object.entries(objectField(record.payload, "mdm docs payload")).map(
        ([key, payload]) => [key, readPayload(payload)]
      )
    )
  };
}

function readPayload(value: unknown): MdmDocsPayload {
  const record = objectField(value, "mdm docs payload item");

  return {
    repoPath: stringField(record, "repoPath"),
    content: stringField(record, "content")
  };
}

function readJsonPayload(content: string, repoPath: string): MdmDocsContent {
  const record = objectField(JSON.parse(content), `mdm docs content ${repoPath}`);
  const entries = Array.isArray(record.entries)
    ? record.entries.map(readEntry)
    : undefined;

  return { entries, raw: record };
}

function readEntry(value: unknown): MdmDocsEntry {
  const record = objectField(value, "mdm docs entry");

  return {
    id: stringField(record, "id"),
    title: stringField(record, "title"),
    summary: stringField(record, "summary"),
    kind: optionalKind(record.kind),
    headings: optionalStringArray(record.headings),
    searchTerms: optionalStringArray(record.searchTerms),
    scriptScopes: optionalStringArray(record.scriptScopes),
    addonNames: optionalStringArray(record.addonNames),
    eventNames: optionalStringArray(record.eventNames),
    codeSymbols: optionalStringArray(record.codeSymbols),
    metadata: optionalMetadata({
      schemaDefinitionOutlines: record.schemaDefinitionOutlines,
      schemaDefinitions: record.schemaDefinitions,
      schemaSymbol: record.schemaSymbol,
      upstreamPath: record.upstreamPath,
      contentHash: record.contentHash
    })
  };
}

function optionalMetadata(value: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function docsEntryMetadata(
  entry: MdmDocsEntry
): Pick<DocsPackageRecord, "metadata"> | Record<string, never> {
  const metadata = optionalMetadata({
    schemaDefinitionOutlines: entry.schemaDefinitionOutlines,
    schemaDefinitions: entry.schemaDefinitions,
    schemaSymbol: entry.schemaSymbol,
    upstreamPath: entry.upstreamPath,
    contentHash: entry.contentHash,
    ...entry.metadata
  });

  return metadata ? { metadata } : {};
}

function optionalKind(value: unknown): DocsPackageRecord["kind"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return stringField({ kind: value }, "kind") as DocsPackageRecord["kind"];
}

function readSqliteDocsEntry(row: Record<string, unknown>): DocsPackageRecord {
  const entryId = stringField(row, "entry_id");
  const title = stringField(row, "title");
  const summary = stringField(row, "summary");

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
    codeSymbols: parseJsonStringArray(row.code_symbols, "code_symbols")
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

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return arrayField({ value }, "value").map((entry) =>
    stringField({ entry }, "entry")
  );
}

function objectField(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function arrayField(
  record: Record<string, unknown>,
  field: string
): unknown[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new Error(`mdm docs field ${field} must be an array.`);
  }

  return value;
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

interface MdmDocsArtifact {
  packageId: string;
  displayName: string;
  searchTerms: string[];
  payload: Record<string, MdmDocsPayload>;
}

interface MdmDocsPayload {
  repoPath: string;
  content: string;
}

interface MdmDocsContent {
  entries?: MdmDocsEntry[];
  raw: Record<string, unknown>;
}

interface MdmDocsEntry {
  id: string;
  title: string;
  summary: string;
  kind?: DocsPackageRecord["kind"];
  headings?: string[];
  searchTerms?: string[];
  scriptScopes?: string[];
  addonNames?: string[];
  eventNames?: string[];
  codeSymbols?: string[];
  metadata?: Record<string, unknown>;
  schemaDefinitionOutlines?: unknown;
  schemaDefinitions?: unknown;
  schemaSymbol?: unknown;
  upstreamPath?: unknown;
  contentHash?: unknown;
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
