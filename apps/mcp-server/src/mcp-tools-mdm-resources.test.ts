import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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

async function createMdmSourcesRoot(): Promise<string> {
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
      artifactName: "core-docs-required-0.1.0.mdm-resource.json",
      sha256: "613fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477",
      sizeBytes: 1201
    }
  });

  return root;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

interface CapturingRegistry {
  calls: RegisteredToolCall[];
  registerTool(name: string, config: unknown, handler: McpToolHandler): unknown;
}

interface RegisteredToolCall {
  name: string;
  handler: McpToolHandler;
}
