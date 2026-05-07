import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { registerMcpServerTools, type McpToolHandler } from "./mcp-tools.js";

describe("mc_develop mdm package recommendations", () => {
  it("recommends intent-matched missing MDM packages with confirmation-safe install hints", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-rec-"));
    const mdmSourcesRoot = await createMdmSourcesRoot(tempRoot);
    const runtimeRoot = join(tempRoot, "runtime");
    const workspaceRoot = await createWorkspaceRoot(tempRoot);
    const registry = createCapturingRegistry();

    registerMcpServerTools(registry, {
      env: {
        MDM_SOURCES_ROOT: mdmSourcesRoot,
        PATH: ""
      }
    });

    const result = await registry.calls[0].handler({
      requestText:
        "Need KubeJS ForgeEvents and NativeEvents guidance for a datapack recipe task.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      mdmPackageRecommendations: {
        policy: "recommend_before_download",
        suggestions: [
          expect.objectContaining({
            packageId: "kubejs-1.20.1-guidance",
            status: "missing_optional",
            priority: "high",
            matchedSignals: expect.arrayContaining(["kubejs"]),
            mdmReleaseInstall: {
              packageId: "kubejs-1.20.1-guidance",
              downloadPolicy: "disabled",
              manifestPath: join(mdmSourcesRoot, "release-out", "mdm-release-manifest.json")
            }
          }),
          expect.objectContaining({
            packageId: "minecraft-1.20.1-vanilla-datapack-profile",
            priority: "medium",
            matchedSignals: expect.arrayContaining(["datapack"])
          })
        ]
      }
    });
  });

  it("recommends source acquisition profiles for source lookup requests", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-source-rec-"));
    const mdmSourcesRoot = await createMdmSourcesRoot(tempRoot);
    const runtimeRoot = join(tempRoot, "runtime");
    const workspaceRoot = await createWorkspaceRoot(tempRoot);
    const registry = createCapturingRegistry();

    registerMcpServerTools(registry, {
      env: {
        MDM_SOURCES_ROOT: mdmSourcesRoot,
        PATH: ""
      }
    });

    const result = await registry.calls[0].handler({
      requestText:
        "Need Minecraft source lookup for ItemStack while migrating mappings.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      mdmPackageRecommendations: {
        suggestions: [
          expect.objectContaining({
            packageId: "minecraft-1.20.1-vanilla-source-profile",
            status: "missing_optional",
            priority: "high",
            matchedSignals: expect.arrayContaining(["sources"]),
            mdmReleaseInstall: {
              packageId: "minecraft-1.20.1-vanilla-source-profile",
              downloadPolicy: "disabled",
              manifestPath: join(mdmSourcesRoot, "release-out", "mdm-release-manifest.json")
            }
          })
        ]
      }
    });
  });
});

async function createWorkspaceRoot(tempRoot: string): Promise<string> {
  const root = join(tempRoot, "workspace");

  await mkdir(join(root, "kubejs", "server_scripts"), { recursive: true });
  await writeFile(join(root, "kubejs", "server_scripts", "main.js"), "\n");

  return root;
}

async function createMdmSourcesRoot(tempRoot: string): Promise<string> {
  const root = join(tempRoot, "mdm-sources");

  await mkdir(join(root, "registry", "packages"), { recursive: true });
  await writeJson(join(root, "registry", "index.json"), {
    schemaVersion: 1,
    packages: [
      packageIndexEntry("kubejs-1.20.1-guidance", "kubejs"),
      packageIndexEntry("minecraft-1.20.1-vanilla-datapack-profile", "datapack"),
      packageIndexEntry("client-visual-1.20.1-guidance", "client-visual"),
      packageIndexEntry("minecraft-1.20.1-vanilla-source-profile", "sources")
    ]
  });
  await writePackage(root, {
    id: "kubejs-1.20.1-guidance",
    channel: "docs",
    family: "kubejs",
    artifactName: "kubejs-1.20.1-guidance-0.1.0.mdm-resource.json",
    capabilities: ["docs_search", "docs_direct_read"]
  });
  await writePackage(root, {
    id: "minecraft-1.20.1-vanilla-datapack-profile",
    channel: "datapack",
    family: "vanilla-datapack",
    artifactName:
      "minecraft-1.20.1-vanilla-datapack-profile-0.1.0.mdm-resource.json",
    capabilities: ["resource_location_lookup", "datapack_trace"]
  });
  await writePackage(root, {
    id: "client-visual-1.20.1-guidance",
    channel: "docs",
    family: "client-visual",
    artifactName: "client-visual-1.20.1-guidance-0.1.0.mdm-resource.json",
    capabilities: ["docs_search", "resourcepack_trace"]
  });
  await writePackage(root, {
    id: "minecraft-1.20.1-vanilla-source-profile",
    channel: "sources",
    family: "vanilla-sources",
    artifactName:
      "minecraft-1.20.1-vanilla-source-profile-0.1.0.mdm-resource.json",
    capabilities: ["source_lookup", "source_chunk_search"]
  });

  return root;
}

function packageIndexEntry(id: string, family: string) {
  return {
    id,
    manifestPath: `registry/packages/${id}.json`,
    required: false,
    format: "json",
    releaseFamily: family
  };
}

async function writePackage(root: string, input: TestPackage): Promise<void> {
  await writeJson(join(root, "registry", "packages", `${input.id}.json`), {
    schemaVersion: 1,
    id: input.id,
    sourcePath: `packages/${input.id}/package.json`,
    currentRelease: {
      artifactName: input.artifactName,
      sha256: "0".repeat(64),
      sizeBytes: 100
    },
    releaseChannel: input.channel,
    releaseFamily: input.family,
    capabilities: input.capabilities,
    metadata: {
      storageKind: "remote_manifest",
      installTier: "optional_dataset",
      commitPolicy: "repository_manifest"
    }
  });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createCapturingRegistry(): CapturingRegistry {
  const calls: RegisteredToolCall[] = [];

  return {
    calls,
    registerTool(name, _config, handler) {
      calls.push({ name, handler });
    }
  };
}

interface TestPackage {
  id: string;
  channel: string;
  family: string;
  artifactName: string;
  capabilities: string[];
}

interface CapturingRegistry {
  calls: RegisteredToolCall[];
  registerTool(name: string, config: unknown, handler: McpToolHandler): unknown;
}

interface RegisteredToolCall {
  name: string;
  handler: McpToolHandler;
}
