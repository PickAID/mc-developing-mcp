import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  readCachedResourceState,
  resolveMdmResourceCacheLayout
} from "./cache.js";
import {
  ensureMdmReleasePackageCached,
  type MdmArtifactFetch
} from "./installer.js";
import type { MdmReleaseManifest } from "./release-manifest.js";

describe("ensureMdmReleasePackageCached", () => {
  it("requires explicit download permission before fetching release artifacts", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-install-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    let fetchCalls = 0;

    const result = await ensureMdmReleasePackageCached({
      manifest: fixtureManifest("payload"),
      packageId: "core-docs-required",
      cacheLayout,
      fetcher: async () => {
        fetchCalls += 1;
        return okResponse("payload");
      }
    });

    expect(fetchCalls).toBe(0);
    expect(result).toMatchObject({
      status: "needs_confirmation",
      packageId: "core-docs-required"
    });
    await expect(
      readCachedResourceState(cacheLayout, "core-docs-required")
    ).resolves.toBeUndefined();
  });

  it("downloads, verifies, and records a release artifact when allowed", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-install-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const body = JSON.stringify({ ok: true });

    const result = await ensureMdmReleasePackageCached({
      manifest: fixtureManifest(body),
      packageId: "core-docs-required",
      cacheLayout,
      downloadPolicy: "allowed",
      now: () => "2026-04-29T00:00:00.000Z",
      fetcher: async (url) => {
        expect(url).toBe(
          "https://example.test/releases/download/mdm-resources-v0.1.0/core-docs-required-0.1.0.mdm-resource.json"
        );
        return okResponse(body);
      }
    });

    expect(result).toMatchObject({
      status: "downloaded",
      packageId: "core-docs-required"
    });
    expect(result.state?.sha256).toBe(sha256(body));
    await expect(readFile(result.state?.artifactPath ?? "", "utf-8")).resolves.toBe(
      body
    );
    await expect(
      readCachedResourceState(cacheLayout, "core-docs-required")
    ).resolves.toMatchObject({
      packageId: "core-docs-required",
      sha256: sha256(body)
    });
  });

  it("does not write cache state when the downloaded checksum is invalid", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-install-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);

    const result = await ensureMdmReleasePackageCached({
      manifest: fixtureManifest("expected"),
      packageId: "core-docs-required",
      cacheLayout,
      downloadPolicy: "allowed",
      fetcher: async () => okResponse("actual")
    });

    expect(result).toMatchObject({
      status: "invalid_checksum",
      packageId: "core-docs-required",
      expectedSha256: sha256("expected"),
      actualSha256: sha256("actual")
    });
    await expect(
      readCachedResourceState(cacheLayout, "core-docs-required")
    ).resolves.toBeUndefined();
  });

  it("rejects SQLite artifacts missing required tables before writing cache state", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-install-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const bytes = await sqliteFixture(async (database) => {
      database.exec("PRAGMA user_version = 3");
      database.exec("CREATE TABLE docs_entries(id TEXT PRIMARY KEY)");
    });

    const result = await ensureMdmReleasePackageCached({
      manifest: sqliteManifest(bytes, {
        requiredTables: ["docs_entries", "docs_entries_fts"],
        minUserVersion: 3
      }),
      packageId: "core-docs-sqlite",
      cacheLayout,
      downloadPolicy: "allowed",
      fetcher: async () => okResponse(bytes)
    });

    expect(result).toMatchObject({
      status: "invalid_artifact",
      packageId: "core-docs-sqlite",
      message: expect.stringContaining("missing required table(s): docs_entries_fts")
    });
    await expect(
      readCachedResourceState(cacheLayout, "core-docs-sqlite")
    ).resolves.toBeUndefined();
  });

  it("rejects empty source-index SQLite artifacts before writing cache state", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-install-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const bytes = await sqliteFixture(async (database) => {
      database.exec("PRAGMA user_version = 3");
      database.exec("CREATE TABLE files(id TEXT PRIMARY KEY)");
      database.exec("CREATE TABLE java_symbols(id TEXT PRIMARY KEY)");
      database.exec("CREATE TABLE java_members(id TEXT PRIMARY KEY)");
      database.exec("CREATE VIRTUAL TABLE fts_files USING fts5(path)");
      database.exec("CREATE TABLE source_chunks(chunk_id TEXT PRIMARY KEY)");
      database.exec("CREATE VIRTUAL TABLE fts_chunks USING fts5(content)");
    });

    const result = await ensureMdmReleasePackageCached({
      manifest: sourceIndexManifest(bytes),
      packageId: "minecraft-1.20.1-source-index",
      cacheLayout,
      downloadPolicy: "allowed",
      fetcher: async () => okResponse(bytes)
    });

    expect(result).toMatchObject({
      status: "invalid_artifact",
      packageId: "minecraft-1.20.1-source-index",
      message: expect.stringContaining(
        "source index sqlite must contain indexed files and chunks"
      )
    });
    await expect(
      readCachedResourceState(cacheLayout, "minecraft-1.20.1-source-index")
    ).resolves.toBeUndefined();
  });

  it("uses docs SQLite default required tables when metadata omits table names", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-install-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const bytes = await sqliteFixture(async (database) => {
      database.exec("PRAGMA user_version = 3");
      database.exec("CREATE TABLE docs_entries(id TEXT PRIMARY KEY)");
    });

    const result = await ensureMdmReleasePackageCached({
      manifest: sqliteManifestWithoutRequiredTables(bytes),
      packageId: "core-docs-sqlite",
      cacheLayout,
      downloadPolicy: "allowed",
      fetcher: async () => okResponse(bytes)
    });

    expect(result).toMatchObject({
      status: "invalid_artifact",
      packageId: "core-docs-sqlite",
      message: expect.stringContaining("docs_entries_fts")
    });
    await expect(
      readCachedResourceState(cacheLayout, "core-docs-sqlite")
    ).resolves.toBeUndefined();
  });
});

