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

describe("summarizeKubeJsTypeResources query filtering", () => {
  it("returns only semantic resources that match requested query terms", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-filter");

    await writeText(join(workspaceRoot, ".vscode", "probe.code-snippets"), JSON.stringify({
      "Food Eaten": { prefix: "ItemEvents.foodEaten" },
      "Block Right Clicked": { prefix: "BlockEvents.rightClicked" }
    }));
    await writeText(join(workspaceRoot, ".vscode", "item-attributes.json"), JSON.stringify([
      { id: "minecraft:stone", localized: "Stone" },
      { id: "minecraft:diamond_sword", localized: "Diamond Sword" }
    ]));
    await writeText(
      join(workspaceRoot, "kubejs", "probejs", "recipes", "minecraft.txt"),
      ["minecraft:crafting_shaped", "minecraft:smelting"].join("\n")
    );
    await writeText(join(workspaceRoot, ".vscode", "probe.class-definitions.json"), JSON.stringify({
      definitions: {
        typeClassName: {
          enum: [
            "net.minecraft.world.item.ItemStack",
            "net.minecraft.world.level.Level"
          ]
        }
      }
    }));
    await writeText(
      join(workspaceRoot, "kubejs", "probe", "cache", "docs", "future.json"),
      "{\"futureProbeShape\":true}\n"
    );

    const result = await summarizeKubeJsTypeResources({
      workspaceRoot,
      includeUnknownResources: false,
      maxEntriesPerKind: 5,
      resourceQueries: ["ItemEvents.foodEaten", "diamond sword", "ItemStack", "smelting"]
    });

    expect(result.entries.snippet.map((entry) => entry.name)).toEqual(["Food Eaten"]);
    expect(result.entries.item.map((entry) => entry.name)).toEqual([
      "minecraft:diamond_sword"
    ]);
    expect(result.entries.class.map((entry) => entry.name)).toEqual([
      "net.minecraft.world.item.ItemStack"
    ]);
    expect(result.entries.recipe.map((entry) => entry.name)).toEqual([
      "minecraft:smelting"
    ]);
    expect(result.entries.registry).toEqual([]);
    expect(result.unknownResources).toEqual([]);
  });

  it("deduplicates matching entries by semantic kind and name", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-filter-dedupe");

    await writeText(join(workspaceRoot, ".vscode", "probe.class-definitions.json"), JSON.stringify({
      definitions: {
        typeClassName: {
          enum: ["dev.latvian.mods.kubejs.item.FoodEatenEventJS"]
        }
      }
    }));
    await writeText(
      join(workspaceRoot, ".probe", "classes.txt"),
      "dev.latvian.mods.kubejs.item.$FoodEatenEventJS\n"
    );

    const result = await summarizeKubeJsTypeResources({
      workspaceRoot,
      includeUnknownResources: false,
      resourceQueries: ["FoodEatenEventJS"]
    });

    expect(result.entries.class).toEqual([
      expect.objectContaining({
        confidence: 0.85,
        name: "dev.latvian.mods.kubejs.item.FoodEatenEventJS",
        sourceFormat: "probe-class-definitions-json"
      })
    ]);
  });

  it("keeps total matching counts separate from bounded returned entries", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-filter-counts");

    await writeText(
      join(workspaceRoot, ".vscode", "item-attributes.json"),
      JSON.stringify([
        { id: "minecraft:stone", localized: "Stone" },
        { id: "minecraft:granite", localized: "Granite" },
        { id: "minecraft:andesite", localized: "Andesite" }
      ])
    );

    const result = await summarizeKubeJsTypeResources({
      workspaceRoot,
      includeUnknownResources: false,
      maxEntriesPerKind: 1,
      resourceQueries: ["minecraft"]
    });

    expect(result.entries.item).toHaveLength(1);
    expect(result.summary.counts.item).toBe(1);
    expect(result.summary.totalCounts.item).toBe(3);
    expect(result.summary.truncated).toBe(true);
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
