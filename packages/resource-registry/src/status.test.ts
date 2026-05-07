import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  resolveMdmResourceCacheLayout,
  writeCachedResourceState
} from "./cache.js";
import type { MdmResourceRegistry } from "./manifest.js";
import { summarizeMdmResourceStatus } from "./status.js";

const require = createRequire(import.meta.url);

describe("summarizeMdmResourceStatus", () => {
  it("reports missing required and optional packages separately", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-status-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);

    await expect(
      summarizeMdmResourceStatus({
        registry: registryWith([
          packageEntry("core-docs-required", true),
          packageEntry("content-docs-optional", false)
        ]),
        cacheLayout
      })
    ).resolves.toMatchObject({
      packages: [
        {
          packageId: "core-docs-required",
          status: "missing_required",
          metadata: {
            storageKind: "remote_manifest",
            installTier: "required_docs",
            commitPolicy: "repository_manifest"
          }
        },
        {
          packageId: "content-docs-optional",
          status: "missing_optional",
          metadata: {
            storageKind: "remote_manifest",
            installTier: "optional_dataset",
            commitPolicy: "repository_manifest"
          }
        }
      ],
      counts: {
        missing_required: 1,
        missing_optional: 1,
        ready: 0,
        invalid_checksum: 0
      }
    });
  });

  it("reports ready when a cached artifact matches the registry checksum", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-status-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const artifactPath = join(cacheLayout.artifactsDir, "core-docs-required", "artifact.json");
    const body = JSON.stringify({ ok: true });
    const sha256 = createHash("sha256").update(body).digest("hex");

    await mkdir(join(cacheLayout.artifactsDir, "core-docs-required"), {
      recursive: true
    });
    await writeFile(artifactPath, body);
    await writeCachedResourceState(cacheLayout, {
      packageId: "core-docs-required",
      artifactName: "core-docs-required-0.1.0.mdm-resource.json",
      artifactPath,
      sha256,
      updatedAt: "2026-04-29T00:00:00.000Z"
    });

    await expect(
      summarizeMdmResourceStatus({
        registry: registryWith([packageEntry("core-docs-required", true, sha256)]),
        cacheLayout
      })
    ).resolves.toMatchObject({
      packages: [
        {
          packageId: "core-docs-required",
          status: "ready",
          metadata: {
            storageKind: "remote_manifest",
            installTier: "required_docs",
            commitPolicy: "repository_manifest"
          }
        }
      ],
      counts: {
        missing_required: 0,
        missing_optional: 0,
        ready: 1,
        invalid_checksum: 0
      }
    });
  });

  it("reports invalid_checksum when a cached artifact checksum differs", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-status-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const artifactPath = join(cacheLayout.artifactsDir, "core-docs-required", "artifact.json");

    await mkdir(join(cacheLayout.artifactsDir, "core-docs-required"), {
      recursive: true
    });
    await writeFile(artifactPath, "actual");
    await writeCachedResourceState(cacheLayout, {
      packageId: "core-docs-required",
      artifactName: "core-docs-required-0.1.0.mdm-resource.json",
      artifactPath,
      sha256: createHash("sha256").update("actual").digest("hex"),
      updatedAt: "2026-04-29T00:00:00.000Z"
    });

    await expect(
      summarizeMdmResourceStatus({
        registry: registryWith([
          packageEntry("core-docs-required", true, createHash("sha256").update("expected").digest("hex"))
        ]),
        cacheLayout
      })
    ).resolves.toMatchObject({
      packages: [
        {
          packageId: "core-docs-required",
          status: "invalid_checksum",
          metadata: {
            storageKind: "remote_manifest",
            installTier: "required_docs",
            commitPolicy: "repository_manifest"
          }
        }
      ],
      counts: {
        missing_required: 0,
        missing_optional: 0,
        ready: 0,
        invalid_checksum: 1
      }
    });
  });

  it("reports ready for a sqlite bundle with required tables and user_version", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-status-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const artifactPath = join(cacheLayout.artifactsDir, "docs-sqlite", "artifact.sqlite");

    await mkdir(join(cacheLayout.artifactsDir, "docs-sqlite"), {
      recursive: true
    });
    createSqliteArtifact(artifactPath, 3, ["docs_entries"]);
    const sha256 = await sha256File(artifactPath);
    await writeCachedResourceState(cacheLayout, {
      packageId: "docs-sqlite",
      artifactName: "docs-sqlite-0.1.0.sqlite",
      artifactPath,
      sha256,
      updatedAt: "2026-04-29T00:00:00.000Z"
    });

    await expect(
      summarizeMdmResourceStatus({
        registry: registryWith([sqlitePackageEntry("docs-sqlite", true, sha256)]),
        cacheLayout
      })
    ).resolves.toMatchObject({
      packages: [
        {
          packageId: "docs-sqlite",
          status: "ready"
        }
      ],
      counts: {
        ready: 1,
        invalid_artifact: 0
      }
    });
  });

  it("preserves source index artifact routing metadata for ready sqlite bundles", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-source-index-status-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const artifactPath = join(
      cacheLayout.artifactsDir,
      "minecraft-1.20.1-source-index",
      "artifact.sqlite"
    );

    await mkdir(join(artifactPath, ".."), { recursive: true });
    createSqliteArtifact(artifactPath, 1, ["files", "source_chunks"]);
    const sha256 = await sha256File(artifactPath);
    await writeCachedResourceState(cacheLayout, {
      packageId: "minecraft-1.20.1-source-index",
      artifactName: "minecraft-1.20.1-source-index-0.1.0.sqlite",
      artifactPath,
      sha256,
      updatedAt: "2026-05-08T00:00:00.000Z"
    });

    await expect(
      summarizeMdmResourceStatus({
        registry: registryWith([
          sourceIndexPackageEntry("minecraft-1.20.1-source-index", sha256)
        ]),
        cacheLayout
      })
    ).resolves.toMatchObject({
      packages: [
        {
          packageId: "minecraft-1.20.1-source-index",
          status: "ready",
          artifactType: "source_index",
          artifactKind: "source_index",
          queryAdapter: "source_index_sqlite",
          artifactPath,
          capabilities: ["source_lookup", "source_chunk_search"]
        }
      ]
    });
  });

  it("reports invalid_artifact when a sqlite bundle is missing required tables", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-status-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const artifactPath = join(cacheLayout.artifactsDir, "docs-sqlite", "artifact.sqlite");

    await mkdir(join(cacheLayout.artifactsDir, "docs-sqlite"), {
      recursive: true
    });
    createSqliteArtifact(artifactPath, 3, ["other_table"]);
    const sha256 = await sha256File(artifactPath);
    await writeCachedResourceState(cacheLayout, {
      packageId: "docs-sqlite",
      artifactName: "docs-sqlite-0.1.0.sqlite",
      artifactPath,
      sha256,
      updatedAt: "2026-04-29T00:00:00.000Z"
    });

    await expect(
      summarizeMdmResourceStatus({
        registry: registryWith([sqlitePackageEntry("docs-sqlite", true, sha256)]),
        cacheLayout
      })
    ).resolves.toMatchObject({
      packages: [
        {
          packageId: "docs-sqlite",
          status: "invalid_artifact",
          message: expect.stringContaining("docs_entries")
        }
      ],
      counts: {
        ready: 0,
        invalid_artifact: 1
      }
    });
  });

  it("reports invalid_artifact when sqlite user_version is below metadata minimum", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-status-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const artifactPath = join(cacheLayout.artifactsDir, "docs-sqlite", "artifact.sqlite");

    await mkdir(join(cacheLayout.artifactsDir, "docs-sqlite"), {
      recursive: true
    });
    createSqliteArtifact(artifactPath, 2, ["docs_entries"]);
    const sha256 = await sha256File(artifactPath);
    await writeCachedResourceState(cacheLayout, {
      packageId: "docs-sqlite",
      artifactName: "docs-sqlite-0.1.0.sqlite",
      artifactPath,
      sha256,
      updatedAt: "2026-04-29T00:00:00.000Z"
    });

    await expect(
      summarizeMdmResourceStatus({
        registry: registryWith([sqlitePackageEntry("docs-sqlite", true, sha256)]),
        cacheLayout
      })
    ).resolves.toMatchObject({
      packages: [
        {
          packageId: "docs-sqlite",
          status: "invalid_artifact",
          message: expect.stringContaining("user_version")
        }
      ],
      counts: {
        ready: 0,
        invalid_artifact: 1
      }
    });
  });
});

