import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  readCachedResourceState,
  resolveMdmResourceCacheLayout,
  writeCachedResourceState
} from "@mcpskill/resource-registry";
import { describe, expect, it } from "vitest";

import {
  MC_DEVELOP_TOOL_NAME,
  registerMcpServerTools,
  type McpToolHandler
} from "./mcp-tools.js";

describe("mc_develop vanilla generation targets", () => {
  it("exposes consent-gated local targets for an official catalog version", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-runtime-"));
    const workspaceRoot = await createWorkspaceRoot();
    const mdmSourcesRoot = await createMdmSourcesRoot();
    const fetchUrls: string[] = [];

    await cacheReleaseCatalog(runtimeRoot);
    registerMcpServerTools(registry, {
      env: {
        MDM_SOURCES_ROOT: mdmSourcesRoot,
        PATH: ""
      },
      mdmReleaseManifestFetch: async (url) => {
        fetchUrls.push(url);
        throw new Error("remote manifest fetch should not run");
      },
      mdmArtifactFetch: async (url) => {
        fetchUrls.push(url);
        throw new Error("artifact fetch should not run");
      }
    });

    expect(registry.calls.map((call) => call.name)).toEqual([
      MC_DEVELOP_TOOL_NAME
    ]);

    const result = await registry.calls[0].handler({
      requestText:
        "List official vanilla local-generation targets for Minecraft 26.1.2. Do not download.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(fetchUrls).toEqual([]);
    expect(result.structuredContent).toMatchObject({
      selectedEvidence: {
        routeStep: "datapack_files",
        payload: {
          source: "vanilla_generation_targets",
          result: {
            status: "ready",
            plan: {
              minecraftVersion: "26.1.2",
              targets: expect.arrayContaining([
                expect.objectContaining({
                  sourcePackage: expect.objectContaining({
                    packageId: "minecraft-26.1.2-source-pack-named"
                  }),
                  requiresUserConsent: true,
                  distributionPolicy: "local-generation-only"
                }),
                expect.objectContaining({
                  sourcePackage: expect.objectContaining({
                    packageId: "minecraft-26.1.2-vanilla-datapack-official"
                  }),
                  requiresUserConsent: true,
                  distributionPolicy: "local-generation-only"
                }),
                expect.objectContaining({
                  sourcePackage: expect.objectContaining({
                    packageId:
                      "minecraft-26.1.2-vanilla-resource-pack-official"
                  }),
                  requiresUserConsent: true,
                  distributionPolicy: "local-generation-only"
                }),
                expect.objectContaining({
                  sourcePackage: expect.objectContaining({
                    packageId: "minecraft-26.1.2-vanilla-assets-official"
                  }),
                  requiresUserConsent: true,
                  distributionPolicy: "local-generation-only"
                })
              ])
            }
          }
        }
      }
    });
    expect(result.structuredContent).not.toHaveProperty("mdmReleaseInstall");
  });

  it("returns install guidance when the release catalog is not cached", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-runtime-"));
    const workspaceRoot = await createWorkspaceRoot();
    const mdmSourcesRoot = await createMdmSourcesRoot();
    const fetchUrls: string[] = [];

    registerMcpServerTools(registry, {
      env: {
        MDM_SOURCES_ROOT: mdmSourcesRoot,
        PATH: ""
      },
      mdmReleaseManifestFetch: async (url) => {
        fetchUrls.push(url);
        throw new Error("remote manifest fetch should not run");
      },
      mdmArtifactFetch: async (url) => {
        fetchUrls.push(url);
        throw new Error("artifact fetch should not run");
      }
    });

    const result = await registry.calls[0].handler({
      requestText:
        "List official vanilla local-generation targets for Minecraft 26.1.2. Do not download.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(fetchUrls).toEqual([]);
    await expect(
      readCachedResourceState(
        resolveMdmResourceCacheLayout(runtimeRoot),
        "minecraft-release-catalog"
      )
    ).resolves.toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      selectedEvidence: {
        payload: {
          source: "vanilla_generation_targets",
          result: {
            status: "catalog_unavailable",
            nextAction: {
              packageId: "minecraft-release-catalog",
              downloadPolicy: "disabled",
              manifestPath: join(
                mdmSourcesRoot,
                "release-out",
                "mdm-release-manifest.json"
              ),
              mdmReleaseInstall: {
                packageId: "minecraft-release-catalog",
                downloadPolicy: "disabled",
                manifestPath: join(
                  mdmSourcesRoot,
                  "release-out",
                  "mdm-release-manifest.json"
                )
              }
            },
            catalog: {
              installSuggestion: {
                packageId: "minecraft-release-catalog",
                downloadPolicy: "disabled",
                mdmReleaseInstall: {
                  packageId: "minecraft-release-catalog",
                  downloadPolicy: "disabled"
                }
              }
            }
          }
        }
      }
    });
    expect(result.structuredContent).not.toHaveProperty("mdmReleaseInstall");
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
  const root = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-workspace-"));

  await writeFile(join(root, "build.gradle"), "plugins { id 'java' }\n");
  return root;
}

async function createMdmSourcesRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-mdm-"));
  const body = releaseCatalogArtifactBody();
  const sha256 = hashText(body);

  await mkdir(join(root, "registry", "packages"), { recursive: true });
  await writeJson(join(root, "registry", "index.json"), {
    schemaVersion: 1,
    packages: [
      {
        id: "minecraft-release-catalog",
        manifestPath: "registry/packages/minecraft-release-catalog.json",
        required: true,
        format: "json",
        currentRelease: release(sha256, body)
      }
    ]
  });
  await writeJson(
    join(root, "registry", "packages", "minecraft-release-catalog.json"),
    {
      schemaVersion: 1,
      id: "minecraft-release-catalog",
      sourcePath: "packages/minecraft/releases/catalog/package.json",
      currentRelease: release(sha256, body)
    }
  );

  return root;
}

async function cacheReleaseCatalog(runtimeRoot: string): Promise<void> {
  const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
  const body = releaseCatalogArtifactBody();
  const artifactPath = join(
    cacheLayout.artifactsDir,
    "minecraft-release-catalog",
    "minecraft-release-catalog-0.1.0.mdm-resource.json"
  );

  await mkdir(join(cacheLayout.artifactsDir, "minecraft-release-catalog"), {
    recursive: true
  });
  await writeFile(artifactPath, body);
  await writeCachedResourceState(cacheLayout, {
    packageId: "minecraft-release-catalog",
    artifactName: "minecraft-release-catalog-0.1.0.mdm-resource.json",
    artifactPath,
    sha256: hashText(body),
    updatedAt: "2026-05-06T00:00:00.000Z"
  });
}

function release(sha256: string, body: string) {
  return {
    artifactName: "minecraft-release-catalog-0.1.0.mdm-resource.json",
    sha256,
    sizeBytes: Buffer.byteLength(body)
  };
}

function releaseCatalogArtifactBody(): string {
  return JSON.stringify({
    schemaVersion: 1,
    package: {
      id: "minecraft-release-catalog",
      artifactType: "docs"
    },
    payload: {
      "payload/release-catalog.json": {
        repoPath:
          "packages/minecraft/releases/catalog/payload/release-catalog.json",
        content: JSON.stringify({
          schemaVersion: 1,
          latest: { release: "26.1.2" },
          releaseCount: 2,
          releases: [{ id: "26.1.2" }, { id: "1.20.1" }]
        })
      }
    }
  });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function hashText(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

interface CapturingRegistry {
  calls: RegisteredToolCall[];
  registerTool(name: string, config: unknown, handler: McpToolHandler): unknown;
}

interface RegisteredToolCall {
  name: string;
  handler: McpToolHandler;
}
