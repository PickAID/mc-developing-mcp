import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, normalize, resolve } from "node:path";

import type { ArchiveContentDomain } from "./archive-content.js";
import {
  normalizeArchivePath,
  readZipCentralDirectory,
  type ZipEntry
} from "./java-source-archive.js";
import {
  classifyModArchiveAssetKind,
  parseModArchiveAssetKind,
  type ModArchiveAssetKind,
  type ModArchiveAssetSummary
} from "./mod-archive-asset-kind.js";
import {
  classifyModArchiveDataKind,
  parseModArchiveDataKind,
  type ModArchiveDataKind,
  type ModArchiveDataSummary
} from "./mod-archive-data-kind.js";
import {
  initializeModArchiveEntryIndexSchema,
  type ModArchiveEntryIndexDatabase
} from "./mod-archive-entry-index-schema.js";
import {
  createEmptyModArchiveEntryIndexSummaries,
  readModArchiveEntryIndexSummaries
} from "./mod-archive-entry-index-summaries.js";
import { discoverModArchives } from "./mod-archives.js";

export interface ModArchiveIndexedEntry {
  sourceArchive: string;
  archiveRelativePath: string;
  embeddedArchivePath?: string;
  relativePath: string;
  domain: ArchiveContentDomain;
  assetKind?: ModArchiveAssetKind;
  dataKind?: ModArchiveDataKind;
  sizeBytes: number;
}

export interface ModArchiveEntryIndexCacheMetadata {
  databasePath: string;
  archiveFingerprintCount: number;
  archiveHits: number;
  archiveMisses: number;
  archiveStale: number;
  archiveRefreshes: number;
}

export interface QueryCachedModArchiveEntriesResult {
  entries: ModArchiveIndexedEntry[];
  archiveCount: number;
  entryCount: number;
  assetSummary: ModArchiveAssetSummary;
  dataSummary: ModArchiveDataSummary;
  truncated: boolean;
  cache: ModArchiveEntryIndexCacheMetadata;
}

interface ArchiveFingerprint {
  sourceArchive: string;
  archiveRelativePath: string;
  sizeBytes: number;
  mtimeMs: number;
}

interface IndexedArchive {
  archiveKey: string;
  fingerprint: ArchiveFingerprint;
}

const CACHE_SCHEMA_VERSION = 3;
const DEFAULT_DOMAINS: ArchiveContentDomain[] = [
  "java",
  "data",
  "assets",
  "class"
];
const require = createRequire(import.meta.url);

export async function queryCachedModArchiveEntries(input: {
  workspaceRoot: string;
  databasePath: string;
  domains?: ArchiveContentDomain[];
  assetKinds?: ModArchiveAssetKind[];
  maxArchives?: number;
  limit?: number;
  refresh?: boolean;
}): Promise<QueryCachedModArchiveEntriesResult> {
  const databasePath = normalize(resolve(input.databasePath));
  const workspaceRoot = normalize(resolve(input.workspaceRoot));
  const discovered = await discoverModArchives({
    workspaceRoot,
    maxArchives: input.maxArchives
  });
  const fingerprints = await Promise.all(
    discovered.archives.map(async (archive) => {
      const details = await stat(archive.archivePath);
      return {
        sourceArchive: normalize(resolve(archive.archivePath)),
        archiveRelativePath: archive.relativePath,
        sizeBytes: details.size,
        mtimeMs: Math.floor(details.mtimeMs)
      };
    })
  );
  const cacheMetadata: ModArchiveEntryIndexCacheMetadata = {
    databasePath,
    archiveFingerprintCount: fingerprints.length,
    archiveHits: 0,
    archiveMisses: 0,
    archiveStale: 0,
    archiveRefreshes: 0
  };

  await mkdir(dirname(databasePath), { recursive: true });
  const database = openDatabase(databasePath);

  try {
    initializeModArchiveEntryIndexSchema(database);
    const indexedArchives: IndexedArchive[] = [];

    for (const fingerprint of fingerprints) {
      indexedArchives.push(
        await ensureArchiveIndexed(database, {
          fingerprint,
          refresh: input.refresh,
          cacheMetadata
        })
      );
    }

    const query = readIndexedEntries(database, {
      archiveKeys: indexedArchives.map((archive) => archive.archiveKey),
      domains: input.domains ?? DEFAULT_DOMAINS,
      assetKinds: normalizeAssetKinds(input.assetKinds),
      limit: normalizeLimit(input.limit)
    });

    return {
      entries: query.entries,
      archiveCount: indexedArchives.length,
      entryCount: query.totalCount,
      assetSummary: query.assetSummary,
      dataSummary: query.dataSummary,
      truncated: discovered.truncated || query.truncated,
      cache: cacheMetadata
    };
  } finally {
    database.close();
  }
}

