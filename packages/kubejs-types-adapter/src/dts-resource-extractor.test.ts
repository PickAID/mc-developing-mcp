import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { summarizeKubeJsTypeResources } from "./index.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("ProbeJS declaration resource extraction", () => {
  it("extracts Minecraft resource literals from ProbeJS d.ts declarations", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-dts-resources");

    await writeText(
      join(workspaceRoot, ".probe", "server", "resources.d.ts"),
      [
        "declare type ProbeItemIds =",
        "  | \"minecraft:stone\"",
        "  | \"kubejs:copper_coin\";",
        "declare type ProbeFluidIds = \"minecraft:water\";",
        "declare type ProbeItemTags = \"#forge:ingots/iron\";",
        "declare type ProbeRecipeIds = \"minecraft:crafting_shaped\";",
        "declare type ProbeRegistries = \"minecraft:block\";",
        "declare type GenericIds = \"demo:not_indexed\";",
        ""
      ].join("\n")
    );

    const result = await summarizeKubeJsTypeResources({
      workspaceRoot,
      includeUnknownResources: false,
      maxEntriesPerKind: 5
    });

    expect(result.entries.item).toEqual([
      expect.objectContaining({
        confidence: 0.72,
        extractorId: "probe-dts-resource-literal-v1",
        lineNumber: 2,
        name: "minecraft:stone",
        sourceFormat: "probe-dts-resource-literal",
        value: "minecraft:stone"
      }),
      expect.objectContaining({
        lineNumber: 3,
        name: "kubejs:copper_coin",
        value: "kubejs:copper_coin"
      })
    ]);
    expect(result.entries.fluid).toEqual([
      expect.objectContaining({
        name: "minecraft:water",
        sourceFormat: "probe-dts-resource-literal",
        value: "minecraft:water"
      })
    ]);
    expect(result.entries.tag).toEqual([
      expect.objectContaining({
        name: "forge:ingots/iron",
        sourceFormat: "probe-dts-resource-literal",
        value: "#forge:ingots/iron"
      })
    ]);
    expect(result.entries.registry).toEqual([
      expect.objectContaining({
        name: "minecraft:block",
        sourceFormat: "probe-dts-resource-literal",
        value: "minecraft:block"
      })
    ]);
    expect(result.entries.recipe).toEqual([
      expect.objectContaining({
        name: "minecraft:crafting_shaped",
        sourceFormat: "probe-dts-resource-literal",
        value: "minecraft:crafting_shaped"
      })
    ]);
    expect(result.summary).toMatchObject({
      counts: {
        fluid: 1,
        item: 2,
        recipe: 1,
        registry: 1,
        tag: 1
      },
      searchedFiles: 1,
      unknownCount: 0
    });
  });
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `${prefix}-`));
  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
