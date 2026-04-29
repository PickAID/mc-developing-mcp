import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";

import { describe, expect, it } from "vitest";

import {
  readCachedResourceState,
  resolveMdmResourceCacheLayout,
  writeCachedResourceState
} from "./cache.js";

describe("resource cache state", () => {
  it("resolves mdm resource cache paths under the runtime root", () => {
    const runtimeRoot = join("tmp", "mcpskill-runtime");

    expect(resolveMdmResourceCacheLayout(runtimeRoot)).toEqual({
      root: join(normalize(runtimeRoot), "mdm-resources"),
      artifactsDir: join(normalize(runtimeRoot), "mdm-resources", "artifacts"),
      statesDir: join(normalize(runtimeRoot), "mdm-resources", "states")
    });
  });

  it("writes and reads package cache state", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-cache-"));
    const layout = resolveMdmResourceCacheLayout(runtimeRoot);
    const state = {
      packageId: "core-docs-required",
      artifactName: "core-docs-required-0.1.0.mdm-resource.json",
      artifactPath: join(layout.artifactsDir, "core-docs-required", "artifact.json"),
      sha256: "613fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477",
      updatedAt: "2026-04-29T00:00:00.000Z"
    };

    await mkdir(join(layout.artifactsDir, "core-docs-required"), {
      recursive: true
    });
    await writeCachedResourceState(layout, state);

    await expect(
      readFile(join(layout.statesDir, "core-docs-required.cache-state.json"), "utf-8")
    ).resolves.toContain('"packageId": "core-docs-required"');
    await expect(
      readCachedResourceState(layout, "core-docs-required")
    ).resolves.toEqual(state);
  });

  it("returns undefined when no package cache state exists", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-cache-"));
    const layout = resolveMdmResourceCacheLayout(runtimeRoot);

    await expect(readCachedResourceState(layout, "missing")).resolves.toBeUndefined();
  });
});
