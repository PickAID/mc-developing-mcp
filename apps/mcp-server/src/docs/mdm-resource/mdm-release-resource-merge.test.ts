import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  resolveMdmResourceCacheLayout,
  writeCachedResourceState
} from "minecraft-developing-mcp-resource-registry";

import { mergeInstalledReleaseResources } from "./mdm-release-resource-merge.js";

describe("mergeInstalledReleaseResources", () => {
  it("makes a just-installed release package visible to the current MCP call", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-release-merge-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const packageId = "vanilla-schema-docs";
    const artifactName = "vanilla-schema-docs-0.1.0.sqlite";
    const artifactPath = join(cacheLayout.artifactsDir, packageId, artifactName);
    const body = "sqlite bytes";
    const sha256 = createHash("sha256").update(body).digest("hex");

    await mkdir(join(cacheLayout.artifactsDir, packageId), { recursive: true });
    await writeFile(artifactPath, body);
    await writeCachedResourceState(cacheLayout, {
      packageId,
      artifactName,
      artifactPath,
      sha256,
      updatedAt: "2026-05-11T00:00:00.000Z"
    });

    const merged = await mergeInstalledReleaseResources({
      runtimeRoot,
      mdmResources: {
        status: "available",
        cacheRoot: cacheLayout.root,
        summary: {
          packages: [],
          counts: {
            missing_required: 0,
            missing_optional: 0,
            ready: 0,
            invalid_checksum: 0,
            invalid_artifact: 0
          }
        },
        message: "Local registry has no current release for this package."
      },
      mdmReleaseInstall: {
        status: "downloaded",
        packageId,
        artifactUrl: "https://example.test/docs.mdm-bundle.json",
        state: {
          packageId,
          artifactName,
          artifactPath,
          sha256,
          updatedAt: "2026-05-11T00:00:00.000Z"
        },
        manifestSource: "https://example.test/mdm-release-manifest.json",
        manifest: {
          source: "https://example.test/mdm-release-manifest.json",
          schemaVersion: 1,
          generatedAt: "2026-05-11T00:00:00.000Z",
          packages: [
            {
              packageId,
              version: "0.1.0",
              namespace: "minecraft",
              artifactType: "docs",
              artifactKind: "docs_bundle",
              queryAdapter: "sqlite_docs",
              variant: "docs",
              required: false,
              format: "sqlite",
              artifactName,
              sha256,
              sizeBytes: body.length,
              metadata: {
                storageKind: "remote_manifest",
                installTier: "optional_dataset",
                commitPolicy: "repository_manifest"
              },
              releaseChannel: "docs",
              releaseFamily: packageId,
              capabilities: ["docs_search"]
            }
          ]
        },
        downloadPolicy: "allowed",
        message: "Downloaded."
      }
    });

    expect(merged.summary).toMatchObject({
      counts: {
        ready: 1,
        missing_required: 0,
        missing_optional: 0,
        invalid_checksum: 0,
        invalid_artifact: 0
      },
      packages: [
        expect.objectContaining({
          packageId,
          status: "ready",
          artifactPath,
          queryAdapter: "sqlite_docs"
        })
      ]
    });
  });
});
