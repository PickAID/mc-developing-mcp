import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { buildSourceIndex } from "minecraft-developing-mcp-source-index";
import type {
  CurrentRuntime,
  ManagedRuntimeLayout,
  SourcePackageConfirmation
} from "minecraft-developing-mcp-shared-types";
import {
  buildVanillaSourcePackCopyRecipe,
  writeSourcePackageConfirmation
} from "minecraft-developing-mcp-source-package-manager";

import { resolveVanillaSource } from "./resolve.js";

describe("resolveVanillaSource explicit source indexes", () => {
  it("returns ready before source pack approval when the source index matches", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-source-"));
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-index-"));
    const databasePath = join(runtimeRoot, "artifacts", "minecraft-1.20.1-source-index.sqlite");

    await writeIndexedItemStack(sourceRoot, databasePath, "1.20.1");

    await expect(
      resolveVanillaSource({
        runtimeLayout: createRuntimeLayout(runtimeRoot),
        currentRuntime: createCurrentRuntime("1.20.1"),
        request: { symbol: "net.minecraft.world.item.ItemStack" },
        recipes: {},
        sourceIndexDatabasePaths: [databasePath],
        executeRecipe: async () => {
          throw new Error("source-pack install should not run");
        }
      })
    ).resolves.toMatchObject({
      status: "ready",
      packageId: "minecraft-1.20.1-source-pack-named",
      acquisition: { status: "needs_confirmation" },
      references: [
        {
          relativePath: "net/minecraft/world/item/ItemStack.java",
          reason: "indexed vanilla source chunk match",
          content: expect.stringContaining("public class ItemStack")
        }
      ]
    });
  });

  it("keeps needs_confirmation when an explicit source index has no match", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-source-"));
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-index-"));
    const databasePath = join(runtimeRoot, "artifacts", "minecraft-1.20.1-source-index.sqlite");

    await writeIndexedItemStack(sourceRoot, databasePath, "1.20.1");

    await expect(
      resolveVanillaSource({
        runtimeLayout: createRuntimeLayout(runtimeRoot),
        currentRuntime: createCurrentRuntime("1.20.1"),
        request: { symbol: "net.minecraft.world.level.block.Block" },
        recipes: {},
        sourceIndexDatabasePaths: [databasePath],
        executeRecipe: async () => {
          throw new Error("source-pack install should not run");
        }
      })
    ).resolves.toMatchObject({
      status: "needs_confirmation",
      acquisition: { status: "needs_confirmation" }
    });
  });

  it("ignores source index matches from another Minecraft version", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-source-"));
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-index-"));
    const databasePath = join(runtimeRoot, "artifacts", "minecraft-1.21.1-source-index.sqlite");

    await writeIndexedItemStack(sourceRoot, databasePath, "1.21.1");

    await expect(
      resolveVanillaSource({
        runtimeLayout: createRuntimeLayout(runtimeRoot),
        currentRuntime: createCurrentRuntime("1.20.1"),
        request: { symbol: "net.minecraft.world.item.ItemStack" },
        recipes: {},
        sourceIndexDatabasePaths: [databasePath],
        executeRecipe: async () => {
          throw new Error("source-pack install should not run");
        }
      })
    ).resolves.toMatchObject({
      status: "needs_confirmation",
      acquisition: { status: "needs_confirmation" }
    });
  });

  it("does not install a confirmed source pack when a matching source index exists", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-source-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-index-"));
    const databasePath = join(runtimeRoot, "artifacts", "minecraft-1.20.1-source-index.sqlite");
    let recipeCalls = 0;

    await writeSourcePackageConfirmation(runtimeLayout, createConfirmation("1.20.1"));
    await writeIndexedItemStack(sourceRoot, databasePath, "1.20.1");

    const result = await resolveVanillaSource({
      runtimeLayout,
      currentRuntime: createCurrentRuntime("1.20.1"),
      request: { symbol: "net.minecraft.world.item.ItemStack" },
      recipes: {
        "minecraft-1.20.1-source-pack-named": buildVanillaSourcePackCopyRecipe({
          minecraftVersion: "1.20.1",
          sourceRoot
        })
      },
      sourceIndexDatabasePaths: [databasePath],
      executeRecipe: async () => {
        recipeCalls += 1;
        throw new Error("source-pack install should not run");
      }
    });

    expect(recipeCalls).toBe(0);
    expect(result.acquisition).toBeUndefined();
    expect(result).toMatchObject({
      status: "ready",
      references: [
        {
          reason: "indexed vanilla source chunk match",
          relativePath: "net/minecraft/world/item/ItemStack.java"
        }
      ]
    });
  });
});

async function writeIndexedItemStack(
  sourceRoot: string,
  databasePath: string,
  minecraftVersion: string
): Promise<void> {
  await mkdir(join(sourceRoot, "net", "minecraft", "world", "item"), {
    recursive: true
  });
  await mkdir(join(databasePath, ".."), { recursive: true });
  await writeFile(
    join(sourceRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
    "package net.minecraft.world.item;\npublic class ItemStack {}\n"
  );
  await buildSourceIndex({
    sourceRoot,
    databasePath,
    packageId: `minecraft-${minecraftVersion}-source-index`
  });
}

function createRuntimeLayout(runtimeRoot: string): ManagedRuntimeLayout {
  return {
    root: runtimeRoot,
    downloads: join(runtimeRoot, "downloads"),
    installs: join(runtimeRoot, "installs"),
    locks: join(runtimeRoot, "locks")
  };
}

function createCurrentRuntime(minecraftVersion: string): CurrentRuntime {
  return {
    minecraftVersion,
    source: "workspace-detect",
    confidence: "high",
    evidenceSources: ["workspace-detect"],
    candidates: [],
    evidence: []
  };
}

function createConfirmation(minecraftVersion: string): SourcePackageConfirmation {
  return {
    packageId: `minecraft-${minecraftVersion}-source-pack-named`,
    namespace: "minecraft",
    minecraftVersion,
    artifactType: "source-pack",
    variant: "named",
    scope: "package-version",
    approvedAt: "2026-04-24T02:00:00Z",
    source: "explicit-user-confirmation"
  };
}
