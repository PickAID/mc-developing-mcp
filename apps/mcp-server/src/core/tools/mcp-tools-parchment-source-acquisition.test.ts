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

describe("mc_develop Parchment source acquisition acceptance", () => {
  it("materializes Parchment mappings from configured Maven metadata", async () => {
    const registry = createCapturingRegistry();
    const fetchedUrls: string[] = [];

    registerMcpServerTools(registry, {
      env: {
        MCPSKILL_YARN_MAPPING_URL_TEMPLATE: "https://maven.test/yarn/{version}",
        MCPSKILL_PARCHMENT_MAVEN_BASE_URL: "https://maven.parchmentmc.test"
      },
      mappingIndexFetch: async (url) => {
        fetchedUrls.push(url.toString());
        return parchmentResponse(url);
      }
    });

    const result = await registry.calls[0].handler({
      requestText:
        "Find source for a NeoForge mod from Modrinth and Parchment mappings for Minecraft 1.21.1 ItemStack parameter names.",
      runtimeRoot: await createTempRoot("mcpskill-parchment-runtime-"),
      workspaceRoot: await createEmptyWorkspace()
    });

    expect(result.isError).toBeUndefined();
    expect(fetchedUrls).toEqual([
      "https://maven.parchmentmc.test/org/parchmentmc/data/parchment-1.21.1/maven-metadata.xml",
      "https://maven.parchmentmc.test/org/parchmentmc/data/parchment-1.21.1/2024.11.17/parchment-1.21.1-2024.11.17.zip"
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
                  mappingFamily: "parchment",
                  entryCount: 2,
                  provenance: expect.objectContaining({
                    format: "parchment_json",
                    parchmentVersion: "2024.11.17"
                  })
                })
              })
            ])
          })
        })
      ])
    });
  });

  it("does not fetch Parchment mappings when no Parchment provider is configured", async () => {
    const registry = createCapturingRegistry();
    const fetchedUrls: string[] = [];

    registerMcpServerTools(registry, {
      env: {
        MCPSKILL_YARN_MAPPING_URL_TEMPLATE: undefined,
        MCPSKILL_YARN_MAVEN_BASE_URL: undefined,
        MCPSKILL_MOJANG_VERSION_MANIFEST_URL: undefined,
        MCPSKILL_PARCHMENT_MAVEN_BASE_URL: undefined
      },
      mappingIndexFetch: async (url) => {
        fetchedUrls.push(url.toString());
        return new Response("", { status: 500 });
      }
    });

    const result = await registry.calls[0].handler({
      requestText:
        "Find source for a NeoForge mod from Modrinth and Parchment mappings for Minecraft 1.21.1 ItemStack parameter names.",
      runtimeRoot: await createTempRoot("mcpskill-parchment-disabled-runtime-"),
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
                  mappingFamily: "parchment"
                })
              })
            ])
          })
        })
      ])
    });
  });
});

function parchmentResponse(url: URL): Response {
  if (url.pathname.endsWith("/maven-metadata.xml")) {
    return new Response(
      "<metadata><versioning><release>2024.11.17</release></versioning></metadata>",
      { status: 200 }
    );
  }

  return new Response(
    createZipWithContents([
      {
        name: "parchment.json",
        content: JSON.stringify({
          classes: [
            {
              name: "net/minecraft/world/item/ItemStack",
              methods: [{ name: "getCount", descriptor: "()I" }]
            }
          ]
        })
      }
    ]),
    { status: 200 }
  );
}

async function createEmptyWorkspace(): Promise<string> {
  const root = await createTempRoot("mcpskill-parchment-empty-");
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

function createZipWithContents(entries: Array<{ name: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.from(entry.content);
    const localHeader = Buffer.alloc(30);
    const centralHeader = Buffer.alloc(46);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);

    localParts.push(localHeader, name, content);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const eocd = Buffer.alloc(22);

  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localFiles.length, 16);

  return Buffer.concat([localFiles, centralDirectory, eocd]);
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