async function ensureArchiveIndexed(
  database: ModArchiveEntryIndexDatabase,
  input: {
    fingerprint: ArchiveFingerprint;
    refresh?: boolean;
    cacheMetadata: ModArchiveEntryIndexCacheMetadata;
  }
): Promise<IndexedArchive> {
  const fingerprintJson = stableJson({
    schemaVersion: CACHE_SCHEMA_VERSION,
    ...input.fingerprint
  });
  const archiveKey = createHash("sha256").update(fingerprintJson).digest("hex");
  const cached = database
    .prepare(
      "SELECT archive_key, fingerprint_json FROM mod_archive_entry_index_archives WHERE source_archive = ?"
    )
    .get(input.fingerprint.sourceArchive);

  if (
    !input.refresh &&
    cached?.fingerprint_json === fingerprintJson &&
    typeof cached.archive_key === "string"
  ) {
    input.cacheMetadata.archiveHits += 1;
    return { archiveKey: cached.archive_key, fingerprint: input.fingerprint };
  }

  if (input.refresh) {
    input.cacheMetadata.archiveRefreshes += 1;
  } else if (cached) {
    input.cacheMetadata.archiveStale += 1;
  } else {
    input.cacheMetadata.archiveMisses += 1;
  }

  await writeArchiveIndex(database, {
    archiveKey,
    fingerprintJson,
    oldArchiveKey:
      typeof cached?.archive_key === "string" ? cached.archive_key : undefined,
    fingerprint: input.fingerprint,
    entries: await readIndexableEntries(input.fingerprint.sourceArchive)
  });

  return { archiveKey, fingerprint: input.fingerprint };
}

