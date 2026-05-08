import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { resolveMdmResourceCacheLayout } from "./cache.js";
import { ensureMdmReleasePackageCached } from "./installer.js";
import {
  readMdmReleaseManifestFile,
  toMdmResourceRegistryFromReleaseManifest
} from "./release-manifest.js";
import { summarizeMdmResourceStatus } from "./status.js";
import { toPackageManifestsV2 } from "./v2-adapter.js";

const execFileAsync = promisify(execFile);

describe("mdm-sources local release smoke", () => {
  it("builds, reads, adapts, caches, and opens v2 public packages", async () => {
    const mdmSourcesRoot = await findMdmSourcesRoot();
    if (!mdmSourcesRoot) {
      return;
    }

    const tempRoot = await mkdtemp(join(tmpdir(), "mdm-sources-smoke-"));
    const copiedRoot = join(tempRoot, "repo");
    const outDir = join(tempRoot, "release-out");
    const runtimeRoot = join(tempRoot, "runtime");

    await cp(mdmSourcesRoot, copiedRoot, {
      recursive: true,
      filter: (source) => !source.includes(`${mdmSourcesRoot}/.git`)
    });
    await execFileAsync("node", [
      "tools/build-local-release.mjs",
      "--out",
      outDir,
      "--channel",
      "required",
      "--channel",
      "datapack",
      "--channel",
      "resourcepack",
      "--channel",
      "mappings",
      "--channel",
      "sources",
      "--bundle-channel",
      "datapack",
      "--bundle-channel",
      "resourcepack",
      "--bundle-channel",
      "mappings",
      "--bundle-channel",
      "sources"
    ], { cwd: copiedRoot });

    const manifest = await readMdmReleaseManifestFile(
      join(outDir, "mdm-release-manifest.json")
    );
    const registry = toMdmResourceRegistryFromReleaseManifest(manifest);
    const packages = toPackageManifestsV2(registry.packages);

    expect(manifest.packages.length).toBeGreaterThanOrEqual(10);
    expect(countByReleaseChannel(manifest.packages)).toMatchObject({
      datapack: expect.any(Number),
      mappings: expect.any(Number),
      required: expect.any(Number),
      resourcepack: expect.any(Number),
      sources: expect.any(Number)
    });
    expect(manifest.bundles?.map((bundle) => bundle.bundleName).sort()).toEqual([
      "datapack.mdm-bundle",
      "mappings.mdm-bundle",
      "resourcepack.mdm-bundle",
      "sources.mdm-bundle"
    ]);
    expect(packages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identity: expect.objectContaining({
            packageId: "minecraft-release-catalog",
            packageVersion: "0.1.0"
          }),
          artifact: expect.objectContaining({ kind: "docs_bundle" }),
          query: expect.objectContaining({ adapter: "json_docs" }),
          release: expect.objectContaining({ channel: "required" })
        }),
        expect.objectContaining({
          identity: expect.objectContaining({
            packageId: "minecraft-1.18.2-vanilla-datapack-profile",
            packageVersion: "0.1.0"
          }),
          artifact: expect.objectContaining({ kind: "datapack_bundle" }),
          query: expect.objectContaining({ adapter: "archive_content" }),
          release: expect.objectContaining({ channel: "datapack" })
        }),
        expect.objectContaining({
          identity: expect.objectContaining({
            packageId: "minecraft-1.20.1-vanilla-datapack-profile",
            packageVersion: "0.1.0"
          }),
          artifact: expect.objectContaining({ kind: "datapack_bundle" }),
          query: expect.objectContaining({ adapter: "archive_content" }),
          release: expect.objectContaining({ channel: "datapack" })
        }),
        expect.objectContaining({
          identity: expect.objectContaining({
            packageId: "minecraft-1.21.1-vanilla-datapack-profile",
            packageVersion: "0.1.0"
          }),
          artifact: expect.objectContaining({ kind: "datapack_bundle" }),
          query: expect.objectContaining({ adapter: "archive_content" }),
          release: expect.objectContaining({ channel: "datapack" })
        }),
        expect.objectContaining({
          identity: expect.objectContaining({
            packageId: "minecraft-1.20.1-vanilla-resourcepack-profile",
            packageVersion: "0.1.0"
          }),
          artifact: expect.objectContaining({ kind: "resourcepack_bundle" }),
          query: expect.objectContaining({ adapter: "archive_content" }),
          release: expect.objectContaining({
            channel: "resourcepack",
            family: "vanilla-resourcepack"
          })
        }),
        expect.objectContaining({
          identity: expect.objectContaining({
            packageId: "minecraft-1.20.1-yarn-mapping-profile",
            packageVersion: "0.1.0"
          }),
          artifact: expect.objectContaining({ kind: "mapping_bundle" }),
          query: expect.objectContaining({ adapter: "mapping_index" }),
          release: expect.objectContaining({
            channel: "mappings",
            family: "vanilla-mappings"
          })
        }),
        expect.objectContaining({
          identity: expect.objectContaining({
            packageId: "minecraft-1.20.1-vanilla-source-profile",
            packageVersion: "0.1.0"
          }),
          artifact: expect.objectContaining({ kind: "docs_bundle" }),
          capabilities: ["source_lookup", "source_chunk_search"],
          query: expect.objectContaining({ adapter: "json_docs" }),
          release: expect.objectContaining({
            channel: "sources",
            family: "vanilla-sources"
          })
        })
      ])
    );

    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const cached = await ensureMdmReleasePackageCached({
      manifest,
      packageId: "minecraft-1.20.1-vanilla-datapack-profile",
      cacheLayout,
      downloadPolicy: "allowed",
      fetcher: async (artifactPath) => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => readFile(artifactPath)
      })
    });

    expect(cached.status).toBe("downloaded");
    const catalogCached = await ensureMdmReleasePackageCached({
      manifest,
      packageId: "minecraft-release-catalog",
      cacheLayout,
      downloadPolicy: "allowed",
      fetcher: async (artifactPath) => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => readFile(artifactPath)
      })
    });

    expect(catalogCached.status).toBe("downloaded");
    const resourcepackCached = await ensureMdmReleasePackageCached({
      manifest,
      packageId: "minecraft-1.20.1-vanilla-resourcepack-profile",
      cacheLayout,
      downloadPolicy: "allowed",
      fetcher: async (artifactPath) => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => readFile(artifactPath)
      })
    });
    const mappingCached = await ensureMdmReleasePackageCached({
      manifest,
      packageId: "minecraft-1.20.1-yarn-mapping-profile",
      cacheLayout,
      downloadPolicy: "allowed",
      fetcher: async (artifactPath) => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => readFile(artifactPath)
      })
    });
    const sourceProfileCached = await ensureMdmReleasePackageCached({
      manifest,
      packageId: "minecraft-1.20.1-vanilla-source-profile",
      cacheLayout,
      downloadPolicy: "allowed",
      fetcher: async (artifactPath) => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => readFile(artifactPath)
      })
    });

    expect(resourcepackCached.status).toBe("downloaded");
    expect(mappingCached.status).toBe("downloaded");
    expect(sourceProfileCached.status).toBe("downloaded");
    const status = await summarizeMdmResourceStatus({ registry, cacheLayout });
    expect(status.counts.ready).toBe(5);

    const artifact = JSON.parse(
      await readFile(cached.state?.artifactPath ?? "", "utf-8")
    );
    expect(artifact.payload["payload/datapack-profile.json"]).toMatchObject({
      repoPath: expect.stringContaining("payload/datapack-profile.json")
    });

    const catalogArtifact = JSON.parse(
      await readFile(catalogCached.state?.artifactPath ?? "", "utf-8")
    );
    const catalog = JSON.parse(
      catalogArtifact.payload["payload/release-catalog.json"].content
    );
    expect(catalog.releaseCount).toBeGreaterThanOrEqual(101);
    expect(catalog.latest.release).toBe(catalog.releases[0].id);
    expect(catalog.releases.at(-1).id).toBe("1.0");

    const resourcepackArtifact = JSON.parse(
      await readFile(resourcepackCached.state?.artifactPath ?? "", "utf-8")
    );
    expect(resourcepackArtifact.payload["payload/resourcepack-profile.json"]).toMatchObject({
      repoPath: expect.stringContaining("payload/resourcepack-profile.json")
    });

    const mappingArtifact = JSON.parse(
      await readFile(mappingCached.state?.artifactPath ?? "", "utf-8")
    );
    expect(mappingArtifact.payload["payload/mapping-profile.json"]).toMatchObject({
      repoPath: expect.stringContaining("payload/mapping-profile.json")
    });

    const sourceProfileArtifact = JSON.parse(
      await readFile(sourceProfileCached.state?.artifactPath ?? "", "utf-8")
    );
    expect(sourceProfileArtifact.payload["payload/source-profile.json"]).toMatchObject({
      repoPath: expect.stringContaining("payload/source-profile.json")
    });
  }, 30_000);
});

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  );
}

function countByReleaseChannel(
  packages: Array<{ releaseChannel?: string }>
): Record<string, number> {
  return packages.reduce<Record<string, number>>((counts, entry) => {
    const channel = entry.releaseChannel ?? "unknown";
    counts[channel] = (counts[channel] ?? 0) + 1;
    return counts;
  }, {});
}

async function findMdmSourcesRoot(): Promise<string | undefined> {
  const candidates = [
    resolve(process.cwd(), "..", "mdm-sources"),
    resolve(process.cwd(), "..", "..", "..", "mdm-sources"),
    resolve("/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources")
  ];

  for (const candidate of candidates) {
    if (await pathExists(join(candidate, "tools", "build-local-release.mjs"))) {
      return candidate;
    }
  }

  return undefined;
}
