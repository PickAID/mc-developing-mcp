import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  MC_DEVELOP_TOOL_NAME,
  registerMcpServerTools,
  type McpToolHandler
} from "./mcp-tools.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("mc_develop source acquisition acceptance", () => {
  it("indexes workspace mod jars through source acquisition context evidence", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-source-e2e-runtime-");
    const workspaceRoot = await createModpackWorkspace();

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText:
        "Find source for the local mod jar from Modrinth without downloading.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      executions: expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          status: "context",
          payload: expect.objectContaining({
            source: "source_acquisition_plan",
            workItemExecutionStatus: "partial",
            workItemExecutions: expect.arrayContaining([
              expect.objectContaining({
                kind: "jar_index",
                status: "completed",
                payload: expect.objectContaining({
                  source: "source_acquisition_jar_index",
                  archiveCount: 1,
                  entryCount: 3,
                  domainCounts: {
                    assets: 1,
                    class: 1,
                    data: 1
                  }
                })
              }),
              expect.objectContaining({
                kind: "remote_metadata",
                status: "skipped",
                reason: "handler_unavailable"
              })
            ])
          })
        })
      ])
    });
  });

  it("returns vanilla generation confirmation evidence from request text version", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-vanilla-e2e-runtime-");
    const workspaceRoot = await createEmptyWorkspace();

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText:
        "Find source for official Minecraft vanilla 1.20.1 from Modrinth context.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      executions: expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          status: "context",
          payload: expect.objectContaining({
            source: "source_acquisition_plan",
            workItemExecutions: expect.arrayContaining([
              expect.objectContaining({
                kind: "vanilla_generation",
                status: "completed",
                payload: expect.objectContaining({
                  source: "source_acquisition_vanilla_generation",
                  result: expect.objectContaining({
                    status: "needs_confirmation",
                    packageId: "minecraft-1.20.1-source-pack-named",
                    confirmationScope: "package-version"
                  })
                })
              })
            ])
          })
        })
      ])
    });
  });
});

async function createModpackWorkspace(): Promise<string> {
  const root = await createTempRoot("mcpskill-source-e2e-workspace-");
  await writeBinary(
    join(root, "mods", "content.jar"),
    createZip([
      "assets/demo/models/item/gear.json",
      "data/demo/recipe/gear.json",
      "com/example/Gear.class"
    ])
  );
  return root;
}

async function createEmptyWorkspace(): Promise<string> {
  const root = await createTempRoot("mcpskill-source-e2e-empty-");
  await mkdir(root, { recursive: true });
  return root;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function writeBinary(path: string, content: Buffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
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

function createZip(entryNames: string[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entryName of entryNames) {
    const name = Buffer.from(entryName);
    const content = Buffer.from("{}\n");
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
  eocd.writeUInt16LE(entryNames.length, 8);
  eocd.writeUInt16LE(entryNames.length, 10);
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