function fixtureManifest(body: string): MdmReleaseManifest {
  return {
    source:
      "https://example.test/releases/download/mdm-resources-v0.1.0/mdm-release-manifest.json",
    schemaVersion: 1,
    generatedAt: "2026-04-29T01:05:10.846Z",
    packages: [
      {
        packageId: "core-docs-required",
        version: "0.1.0",
        namespace: "core",
        artifactType: "docs",
        variant: "required",
        required: true,
        format: "json",
        artifactName: "core-docs-required-0.1.0.mdm-resource.json",
        sha256: sha256(body),
        sizeBytes: Buffer.byteLength(body)
      }
    ]
  };
}

function sqliteManifest(
  body: Buffer,
  sqlite: { requiredTables: string[]; minUserVersion: number }
): MdmReleaseManifest {
  return {
    source:
      "https://example.test/releases/download/mdm-resources-v0.1.0/mdm-release-manifest.json",
    schemaVersion: 1,
    generatedAt: "2026-04-29T01:05:10.846Z",
    packages: [
      {
        packageId: "core-docs-sqlite",
        version: "0.1.0",
        namespace: "core",
        artifactType: "docs",
        variant: "docs",
        required: false,
        format: "sqlite",
        artifactName: "core-docs-sqlite-0.1.0.sqlite",
        sha256: sha256(body),
        sizeBytes: body.byteLength,
        metadata: {
          storageKind: "sqlite_bundle",
          installTier: "optional_dataset",
          commitPolicy: "repository_manifest",
          sqlite: {
            databaseName: "core-docs-sqlite.sqlite",
            ...sqlite
          }
        }
      }
    ]
  };
}

function sourceIndexManifest(body: Buffer): MdmReleaseManifest {
  return {
    ...sqliteManifest(body, {
      requiredTables: [
        "files",
        "java_symbols",
        "java_members",
        "fts_files",
        "source_chunks",
        "fts_chunks"
      ],
      minUserVersion: 3
    }),
    packages: [
      {
        ...sqliteManifest(body, {
          requiredTables: [
            "files",
            "java_symbols",
            "java_members",
            "fts_files",
            "source_chunks",
            "fts_chunks"
          ],
          minUserVersion: 3
        }).packages[0],
        packageId: "minecraft-1.20.1-source-index",
        artifactType: "source_index",
        artifactKind: "source_index",
        queryAdapter: "source_index_sqlite",
        artifactName: "minecraft-1.20.1-source-index-0.1.0.sqlite"
      }
    ]
  };
}

function sqliteManifestWithoutRequiredTables(body: Buffer): MdmReleaseManifest {
  const manifest = sqliteManifest(body, {
    requiredTables: ["docs_entries"],
    minUserVersion: 3
  });

  return {
    ...manifest,
    packages: [
      {
        ...manifest.packages[0],
        metadata: {
          storageKind: "sqlite_bundle",
          installTier: "optional_dataset",
          commitPolicy: "repository_manifest",
          sqlite: {
            databaseName: "core-docs-sqlite.sqlite",
            minUserVersion: 3
          }
        }
      }
    ]
  };
}

function okResponse(body: string | Buffer): Awaited<ReturnType<MdmArtifactFetch>> {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => Buffer.from(body)
  };
}

function sha256(body: string | Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

async function sqliteFixture(
  writeSchema: (database: TestSqliteDatabase) => void
): Promise<Buffer> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-sqlite-"));
  const databasePath = join(root, "fixture.sqlite");
  const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
    DatabaseSync: new (path: string) => TestSqliteDatabase;
  };
  const database = new DatabaseSync(databasePath);
  try {
    writeSchema(database);
  } finally {
    database.close();
  }

  return readFile(databasePath);
}

interface TestSqliteDatabase {
  exec(sql: string): void;
  close(): void;
}
