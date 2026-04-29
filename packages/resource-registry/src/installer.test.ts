import { createHash } from "node:crypto";
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

function okResponse(body: string): Awaited<ReturnType<MdmArtifactFetch>> {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => Buffer.from(body)
  };
}

function sha256(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}
