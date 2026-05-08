import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveMdmResourceCacheLayout } from "./cache.js";
import { ensureMdmReleasePackageCached } from "./installer.js";
import {
  readMdmReleaseManifestFile,
  toMdmResourceRegistryFromReleaseManifest
} from "./release-manifest.js";
import { summarizeMdmResourceStatus } from "./status.js";
import { toPackageManifestsV2 } from "./v2-adapter.js";

const require = createRequire(import.meta.url);
const packageId = "minecraft-1.20.1-source-index";

describe("mdm-sources source_index_sqlite release smoke", () => {
  it("builds and validates a source index sqlite release package", async () => {
    const mdmSourcesRoot = resolve(
      "/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources"
    );
    const builderPath = join(mdmSourcesRoot, "tools/build-local-release.mjs");
    if (!(await pathExists(builderPath))) {
      return;
    }

    const tempRoot = await mkdtemp(join(tmpdir(), "mdm-source-index-smoke-"));
    const repoRoot = join(tempRoot, "repo");
    const outDir = join(tempRoot, "release-out");
    const runtimeRoot = join(tempRoot, "runtime");

    await writeSourceIndexFixtureRepository(repoRoot);
    const { buildLocalRelease } = await import(pathToFileURL(builderPath).href) as {
      buildLocalRelease(input: {
        root: string;
        outDir: string;
        builtAt: string;
      }): Promise<{ manifestPath: string }>;
    };
    await buildLocalRelease({
      root: repoRoot,
      outDir,
      builtAt: "2026-05-07T00:00:00.000Z"
    });

    const manifest = await readMdmReleaseManifestFile(
      join(outDir, "mdm-release-manifest.json")
    );
    const releasePackage = manifest.packages[0];
    expect(releasePackage).toMatchObject({
      packageId,
      artifactType: "source_index",
      artifactKind: "source_index",
      queryAdapter: "source_index_sqlite",
      format: "sqlite"
    });

    const registry = toMdmResourceRegistryFromReleaseManifest(manifest);
    expect(registry.packages[0]).toMatchObject({
      id: packageId,
      artifactType: "source_index",
      artifactKind: "source_index",
      queryAdapter: "source_index_sqlite"
    });

    const [v2Package] = toPackageManifestsV2(registry.packages);
    expect(v2Package).toMatchObject({
      identity: { packageId },
      artifact: {
        kind: "source_index",
        format: "sqlite",
        schemaId: "mdm.source.index.sqlite"
      },
      query: { adapter: "source_index_sqlite" }
    });

    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const cached = await ensureMdmReleasePackageCached({
      manifest,
      packageId,
      cacheLayout,
      downloadPolicy: "allowed",
      fetcher: async (artifactPath) => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => readFile(artifactPath)
      })
    });

    expect(cached.status).toBe("downloaded");
    expect((await stat(cached.state?.artifactPath ?? "")).size).toBeGreaterThan(0);
    const counts = readSourceIndexCounts(cached.state?.artifactPath ?? "");
    expect(counts).toMatchObject({
      files: 1,
      javaSymbols: 2,
      javaMembers: 2,
      sourceChunks: expect.any(Number),
      ftsChunks: expect.any(Number)
    });
    expect(counts.sourceChunks).toBeGreaterThan(0);
    expect(counts.ftsChunks).toBeGreaterThan(0);

    const status = await summarizeMdmResourceStatus({ registry, cacheLayout });
    expect(status.counts.ready).toBe(1);
    expect(status.packages[0]).toMatchObject({
      packageId,
      status: "ready",
      artifactType: "source_index",
      artifactKind: "source_index",
      queryAdapter: "source_index_sqlite"
    });
  });
});

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  );
}

