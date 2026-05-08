import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildSourceIndex } from "@mcpskill/source-index";
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

describe("mc_develop local source-index sqlite runtime corpus", () => {
  it("passes runtime source-index.sqlite databases into source acquisition preview", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-local-source-index-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-local-source-index-workspace-");
    const sourceRoot = await createItemStackSourceRoot();
    const databasePath = join(
      runtimeRoot,
      "installs",
      "minecraft-1.20.1-source-pack-named",
      "source-index.sqlite"
    );

    await mkdir(join(databasePath, ".."), { recursive: true });
    await buildSourceIndex({
      sourceRoot,
      databasePath,
      packageId: "minecraft-1.20.1-source-index"
    });

    registerMcpServerTools(registry, {
      env: {
        PATH: ""
      }
    });

    const result = await registry.calls[0].handler({
      requestText:
        "Find source for official Minecraft 1.20.1 net.minecraft.world.item.ItemStack from Modrinth context and local source index.",
      runtimeRoot,
      workspaceRoot
    });

    expect(registry.calls.map((call) => call.name)).toEqual([
      MC_DEVELOP_TOOL_NAME
    ]);
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      executions: expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          status: "context",
          payload: expect.objectContaining({
            cachedSourceIndexes: {
              databaseCount: 1,
              databases: [databasePath]
            },
            sourceIndexPreview: expect.objectContaining({
              query: "net.minecraft.world.item.ItemStack",
              searchedDatabaseCount: 1,
              matches: [
                expect.objectContaining({
                  databasePath,
                  path: "net/minecraft/world/item/ItemStack.java",
                  qualifiedName: "net.minecraft.world.item.ItemStack",
                  matchReasons: expect.arrayContaining(["symbol"])
                })
              ]
            })
          })
        })
      ])
    });
  });
});

async function createItemStackSourceRoot(): Promise<string> {
  const root = await createTempRoot("mcpskill-local-source-index-src-");

  await writeText(
    join(root, "net", "minecraft", "world", "item", "ItemStack.java"),
    [
      "package net.minecraft.world.item;",
      "public class ItemStack {",
      "  public ItemStack copy() { return this; }",
      "}"
    ].join("\n")
  );

  return root;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));

  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string): Promise<void> {
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

interface CapturingRegistry {
  calls: RegisteredToolCall[];
  registerTool(name: string, config: unknown, handler: McpToolHandler): unknown;
}

interface RegisteredToolCall {
  name: string;
  handler: McpToolHandler;
}
