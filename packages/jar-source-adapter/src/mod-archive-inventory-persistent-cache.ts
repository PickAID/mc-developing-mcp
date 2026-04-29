import { createHash } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, normalize, resolve } from "node:path";

import {
  buildModArchiveInventory,
  type ModArchiveInventoryResult
} from "./mod-archive-inventory.js";
import { discoverModArchives } from "./mod-archives.js";

export type PersistentInventoryCacheReason =
  | "hit"
  | "miss"
  | "stale"
  | "refresh"
  | "invalid";

export interface PersistentInventoryCacheMetadata {
  hit: boolean;
  reason: PersistentInventoryCacheReason;
  databasePath: string;
  cacheKey: string;
  archiveFingerprintCount: number;
}

export interface CachedModArchiveInventoryResult
  extends ModArchiveInventoryResult {
  persistentCache: PersistentInventoryCacheMetadata;
}

export type ModArchiveInventoryBuilder = typeof buildModArchiveInventory;

interface SqliteStatement {
  get(...parameters: unknown[]): Record<string, unknown> | undefined;
  run(...parameters: unknown[]): unknown;
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface ArchiveFingerprint {
  relativePath: string;
  sizeBytes: number;
  mtimeMs: number;
}

const CACHE_SCHEMA_VERSION = 1;
const require = createRequire(import.meta.url);

export async function buildCachedModArchiveInventory(input: {
  workspaceRoot: string;
  databasePath: string;
  maxArchives?: number;
  maxNestedArchives?: number;
  refresh?: boolean;
  buildInventory?: ModArchiveInventoryBuilder;
}): Promise<CachedModArchiveInventoryResult> {
  const databasePath = normalize(resolve(input.databasePath));
  const workspaceRoot = normalize(resolve(input.workspaceRoot));
  const fingerprints = await readArchiveFingerprints({
    workspaceRoot,
    maxArchives: input.maxArchives
  });
  const fingerprintJson = stableJson(fingerprints);
  const cacheKey = buildCacheKey({
    workspaceRoot,
    maxArchives: input.maxArchives,
    maxNestedArchives: input.maxNestedArchives
  });

  await mkdir(dirname(databasePath), { recursive: true });
  const database = openDatabase(databasePath);

  try {
    initializeSchema(database);
    const cached = input.refresh
      ? { reason: "miss" as const }
      : readCachedInventory(database, cacheKey, fingerprintJson);
    if (cached.inventory) {
      return {
        ...cached.inventory,
        persistentCache: buildPersistentCacheMetadata({
          hit: true,
          reason: "hit",
          databasePath,
          cacheKey,
          fingerprints
        })
      };
    }

    const inventory = await (input.buildInventory ?? buildModArchiveInventory)({
      workspaceRoot,
      maxArchives: input.maxArchives,
      maxNestedArchives: input.maxNestedArchives
    });
    const storableInventory = stripTransientCache(inventory);

    writeCachedInventory(database, {
      cacheKey,
      workspaceRoot,
      fingerprintJson,
      inventory: storableInventory
    });

    return {
      ...storableInventory,
      persistentCache: buildPersistentCacheMetadata({
        hit: false,
        reason: input.refresh ? "refresh" : cached.reason,
        databasePath,
        cacheKey,
        fingerprints
      })
    };
  } finally {
    database.close();
  }
}

function readCachedInventory(
  database: SqliteDatabase,
  cacheKey: string,
  fingerprintJson: string
): {
  inventory?: ModArchiveInventoryResult;
  reason: Exclude<PersistentInventoryCacheReason, "hit" | "refresh">;
} {
  const row = database
    .prepare(
      "SELECT fingerprint_json, inventory_json FROM mod_archive_inventory_cache WHERE cache_key = ?"
    )
    .get(cacheKey);
  if (!row) {
    return { reason: "miss" };
  }
  if (row.fingerprint_json !== fingerprintJson) {
    return { reason: "stale" };
  }
  if (typeof row.inventory_json !== "string") {
    return { reason: "invalid" };
  }

  try {
    return {
      inventory: JSON.parse(row.inventory_json) as ModArchiveInventoryResult,
      reason: "miss"
    };
  } catch {
    return { reason: "invalid" };
  }
}

function writeCachedInventory(
  database: SqliteDatabase,
  input: {
    cacheKey: string;
    workspaceRoot: string;
    fingerprintJson: string;
    inventory: ModArchiveInventoryResult;
  }
): void {
  database
    .prepare(
      [
        "INSERT INTO mod_archive_inventory_cache",
        "(cache_key, workspace_root, fingerprint_json, inventory_json, updated_at)",
        "VALUES (?, ?, ?, ?, ?)",
        "ON CONFLICT(cache_key) DO UPDATE SET",
        "workspace_root = excluded.workspace_root,",
        "fingerprint_json = excluded.fingerprint_json,",
        "inventory_json = excluded.inventory_json,",
        "updated_at = excluded.updated_at"
      ].join(" ")
    )
    .run(
      input.cacheKey,
      input.workspaceRoot,
      input.fingerprintJson,
      stableJson(input.inventory),
      Date.now()
    );
}

async function readArchiveFingerprints(input: {
  workspaceRoot: string;
  maxArchives?: number;
}): Promise<ArchiveFingerprint[]> {
  const discovered = await discoverModArchives({
    workspaceRoot: input.workspaceRoot,
    maxArchives: input.maxArchives
  });
  const fingerprints = await Promise.all(
    discovered.archives.map(async (archive) => {
      const details = await stat(archive.archivePath);
      return {
        relativePath: archive.relativePath,
        sizeBytes: details.size,
        mtimeMs: Math.floor(details.mtimeMs)
      };
    })
  );

  return fingerprints.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
}

function buildCacheKey(input: {
  workspaceRoot: string;
  maxArchives?: number;
  maxNestedArchives?: number;
}): string {
  return createHash("sha256")
    .update(
      stableJson({
        schemaVersion: CACHE_SCHEMA_VERSION,
        workspaceRoot: input.workspaceRoot,
        maxArchives: input.maxArchives ?? null,
        maxNestedArchives: input.maxNestedArchives ?? null
      })
    )
    .digest("hex");
}

function buildPersistentCacheMetadata(input: {
  hit: boolean;
  reason: PersistentInventoryCacheReason;
  databasePath: string;
  cacheKey: string;
  fingerprints: ArchiveFingerprint[];
}): PersistentInventoryCacheMetadata {
  return {
    hit: input.hit,
    reason: input.reason,
    databasePath: input.databasePath,
    cacheKey: input.cacheKey,
    archiveFingerprintCount: input.fingerprints.length
  };
}

function stripTransientCache(
  inventory: ModArchiveInventoryResult
): ModArchiveInventoryResult {
  const { cache: _cache, ...storableInventory } = inventory;
  return storableInventory;
}

function initializeSchema(database: SqliteDatabase): void {
  database.exec(`
    PRAGMA journal_mode = DELETE;

    CREATE TABLE IF NOT EXISTS mod_archive_inventory_cache (
      cache_key TEXT PRIMARY KEY,
      workspace_root TEXT NOT NULL,
      fingerprint_json TEXT NOT NULL,
      inventory_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

function openDatabase(databasePath: string): SqliteDatabase {
  const sqlite = require("node:sqlite") as {
    DatabaseSync: new (path: string) => SqliteDatabase;
  };

  return new sqlite.DatabaseSync(databasePath);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}
