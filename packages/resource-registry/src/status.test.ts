import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  resolveMdmResourceCacheLayout,
  writeCachedResourceState
} from "./cache.js";
import type { MdmResourceRegistry } from "./manifest.js";
import { summarizeMdmResourceStatus } from "./status.js";

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
        { packageId: "core-docs-required", status: "missing_required" },
        { packageId: "content-docs-optional", status: "missing_optional" }
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
      packages: [{ packageId: "core-docs-required", status: "ready" }],
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
      packages: [{ packageId: "core-docs-required", status: "invalid_checksum" }],
      counts: {
        missing_required: 0,
        missing_optional: 0,
        ready: 0,
        invalid_checksum: 1
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
      currentRelease: {
        artifactName: `${id}-0.1.0.mdm-resource.json`,
        sha256,
        sizeBytes: 100
      }
    }
  };
}