async function writeArchiveIndex(
  database: ModArchiveEntryIndexDatabase,
  input: {
    archiveKey: string;
    oldArchiveKey?: string;
    fingerprintJson: string;
    fingerprint: ArchiveFingerprint;
    entries: Array<Omit<ModArchiveIndexedEntry, "sourceArchive" | "archiveRelativePath">>;
  }
): Promise<void> {
  database.exec("BEGIN");
  try {
    if (input.oldArchiveKey) {
      database
        .prepare("DELETE FROM mod_archive_entry_index_entries WHERE archive_key = ?")
        .run(input.oldArchiveKey);
    }
    database
      .prepare("DELETE FROM mod_archive_entry_index_entries WHERE archive_key = ?")
      .run(input.archiveKey);
    database
      .prepare(
        [
          "INSERT INTO mod_archive_entry_index_archives",
          "(source_archive, archive_key, archive_relative_path, fingerprint_json, indexed_at)",
          "VALUES (?, ?, ?, ?, ?)",
          "ON CONFLICT(source_archive) DO UPDATE SET",
          "archive_key = excluded.archive_key,",
          "archive_relative_path = excluded.archive_relative_path,",
          "fingerprint_json = excluded.fingerprint_json,",
          "indexed_at = excluded.indexed_at"
        ].join(" ")
      )
      .run(
        input.fingerprint.sourceArchive,
        input.archiveKey,
        input.fingerprint.archiveRelativePath,
        input.fingerprintJson,
        Date.now()
      );

    const insertEntry = database.prepare(
      [
        "INSERT INTO mod_archive_entry_index_entries",
        "(archive_key, source_archive, archive_relative_path, embedded_archive_path, relative_path, domain, asset_kind, data_kind, size_bytes)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ].join(" ")
    );
    for (const entry of input.entries) {
      insertEntry.run(
        input.archiveKey,
        input.fingerprint.sourceArchive,
        input.fingerprint.archiveRelativePath,
        entry.embeddedArchivePath ?? "",
        entry.relativePath,
        entry.domain,
        entry.assetKind ?? "",
        entry.dataKind ?? "",
        entry.sizeBytes
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

async function readIndexableEntries(
  sourceArchive: string
): Promise<Array<Omit<ModArchiveIndexedEntry, "sourceArchive" | "archiveRelativePath">>> {
  const archive = await readFile(sourceArchive);
  return collectIndexableEntries(readZipCentralDirectory(archive));
}

function collectIndexableEntries(
  entries: ZipEntry[]
): Array<Omit<ModArchiveIndexedEntry, "sourceArchive" | "archiveRelativePath">> {
  return entries
    .flatMap((entry) => {
      if (entry.name.endsWith("/")) {
        return [];
      }

      const relativePath = normalizeArchivePath(entry.name);
      const domain = relativePath
        ? classifyArchiveContentDomain(relativePath)
        : undefined;
      if (!relativePath || !domain) {
        return [];
      }

      return [{
        relativePath,
        domain,
        assetKind: classifyModArchiveAssetKind(relativePath),
        dataKind: classifyModArchiveDataKind(relativePath),
        sizeBytes: entry.uncompressedSize
      }];
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function readIndexedEntries(
  database: ModArchiveEntryIndexDatabase,
  input: {
    archiveKeys: string[];
    domains: ArchiveContentDomain[];
    assetKinds: ModArchiveAssetKind[];
    limit: number;
  }
): {
  entries: ModArchiveIndexedEntry[];
  totalCount: number;
  assetSummary: ModArchiveAssetSummary;
  dataSummary: ModArchiveDataSummary;
  truncated: boolean;
} {
  if (input.archiveKeys.length === 0 || input.domains.length === 0) {
    return {
      entries: [],
      totalCount: 0,
      ...createEmptyModArchiveEntryIndexSummaries(),
      truncated: false
    };
  }

  const archivePlaceholders = input.archiveKeys.map(() => "?").join(", ");
  const domainPlaceholders = input.domains.map(() => "?").join(", ");
  const filterSqlParts = [
    `WHERE archive_key IN (${archivePlaceholders})`,
    `AND domain IN (${domainPlaceholders})`
  ];
  const filterParameters: Array<string> = [...input.archiveKeys, ...input.domains];

  if (input.assetKinds.length > 0) {
    filterSqlParts.push(
      `AND asset_kind IN (${input.assetKinds.map(() => "?").join(", ")})`
    );
    filterParameters.push(...input.assetKinds);
  }

  const filterSql = filterSqlParts.join(" ");
  const countRow = database
    .prepare(
      `SELECT COUNT(*) AS total_count FROM mod_archive_entry_index_entries ${filterSql}`
    )
    .get(...filterParameters);
  const rows = database
    .prepare(
      [
        "SELECT source_archive, archive_relative_path, embedded_archive_path, relative_path, domain, asset_kind, data_kind, size_bytes",
        "FROM mod_archive_entry_index_entries",
        filterSql,
        "ORDER BY archive_relative_path, embedded_archive_path, relative_path",
        "LIMIT ?"
      ].join(" ")
    )
    .all(...filterParameters, input.limit + 1);
  const entries = rows.slice(0, input.limit).map(rowToIndexedEntry);

  return {
    entries,
    totalCount: Number(countRow?.total_count ?? 0),
    ...readModArchiveEntryIndexSummaries(database, filterSql, filterParameters),
    truncated: rows.length > input.limit
  };
}

function rowToIndexedEntry(row: Record<string, unknown>): ModArchiveIndexedEntry {
  const embeddedArchivePath =
    typeof row.embedded_archive_path === "string" && row.embedded_archive_path
      ? row.embedded_archive_path
      : undefined;

  return {
    sourceArchive: String(row.source_archive),
    archiveRelativePath: String(row.archive_relative_path),
    embeddedArchivePath,
    relativePath: String(row.relative_path),
    domain: row.domain as ArchiveContentDomain,
    assetKind: parseModArchiveAssetKind(row.asset_kind),
    dataKind: parseModArchiveDataKind(row.data_kind),
    sizeBytes: Number(row.size_bytes)
  };
}

function classifyArchiveContentDomain(
  relativePath: string
): ArchiveContentDomain | undefined {
  if (relativePath.endsWith(".java")) {
    return "java";
  }
  if (relativePath.endsWith(".class")) {
    return "class";
  }
  if (relativePath.startsWith("data/")) {
    return "data";
  }
  return relativePath.startsWith("assets/") ? "assets" : undefined;
}

function openDatabase(databasePath: string): ModArchiveEntryIndexDatabase {
  const sqlite = require("node:sqlite") as {
    DatabaseSync: new (path: string) => ModArchiveEntryIndexDatabase;
  };

  return new sqlite.DatabaseSync(databasePath);
}

function normalizeAssetKinds(
  assetKinds: ModArchiveAssetKind[] | undefined
): ModArchiveAssetKind[] {
  return [
    ...new Set(
      (assetKinds ?? []).flatMap((assetKind) => {
        const parsed = parseModArchiveAssetKind(assetKind);
        return parsed ? [parsed] : [];
      })
    )
  ];
}

function normalizeLimit(limit: number | undefined): number {
  return Math.max(0, Math.floor(limit ?? Number.MAX_SAFE_INTEGER - 1));
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}
