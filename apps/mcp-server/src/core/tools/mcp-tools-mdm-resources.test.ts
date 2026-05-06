import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  readCachedResourceState,
  resolveMdmResourceCacheLayout
} from "@mcpskill/resource-registry";

import { registerMcpServerTools, type McpToolHandler } from "./mcp-tools.js";

describe("mc_develop mdm resource status", () => {
  it("returns local mdm resource status in structured content without adding tools", async () => {
    const registry = createCapturingRegistry();
    const mdmSourcesRoot = await createMdmSourcesRoot();
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-runtime-"));
    const workspaceRoot = await createWorkspaceRoot();

    registerMcpServerTools(registry, {
      env: {
        MDM_SOURCES_ROOT: mdmSourcesRoot,
        PATH: ""
      }
    });

    expect(registry.calls.map((call) => call.name)).toEqual(["mc_develop"]);

    const result = await registry.calls[0].handler({
      requestText: "Need Minecraft docs before editing KubeJS.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      mdmResources: {
        status: "available",
        summary: {
          counts: {
            ready: 0,
            missing_required: 1,
            missing_optional: 0,
            invalid_checksum: 0
          }
        }
      }
    });
  });

  it("requires explicit confirmation before installing a release artifact", async () => {
    const registry = createCapturingRegistry();
    const release = await createMdmReleaseOut("offline docs");
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-runtime-"));
    const workspaceRoot = await createWorkspaceRoot();
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);

    registerMcpServerTools(registry, {
      env: {
        PATH: ""
      }
    });

    const result = await registry.calls[0].handler({
      requestText: "Prepare the required MDM docs package.",
      runtimeRoot,
      workspaceRoot,
      mdmReleaseInstall: {
        manifestPath: release.manifestPath,
        packageId: "core-docs-required"
      }
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      mdmReleaseInstall: {
        status: "needs_confirmation",
        packageId: "core-docs-required",
        expectedSha256: release.sha256
      }
    });
    await expect(
      readCachedResourceState(cacheLayout, "core-docs-required")
    ).resolves.toBeUndefined();
  });

  it("downloads a release artifact into the runtime cache when explicitly allowed", async () => {
    const registry = createCapturingRegistry();
    const release = await createMdmReleaseOut(JSON.stringify({ docs: true }));
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
      requestText: "Install the required MDM docs package.",
      runtimeRoot,
      workspaceRoot,
      mdmReleaseInstall: {
        manifestPath: release.manifestPath,
        packageId: "core-docs-required",
        downloadPolicy: "allowed"
      }
    });
    const structured = result.structuredContent as {
      mdmReleaseInstall?: { state?: { artifactPath?: string } };
    };

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      mdmReleaseInstall: {
        status: "downloaded",
        packageId: "core-docs-required",
        state: {
          sha256: release.sha256
        }
      },
      mdmResources: {
        status: "available",
        summary: {
          counts: {
            ready: 1,
            missing_required: 0
          }
        }
      }
    });
    await expect(
      readFile(structured.mdmReleaseInstall?.state?.artifactPath ?? "", "utf-8")
    ).resolves.toBe(release.body);
  });

  it("uses injected fetchers for remote release manifest installs", async () => {
    const registry = createCapturingRegistry();
    const body = JSON.stringify({ remoteDocs: true });
    const artifactName = "core-docs-required-0.1.0.mdm-resource.json";
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-runtime-"));
    const workspaceRoot = await createWorkspaceRoot();
    const manifestUrl =
      "https://example.test/releases/mdm-resources-v0.1.0/mdm-release-manifest.json";
    const artifactUrl =
      "https://example.test/releases/mdm-resources-v0.1.0/core-docs-required-0.1.0.mdm-resource.json";
    const manifestFetchUrls: string[] = [];
    const artifactFetchUrls: string[] = [];

    registerMcpServerTools(registry, {
      env: {
        PATH: ""
      },
      mdmReleaseManifestFetch: async (url) => {
        manifestFetchUrls.push(url);

        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
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
                  sha256: hashText(body),
                  sizeBytes: Buffer.byteLength(body)
                }
              ]
            })
        };
      },
      mdmArtifactFetch: async (url) => {
        artifactFetchUrls.push(url);

        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => Buffer.from(body)
        };
      }
    });

    const result = await registry.calls[0].handler({
      requestText: "Install remote MDM docs.",
      runtimeRoot,
      workspaceRoot,
      mdmReleaseInstall: {
        manifestUrl,
        packageId: "core-docs-required",
        downloadPolicy: "allowed"
      }
    });
    const structured = result.structuredContent as {
      mdmReleaseInstall?: { state?: { artifactPath?: string } };
    };

    expect(result.isError).toBeUndefined();
    expect(manifestFetchUrls).toEqual([manifestUrl]);
    expect(artifactFetchUrls).toEqual([artifactUrl]);
    expect(result.structuredContent).toMatchObject({
      mdmReleaseInstall: {
        status: "downloaded",
        packageId: "core-docs-required",
        downloadPolicy: "allowed"
      }
    });
    await expect(
      readFile(structured.mdmReleaseInstall?.state?.artifactPath ?? "", "utf-8")
    ).resolves.toBe(body);
  });

  it("uses newly cached MDM docs resources during docs lookup", async () => {
    const registry = createCapturingRegistry();
    const release = await createMdmReleaseOut(mdmDocsArtifactBody());
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
      requestText:
        "In KubeJS 1.20.1, explain offline resource status and ProbeJS.",
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
      selectedEvidence: {
        routeStep: "docs_lookup",
        payload: {
          hits: expect.arrayContaining([
            expect.objectContaining({
              entryId: "offline-resource-status",
              packageId: "core-docs-required"
            })
          ])
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

async function createMdmSourcesRoot(
  release: MdmTestRelease = {
    artifactName: "core-docs-required-0.1.0.mdm-resource.json",
    sha256: "613fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477",
    sizeBytes: 1201
  }
): Promise<string> {
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
        sizeBytes: Buffer.byteLength(body)
      }
    ]
  });

  return {
    manifestPath,
    artifactName,
    body,
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

function mdmDocsArtifactBody(): string {
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
              id: "offline-resource-status",
              title: "Offline Resource Status",
              summary:
                "Missing optional packages are degraded capability, not fatal failure.",
              searchTerms: [
                "offline resource status",
                "resource package",
                "degraded capability"
              ]
            }
          ]
        })
      }
    }
  });
}

interface MdmTestRelease {
  artifactName: string;
  sha256: string;
  sizeBytes: number;
}

interface MdmTestReleaseOut extends MdmTestRelease {
  manifestPath: string;
  body: string;
}

interface CapturingRegistry {
  calls: RegisteredToolCall[];
  registerTool(name: string, config: unknown, handler: McpToolHandler): unknown;
}

interface RegisteredToolCall {
  name: string;
  handler: McpToolHandler;
}
