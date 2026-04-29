import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  resolveMdmResourceCacheLayout,
  writeCachedResourceState
} from "@mcpskill/resource-registry";

import { loadMdmDocsResourcesFromStatus } from "./mdm-docs-records.js";
import type { MdmResourceStatusContext } from "./mdm-resource-status.js";

describe("loadMdmDocsResourcesFromStatus", () => {
  it("returns records and bounded failures for ready MDM docs artifacts", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-docs-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const validBody = docsArtifactBody("offline-resource-status");
    const invalidBody = "{ not json";
    const validPath = await writeArtifact(
      cacheLayout.artifactsDir,
      "core-docs-required",
      "valid.mdm-resource.json",
      validBody
    );
    const invalidPath = await writeArtifact(
      cacheLayout.artifactsDir,
      "broken-docs",
      "broken.mdm-resource.json",
      invalidBody
    );

    await writeCachedResourceState(cacheLayout, state("core-docs-required", validPath, validBody));
    await writeCachedResourceState(cacheLayout, state("broken-docs", invalidPath, invalidBody));

    const result = await loadMdmDocsResourcesFromStatus({
      status: "available",
      cacheRoot: cacheLayout.root,
      summary: {
        packages: [
          {
            packageId: "core-docs-required",
            required: true,
            status: "ready",
            artifactPath: validPath,
            message: "ready"
          },
          {
            packageId: "broken-docs",
            required: false,
            status: "ready",
            artifactPath: invalidPath,
            message: "ready"
          }
        ],
        counts: {
          missing_required: 0,
          missing_optional: 0,
          ready: 2,
          invalid_checksum: 0
        }
      },
      message: "loaded"
    } satisfies MdmResourceStatusContext);

    expect(result.records).toEqual([
      expect.objectContaining({
        entryId: "offline-resource-status",
        packageId: "core-docs-required"
      })
    ]);
    expect(result.summary).toMatchObject({
      status: "degraded",
      artifactCount: 2,
      recordCount: 1,
      failedArtifactCount: 1,
      errors: [
        expect.objectContaining({
          artifactPath: invalidPath,
          message: expect.stringContaining("Expected property name")
        })
      ]
    });
  });
});

async function writeArtifact(
  artifactsDir: string,
  packageId: string,
  artifactName: string,
  body: string
): Promise<string> {
  const artifactPath = join(artifactsDir, packageId, artifactName);

  await mkdir(join(artifactsDir, packageId), { recursive: true });
  await writeFile(artifactPath, body);

  return artifactPath;
}

function state(packageId: string, artifactPath: string, body: string) {
  return {
    packageId,
    artifactName: artifactPath.split("/").at(-1) ?? "artifact.mdm-resource.json",
    artifactPath,
    sha256: createHash("sha256").update(body).digest("hex"),
    updatedAt: "2026-04-29T00:00:00.000Z"
  };
}

function docsArtifactBody(entryId: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    package: {
      id: "core-docs-required",
      artifactType: "docs"
    },
    payload: {
      "core-docs.json": {
        repoPath: "packages/core/docs/required/payload/core-docs.json",
        content: JSON.stringify({
          schemaVersion: 1,
          entries: [
            {
              id: entryId,
              title: "Offline Resource Status",
              summary:
                "Missing optional packages are degraded capability, not fatal failure."
            }
          ]
        })
      }
    }
  });
}
