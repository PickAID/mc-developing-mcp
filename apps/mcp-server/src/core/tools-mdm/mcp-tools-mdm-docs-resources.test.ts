import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { registerMcpServerTools, type McpToolHandler } from "../tools/mcp-tools.js";

describe("mc_develop MDM docs resource summary", () => {
  it("reports docs resource load failures without failing docs lookup", async () => {
    const registry = createCapturingRegistry();
    const release = await createMdmReleaseOut("{ not json");
    const mdmSourcesRoot = await createMdmSourcesRoot({
      artifactName: release.artifactName,
      sha256: release.sha256,
      sizeBytes: release.sizeBytes
    });
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-runtime-"));
    const workspaceRoot = await createWorkspaceRoot();

    registerMcpServerTools(registry, {
      env: {
        MDM_SOURCES_ROOT: mdmSourcesRoot,
        PATH: ""
      }
    });

    const result = await registry.calls[0].handler({
      requestText: "In KubeJS 1.20.1, explain ProbeJS.",
      runtimeRoot,
      workspaceRoot,
      mdmReleaseInstall: {
        manifestPath: release.manifestPath,
        packageId: "core-docs-required",
        downloadPolicy: "allowed"
      }
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      mdmDocs: {
        status: "degraded",
        artifactCount: 1,
        recordCount: 0,
        failedArtifactCount: 1,
        errors: [
          expect.objectContaining({
            packageId: "core-docs-required",
            message: expect.any(String)
          })
        ]
      },
      selectedEvidence: {
        routeStep: "docs_lookup",
        payload: {
          hits: [
            expect.objectContaining({
              entryId: "crychicdoc-kubejs-1.20.1-probejs-workflow"
            })
          ]
        }
      }
    });
  });
});

function createCapturingRegistry(): CapturingRegistry {
  const calls: RegisteredToolCall[] = [];

  return {
    calls,
    registerTool(name, _config, handler) {
      calls.push({ name, handler });
    }
  };
}

async function createWorkspaceRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-workspace-"));

  await mkdir(join(root, "kubejs", "server_scripts"), { recursive: true });
  await writeFile(join(root, "kubejs", "server_scripts", "main.js"), "\n");

  return root;
}

async function createMdmSourcesRoot(release: MdmTestRelease): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-sources-"));

  await mkdir(join(root, "registry", "packages"), { recursive: true });
  await writeJson(join(root, "registry", "index.json"), {
    schemaVersion: 1,
    packages: [
      {
        id: "core-docs-required",
        manifestPath: "registry/packages/core-docs-required.json",
        required: true,
        format: "json"
      }
    ]
  });
  await writeJson(join(root, "registry", "packages", "core-docs-required.json"), {
    schemaVersion: 1,
    id: "core-docs-required",
    sourcePath: "packages/core/docs/required/package.json",
    currentRelease: {
      artifactName: release.artifactName,
      sha256: release.sha256,
      sizeBytes: release.sizeBytes
    }
  });

  return root;
}

async function createMdmReleaseOut(body: string): Promise<MdmTestReleaseOut> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-release-out-"));
  const artifactName = "core-docs-required-0.1.0.mdm-resource.json";
  const manifestPath = join(root, "mdm-release-manifest.json");
  const sha256 = hashText(body);

  await writeFile(join(root, artifactName), body);
  await writeJson(manifestPath, {
    schemaVersion: 1,
    generatedAt: "2026-04-29T00:00:00.000Z",
    packages: [
      {
        packageId: "core-docs-required",
        version: "0.1.0",
        namespace: "core",
        artifactType: "docs",
        variant: "required",
        required: true,
        format: "json",
        artifactName,
        sha256,
        sizeBytes: Buffer.byteLength(body),
        releaseChannel: "required",
        releaseFamily: "core-docs",
        capabilities: ["docs_search", "docs_direct_read"]
      }
    ]
  });

  return {
    manifestPath,
    artifactName,
    sha256,
    sizeBytes: Buffer.byteLength(body)
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function hashText(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

interface MdmTestRelease {
  artifactName: string;
  sha256: string;
  sizeBytes: number;
}

interface MdmTestReleaseOut extends MdmTestRelease {
  manifestPath: string;
}

interface CapturingRegistry {
  calls: RegisteredToolCall[];
  registerTool(name: string, config: unknown, handler: McpToolHandler): unknown;
}

interface RegisteredToolCall {
  name: string;
  handler: McpToolHandler;
}
