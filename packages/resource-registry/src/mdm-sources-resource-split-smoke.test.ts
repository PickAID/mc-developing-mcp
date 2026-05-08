import { cp, mkdir, mkdtemp, readFile, stat } from "node:fs/promises";
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

const datapackPackageId = "minecraft-1.20.1-vanilla-datapack-profile";
const resourcepackPackageId = "minecraft-1.20.1-vanilla-resourcepack-profile";

describe("mdm-sources datapack/resourcepack release split smoke", () => {
  it("keeps datapack and resourcepack channels separate through build, v2, install, and status", async () => {
    const mdmSourcesRoot = resolve(
      "/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources"
    );
    const builderPath = join(mdmSourcesRoot, "tools/build-local-release.mjs");
    if (!(await pathExists(builderPath))) {
      return;
    }

    const tempRoot = await mkdtemp(join(tmpdir(), "mdm-resource-split-smoke-"));
    const repoRoot = join(tempRoot, "repo");
    const outDir = join(tempRoot, "release-out");
    const runtimeRoot = join(tempRoot, "runtime");

    await writeFocusedResourceRepository(mdmSourcesRoot, repoRoot);
    const { buildLocalRelease } = await import(pathToFileURL(builderPath).href) as {
      buildLocalRelease(input: {
        root: string;
        outDir: string;
        builtAt: string;
        releaseChannels: string[];
        writeRegistry: false;
      }): Promise<{ manifestPath: string }>;
    };
    await buildLocalRelease({
      root: repoRoot,
      outDir,
      builtAt: "2026-05-08T00:00:00.000Z",
      releaseChannels: ["datapack", "resourcepack"],
      writeRegistry: false
    });

    const manifest = await readMdmReleaseManifestFile(
      join(outDir, "mdm-release-manifest.json")
    );
    expect(manifest.packages.map((entry) => entry.packageId).sort()).toEqual([
      datapackPackageId,
      resourcepackPackageId
    ]);

    const registry = toMdmResourceRegistryFromReleaseManifest(manifest);
    const packages = toPackageManifestsV2(registry.packages);
    const datapack = packages.find(
      (entry) => entry.identity.packageId === datapackPackageId
    );
    const resourcepack = packages.find(
      (entry) => entry.identity.packageId === resourcepackPackageId
    );

    expect(datapack).toMatchObject({
      artifact: {
        kind: "datapack_bundle",
        schemaId: "mdm.datapack.json"
      },
      capabilities: ["resource_location_lookup", "datapack_trace"],
      query: {
        adapter: "archive_content",
        capabilities: ["resource_location_lookup", "datapack_trace"]
      },
      release: {
        channel: "datapack",
        family: "vanilla-datapack"
      }
    });
    expect(resourcepack).toMatchObject({
      artifact: {
        kind: "resourcepack_bundle",
        schemaId: "mdm.resourcepack.json"
      },
      capabilities: ["resource_location_lookup", "resourcepack_trace"],
      query: {
        adapter: "archive_content",
        capabilities: ["resource_location_lookup", "resourcepack_trace"]
      },
      release: {
        channel: "resourcepack",
        family: "vanilla-resourcepack"
      }
    });
    expect(datapack?.release?.family).not.toBe(resourcepack?.release?.family);
    expect(datapack?.artifact.kind).not.toBe(resourcepack?.artifact.kind);
    expect(datapack?.query.capabilities).not.toContain("resourcepack_trace");
    expect(resourcepack?.query.capabilities).not.toContain("datapack_trace");

    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    for (const packageId of [datapackPackageId, resourcepackPackageId]) {
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
    }

    const status = await summarizeMdmResourceStatus({ registry, cacheLayout });
    expect(status.counts.ready).toBe(2);
    expect(status.packages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageId: datapackPackageId,
          status: "ready",
          artifactKind: "datapack_bundle",
          releaseChannel: "datapack",
          releaseFamily: "vanilla-datapack",
          capabilities: ["resource_location_lookup", "datapack_trace"]
        }),
        expect.objectContaining({
          packageId: resourcepackPackageId,
          status: "ready",
          artifactKind: "resourcepack_bundle",
          releaseChannel: "resourcepack",
          releaseFamily: "vanilla-resourcepack",
          capabilities: ["resource_location_lookup", "resourcepack_trace"]
        })
      ])
    );
  });
});

async function writeFocusedResourceRepository(
  mdmSourcesRoot: string,
  repoRoot: string
): Promise<void> {
  await mkdir(repoRoot, { recursive: true });
  await cp(
    join(mdmSourcesRoot, "packages/datapack/vanilla/1.20.1"),
    join(repoRoot, "packages/datapack/vanilla/1.20.1"),
    { recursive: true }
  );
  await cp(
    join(mdmSourcesRoot, "packages/resourcepack/vanilla/1.20.1"),
    join(repoRoot, "packages/resourcepack/vanilla/1.20.1"),
    { recursive: true }
  );
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  );
}
