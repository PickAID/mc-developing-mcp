import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  readCachedResourceState,
  resolveMdmResourceCacheLayout
} from "minecraft-developing-mcp-resource-registry";

import { registerMcpServerTools } from "../tools/mcp-tools.js";
import {
  createCapturingRegistry,
  createMdmReleaseOut,
  createMdmReleaseOutForPackage,
  createMdmSourcesRoot,
  createSinglePackageMdmSourcesRoot,
  createWorkspaceRoot,
  hashText,
  mdmDocsArtifactBody,
  mdmGuidanceArtifactBody,
  mdmVanillaSchemaDocsArtifactBody
} from "../../../test-fixtures/mcp-tools-mdm-resource-fixtures.js";

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

  it("returns local mdm-sources release acceptance status in structured content", async () => {
    const registry = createCapturingRegistry();
    const mdmSourcesRoot = await createMdmSourcesRoot();
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-runtime-"));
    const workspaceRoot = await createWorkspaceRoot();
    await mkdir(join(mdmSourcesRoot, "release-out"), { recursive: true });
    await writeFile(
      join(mdmSourcesRoot, "release-out", "mdm-release-acceptance-report.json"),
      `${JSON.stringify({
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
      })}\n`
    );

    registerMcpServerTools(registry, {
      env: {
        MDM_SOURCES_ROOT: mdmSourcesRoot,
        PATH: ""
      }
    });

    const result = await registry.calls[0].handler({
      requestText: "Check local MDM release readiness.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      mdmResources: {
        releaseAcceptance: {
          status: "passed",
          packageCount: 465,
          artifactCount: 467,
          installVerifiedCount: 465,
          installPackageCount: 465
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
                  sizeBytes: Buffer.byteLength(body),
                  releaseChannel: "required",
                  releaseFamily: "core-docs",
                  capabilities: ["docs_search", "docs_direct_read"]
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

  it("uses cached v2 guidance docs bundles during docs lookup", async () => {
    const registry = createCapturingRegistry();
    const body = mdmGuidanceArtifactBody();
    const release = await createMdmReleaseOutForPackage({
      body,
      artifactName: "client-visual-1.20.1-guidance-0.2.0.mdm-resource.json",
      packageId: "client-visual-1.20.1-guidance",
      namespace: "client-visual",
      version: "0.2.0",
      releaseFamily: "client-visual"
    });
    const mdmSourcesRoot = await createSinglePackageMdmSourcesRoot({
      packageId: "client-visual-1.20.1-guidance",
      manifestName: "client-visual-1.20.1-guidance.json",
      release
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
        "Find client visual renderer implementation evidence chain guidance.",
      runtimeRoot,
      workspaceRoot,
      mdmReleaseInstall: {
        manifestPath: release.manifestPath,
        packageId: "client-visual-1.20.1-guidance",
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
              entryId: "client-visual-1.20.1-guidance-purpose",
              packageId: "client-visual-1.20.1-guidance"
            })
          ])
        }
      }
    });
  });

  it("uses cached vanilla-schema-docs during schema docs lookup", async () => {
    const registry = createCapturingRegistry();
    const body = mdmVanillaSchemaDocsArtifactBody();
    const release = await createMdmReleaseOutForPackage({
      body,
      artifactName: "vanilla-schema-docs-0.1.0.mdm-resource.json",
      packageId: "vanilla-schema-docs",
      namespace: "minecraft",
      version: "0.1.0",
      releaseFamily: "vanilla-schema-docs"
    });
    const mdmSourcesRoot = await createSinglePackageMdmSourcesRoot({
      packageId: "vanilla-schema-docs",
      manifestName: "vanilla-schema-docs.json",
      release
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
        "Explain vanilla-mcdoc recipe datapack schema and model resource-pack schema.",
      runtimeRoot,
      workspaceRoot,
      mdmReleaseInstall: {
        manifestPath: release.manifestPath,
        packageId: "vanilla-schema-docs",
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
              entryId: "vanilla-schema-docs-datapack-mcdoc-java-data-recipe",
              packageId: "vanilla-schema-docs"
            }),
            expect.objectContaining({
              entryId: "vanilla-schema-docs-resource-pack-mcdoc-java-assets-model",
              packageId: "vanilla-schema-docs"
            })
          ])
        }
      }
    });
  });

});
