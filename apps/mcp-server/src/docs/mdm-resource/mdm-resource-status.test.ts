import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  resolveMdmResourceCacheLayout,
  writeCachedResourceState
} from "minecraft-developing-mcp-resource-registry";

import {
  buildMdmResourceStatusContext,
  formatMdmResourceStatusPrompt
} from "./mdm-resource-status.js";

describe("mdm resource status context", () => {
  it("reports unconfigured status when MDM_SOURCES_ROOT is absent", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-runtime-"));

    await expect(
      buildMdmResourceStatusContext({ runtimeRoot })
    ).resolves.toMatchObject({
      status: "unconfigured",
      cacheRoot: join(runtimeRoot, "mdm-resources")
    });
  });

  it("summarizes ready and missing required packages from a local registry", async () => {
    const mdmSourcesRoot = await createMdmSourcesRoot();
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-runtime-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const artifactPath = join(
      cacheLayout.artifactsDir,
      "core-docs-required",
      "artifact.json"
    );
    const body = JSON.stringify({ docs: true });
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

    const context = await buildMdmResourceStatusContext({
      mdmSourcesRoot,
      runtimeRoot
    });

    expect(context).toMatchObject({
      status: "available",
      registryRoot: mdmSourcesRoot,
      summary: {
        counts: {
          ready: 1,
          missing_required: 1,
          missing_optional: 0,
          invalid_checksum: 0
        }
      }
    });
    expect(formatMdmResourceStatusPrompt(context)).toContain(
      "MDM resource status: ready=1; missing_required=1"
    );
  });

  it("summarizes a local mdm-sources release acceptance report when present", async () => {
    const mdmSourcesRoot = await createMdmSourcesRoot();
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-runtime-"));
    await mkdir(join(mdmSourcesRoot, "release-out"), { recursive: true });
    await writeJson(
      join(mdmSourcesRoot, "release-out", "mdm-release-acceptance-report.json"),
      {
        schemaVersion: 1,
        generatedAt: "2026-05-08T00:00:00.000Z",
        status: "passed",
        release: {
          packageCount: 465,
          artifactCount: 467,
          totalSizeBytes: 2732077
        },
        checks: {
          repository: { errorCount: 0 },
          schema: { errorCount: 0 },
          install: { packageCount: 465, verifiedCount: 465 }
        }
      }
    );

    const context = await buildMdmResourceStatusContext({
      mdmSourcesRoot,
      runtimeRoot
    });

    expect(context.releaseAcceptance).toEqual({
      status: "passed",
      generatedAt: "2026-05-08T00:00:00.000Z",
      packageCount: 465,
      artifactCount: 467,
      totalSizeBytes: 2732077,
      repositoryErrorCount: 0,
      schemaErrorCount: 0,
      installVerifiedCount: 465,
      installPackageCount: 465
    });
    expect(formatMdmResourceStatusPrompt(context)).toContain(
      "MDM release acceptance: status=passed; packages=465; artifacts=467; install=465/465"
    );
  });
});

async function createMdmSourcesRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-sources-"));
  const readySha = createHash("sha256")
    .update(JSON.stringify({ docs: true }))
    .digest("hex");

  await mkdir(join(root, "registry", "packages"), { recursive: true });
  await writeJson(join(root, "registry", "index.json"), {
    schemaVersion: 1,
    packages: [
      registryEntry("core-docs-required", true, readySha),
      registryEntry("migration-docs-required", true)
    ]
  });
  await writeJson(
    join(root, "registry", "packages", "core-docs-required.json"),
    registryDetail("core-docs-required", readySha)
  );
  await writeJson(
    join(root, "registry", "packages", "migration-docs-required.json"),
    registryDetail("migration-docs-required")
  );

  return root;
}

function registryEntry(id: string, required: boolean, sha256 = "abc123") {
  return {
    id,
    manifestPath: `registry/packages/${id}.json`,
    required,
    format: "json",
    currentRelease: release(id, sha256)
  };
}

function registryDetail(id: string, sha256 = "abc123") {
  return {
    schemaVersion: 1,
    id,
    sourcePath: `packages/${id}/package.json`,
    currentRelease: release(id, sha256)
  };
}

function release(id: string, sha256: string) {
  return {
    artifactName: `${id}-0.1.0.mdm-resource.json`,
    sha256,
    sizeBytes: 100
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