function registryWith(
  packages: MdmResourceRegistry["packages"]
): MdmResourceRegistry {
  return {
    root: "/mdm-sources",
    schemaVersion: 1,
    packages
  };
}

function packageEntry(
  id: string,
  required: boolean,
  sha256 = "613fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477"
): MdmResourceRegistry["packages"][number] {
  return {
    id,
    manifestPath: `registry/packages/${id}.json`,
    required,
    format: "json",
    detail: {
      schemaVersion: 1,
      id,
      sourcePath: `packages/${id}/package.json`,
      metadata: {
        storageKind: "remote_manifest",
        installTier: required ? "required_docs" : "optional_dataset",
        commitPolicy: "repository_manifest"
      },
      currentRelease: {
        artifactName: `${id}-0.1.0.mdm-resource.json`,
        sha256,
        sizeBytes: 100
      }
    }
  };
}

function sqlitePackageEntry(
  id: string,
  required: boolean,
  sha256: string
): MdmResourceRegistry["packages"][number] {
  return {
    ...packageEntry(id, required, sha256),
    format: "sqlite",
    detail: {
      ...packageEntry(id, required, sha256).detail,
      metadata: {
        storageKind: "sqlite_bundle",
        installTier: required ? "required_docs" : "optional_dataset",
        commitPolicy: "repository_manifest",
        sqlite: {
          minUserVersion: 3,
          requiredTables: ["docs_entries"]
        }
      }
    }
  };
}

function sourceIndexPackageEntry(
  id: string,
  sha256: string
): MdmResourceRegistry["packages"][number] {
  const entry = sqlitePackageEntry(id, false, sha256);
  return {
    ...entry,
    artifactType: "source_index",
    artifactKind: "source_index",
    queryAdapter: "source_index_sqlite",
    detail: {
      ...entry.detail,
      artifactType: "source_index",
      artifactKind: "source_index",
      queryAdapter: "source_index_sqlite",
      capabilities: ["source_lookup", "source_chunk_search"],
      metadata: {
        storageKind: "sqlite_bundle",
        installTier: "optional_dataset",
        commitPolicy: "repository_manifest",
        sqlite: {
          minUserVersion: 1,
          requiredTables: ["files", "source_chunks"]
        }
      }
    }
  };
}

function createSqliteArtifact(
  artifactPath: string,
  userVersion: number,
  tables: string[]
): void {
  const sqlite = require("node:sqlite") as {
    DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void };
  };
  const database = new sqlite.DatabaseSync(artifactPath);

  try {
    database.exec(`PRAGMA user_version = ${userVersion};`);
    for (const table of tables) {
      database.exec(`CREATE TABLE ${table} (id TEXT PRIMARY KEY);`);
    }
  } finally {
    database.close();
  }
}

async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
