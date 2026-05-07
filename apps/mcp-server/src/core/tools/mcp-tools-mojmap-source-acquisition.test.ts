import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { registerMcpServerTools, type McpToolHandler } from "./mcp-tools.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("mc_develop Mojmap source acquisition acceptance", () => {
  it("materializes Mojmap mappings from a configured Mojang manifest", async () => {
    const registry = createCapturingRegistry();
    const fetchedUrls: string[] = [];

    registerMcpServerTools(registry, {
      env: {
        MCPSKILL_YARN_MAPPING_URL_TEMPLATE: "https://maven.test/yarn/{version}",
        MCPSKILL_MOJANG_VERSION_MANIFEST_URL:
          "https://piston-meta.test/version_manifest_v2.json"
      },
      mappingIndexFetch: async (url) => {
        fetchedUrls.push(url.toString());
        return mojmapResponse(url);
      }
    });

    const result = await registry.calls[0].handler({
      requestText:
        "Find source for a NeoForge mod from Modrinth and Mojang mappings mojmap for Minecraft 1.21.1 obfuscated ItemStack mixin target.",
      runtimeRoot: await createTempRoot("mcpskill-mojmap-runtime-"),
      workspaceRoot: await createEmptyWorkspace()
    });

    expect(result.isError).toBeUndefined();
    expect(fetchedUrls).toEqual([
      "https://piston-meta.test/version_manifest_v2.json",
      "https://piston-meta.test/v1/packages/abc/1.21.1.json",
      "https://piston-data.test/client.txt",
      "https://piston-data.test/server.txt"
    ]);
    expect(result.structuredContent).toMatchObject({
      executions: expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          payload: expect.objectContaining({
            workItemExecutions: expect.arrayContaining([
              expect.objectContaining({
                kind: "mapping_index",
                payload: expect.objectContaining({
                  status: "ready",
                  mappingFamily: "mojmap",
                  entryCount: 4,
                  provenance: expect.objectContaining({
                    format: "proguard",
                    fromNamespace: "official",
                    toNamespace: "mojmap"
                  })
                })
              })
            ])
          })
        })
      ])
    });
  });

  it("does not fetch Mojmap mappings when no Mojang provider is configured", async () => {
    const registry = createCapturingRegistry();
    const fetchedUrls: string[] = [];

    registerMcpServerTools(registry, {
      env: {
        MCPSKILL_YARN_MAPPING_URL_TEMPLATE: undefined,
        MCPSKILL_YARN_MAVEN_BASE_URL: undefined,
        MCPSKILL_MOJANG_VERSION_MANIFEST_URL: undefined
      },
      mappingIndexFetch: async (url) => {
        fetchedUrls.push(url.toString());
        return new Response("", { status: 500 });
      }
    });

    const result = await registry.calls[0].handler({
      requestText:
        "Find source for a NeoForge mod from Modrinth and Mojang mappings mojmap for Minecraft 1.21.1 obfuscated ItemStack mixin target.",
      runtimeRoot: await createTempRoot("mcpskill-mojmap-disabled-runtime-"),
      workspaceRoot: await createEmptyWorkspace()
    });

    expect(result.isError).toBeUndefined();
    expect(fetchedUrls).toEqual([]);
    expect(result.structuredContent).toMatchObject({
      executions: expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          payload: expect.objectContaining({
            workItemExecutions: expect.arrayContaining([
              expect.objectContaining({
                kind: "mapping_index",
                payload: expect.objectContaining({
                  status: "provider_required",
                  mappingFamily: "mojmap"
                })
              })
            ])
          })
        })
      ])
    });
  });
});

function mojmapResponse(url: URL): Response {
  if (url.pathname.endsWith("version_manifest_v2.json")) {
    return jsonResponse({
      versions: [
        {
          id: "1.21.1",
          url: "https://piston-meta.test/v1/packages/abc/1.21.1.json"
        }
      ]
    });
  }
  if (url.pathname.endsWith("1.21.1.json")) {
    return jsonResponse({
      downloads: {
        client_mappings: { url: "https://piston-data.test/client.txt" },
        server_mappings: { url: "https://piston-data.test/server.txt" }
      }
    });
  }

  return new Response(
    "net.minecraft.world.item.ItemStack -> cxo:\n    int count -> b\n",
    { status: 200 }
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

async function createEmptyWorkspace(): Promise<string> {
  const root = await createTempRoot("mcpskill-mojmap-empty-");
  await mkdir(root, { recursive: true });
  return root;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
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

interface CapturingRegistry {
  calls: RegisteredToolCall[];
  registerTool: (
    name: string,
    config: unknown,
    handler: McpToolHandler
  ) => void;
}

interface RegisteredToolCall {
  name: string;
  handler: McpToolHandler;
}