async function writeSourceIndexFixtureRepository(root: string): Promise<void> {
  await mkdir(join(root, "packages/source-index/vanilla/1.20.1/payload"), {
    recursive: true
  });
  await mkdir(join(root, "registry/packages"), { recursive: true });
  await writeFile(
    join(root, "packages/source-index/vanilla/1.20.1/package.json"),
    JSON.stringify(sourceIndexPackageManifest(), null, 2)
  );
  await writeFile(
    join(root, "packages/source-index/vanilla/1.20.1/payload/source-index.json"),
    JSON.stringify(sourceIndexPayload(), null, 2)
  );
  await writeFile(
    join(root, "registry/index.json"),
    JSON.stringify({
      schemaVersion: 1,
      packages: [
        {
          id: packageId,
          manifestPath: "registry/packages/minecraft-1.20.1-source-index.json",
          currentRelease: null
        }
      ]
    })
  );
  await writeFile(
    join(root, "registry/packages/minecraft-1.20.1-source-index.json"),
    JSON.stringify({
      id: packageId,
      sourcePath: "packages/source-index/vanilla/1.20.1/package.json",
      currentRelease: null
    })
  );
}

function sourceIndexPackageManifest() {
  return {
    identity: {
      schemaVersion: 2,
      packageId,
      packageVersion: "0.1.0",
      namespace: "minecraft",
      displayName: "Minecraft 1.20.1 Source Index",
      description: "Tiny source index fixture without source bytes."
    },
    target: {
      minecraftVersions: ["1.20.1"],
      loaders: ["vanilla"],
      mappings: ["mojmap"]
    },
    artifact: {
      kind: "source_index",
      format: "sqlite",
      schemaId: "mdm.source.index.sqlite",
      schemaVersion: 1,
      entrypoint: "payload/source-index.json"
    },
    capabilities: ["source_lookup", "source_chunk_search"],
    policy: {
      privacy: "public_release",
      lifecycle: ["downloadable"],
      canCommitToRepository: true,
      canUploadToPublicRelease: true,
      requiresUserConsent: false
    },
    query: {
      adapter: "source_index_sqlite",
      capabilities: ["source_lookup", "source_chunk_search"],
      defaultLimit: 8,
      maxLimit: 50,
      preferredFallbacks: []
    },
    release: { channel: "sources", family: "vanilla-source-index" }
  };
}

function sourceIndexPayload() {
  return {
    files: [
      {
        id: "itemstack",
        minecraftVersion: "1.20.1",
        loader: "vanilla",
        mappings: "mojmap",
        className: "net.minecraft.world.item.ItemStack",
        packageName: "net.minecraft.world.item",
        sourcePath: "net/minecraft/world/item/ItemStack.java",
        sha256: "0".repeat(64),
        summary: "ItemStack source metadata only; no source bytes.",
        javaMembers: [
          {
            memberName: "copy",
            memberKind: "method",
            signature: "copy()",
            returnType: "ItemStack",
            startLine: 10,
            endLine: 12
          }
        ]
      }
    ],
    javaSymbols: [
      {
        path: "net/minecraft/world/item/ItemStack.java",
        qualifiedName: "net.minecraft.world.item.ItemStackComponent"
      }
    ],
    javaMembers: [
      {
        path: "net/minecraft/world/item/ItemStack.java",
        ownerSimpleName: "ItemStack",
        ownerQualifiedName: "net.minecraft.world.item.ItemStack",
        memberName: "isEmpty",
        memberKind: "method",
        signature: "isEmpty()",
        returnType: "boolean",
        startLine: 20,
        endLine: 22
      }
    ],
    sourceChunks: [
      {
        path: "net/minecraft/world/item/ItemStack.java",
        chunkId: "durability-rules",
        chunkType: "code_window",
        startLine: 30,
        endLine: 34,
        content: "Durability and component merge rules for ItemStack metadata."
      }
    ]
  };
}

function readSourceIndexCounts(databasePath: string): Record<string, number> {
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: new (path: string) => {
      prepare(sql: string): {
        get(): { count: number };
      };
      close(): void;
    };
  };
  const database = new DatabaseSync(databasePath);
  try {
    return {
      files: countRows(database, "files"),
      javaSymbols: countRows(database, "java_symbols"),
      javaMembers: countRows(database, "java_members"),
      sourceChunks: countRows(database, "source_chunks"),
      ftsChunks: countRows(database, "fts_chunks")
    };
  } finally {
    database.close();
  }
}

function countRows(
  database: { prepare(sql: string): { get(): { count: number } } },
  table: string
): number {
  return database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}
