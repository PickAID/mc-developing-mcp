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
      "datapack"
    ], { cwd: copiedRoot });

    const manifest = await readMdmReleaseManifestFile(
      join(outDir, "mdm-release-manifest.json")
    );
    const registry = toMdmResourceRegistryFromReleaseManifest(manifest);
    const packages = toPackageManifestsV2(registry.packages);

    expect(manifest.packages).toHaveLength(5);
    expect(manifest.packages.map((entry) => entry.releaseChannel).sort()).toEqual([
      "datapack",
      "datapack",
      "datapack",
      "required",
      "required"
    ]);
    expect(packages).toEqual(
      expect.arrayContaining([
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
    const status = await summarizeMdmResourceStatus({ registry, cacheLayout });
    expect(status.counts.ready).toBe(1);

    const artifact = JSON.parse(
      await readFile(cached.state?.artifactPath ?? "", "utf-8")
    );
    expect(artifact.payload["payload/datapack-profile.json"]).toMatchObject({
      repoPath: expect.stringContaining("payload/datapack-profile.json")
    });
  });
});

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  );
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
