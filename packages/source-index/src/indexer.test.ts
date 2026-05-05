import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  buildSourceIndex,
  querySourceIndex,
  readIndexedSourceFile
} from "./indexer.js";

describe("buildSourceIndex", () => {
  it("builds a SQLite source index with file metadata, FTS text, and Java symbols", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-index-"));
    const javaPath = join(
      sourceRoot,
      "net",
      "minecraft",
      "world",
      "item",
      "ItemStack.java"
    );
    const recipePath = join(sourceRoot, "data", "demo", "recipes", "stone.json");
    const databasePath = join(sourceRoot, "source-index.sqlite");

    await mkdir(join(javaPath, ".."), { recursive: true });
    await mkdir(join(recipePath, ".."), { recursive: true });
    await writeFile(
      javaPath,
      [
        "package net.minecraft.world.item;",
        "public class ItemStack {",
        "  public boolean isEmpty() { return false; }",
        "}"
      ].join("\n")
    );
    await writeFile(
      recipePath,
      JSON.stringify({ result: "minecraft:stone", category: "building" })
    );

    const result = await buildSourceIndex({
      sourceRoot,
      databasePath,
      packageId: "minecraft-1.20.1-source-pack-named"
    });

    expect(result).toMatchObject({
      databasePath,
      fileCount: 2,
      javaSymbolCount: 1,
      indexedTextFileCount: 2
    });
    await expect(readFile(databasePath)).resolves.toBeInstanceOf(Buffer);

    expect(
      querySourceIndex({
        databasePath,
        symbol: "ItemStack",
        limit: 5
      }).matches
    ).toMatchObject([
      {
        path: "net/minecraft/world/item/ItemStack.java",
        kind: "java",
        qualifiedName: "net.minecraft.world.item.ItemStack"
      }
    ]);

    expect(
      querySourceIndex({
        databasePath,
        text: "minecraft:stone",
        limit: 5
      }).matches
    ).toMatchObject([
      {
        path: "data/demo/recipes/stone.json",
        kind: "json"
      }
    ]);

    expect(
      await readIndexedSourceFile({
        sourceRoot,
        databasePath,
        path: "net/minecraft/world/item/ItemStack.java",
        startLine: 2,
        maxLines: 1
      })
    ).toMatchObject({
      path: "net/minecraft/world/item/ItemStack.java",
      startLine: 2,
      endLine: 2,
      content: "public class ItemStack {"
    });
  });

  it("applies file count and file size budgets before reading source content", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-index-budget-"));
    const databasePath = join(sourceRoot, "source-index.sqlite");

    await writeFile(join(sourceRoot, "A.java"), "public class A {}\n");
    await writeFile(join(sourceRoot, "B.java"), "public class B {}\n");
    await writeFile(join(sourceRoot, "large.json"), "x".repeat(128));

    const result = await buildSourceIndex({
      sourceRoot,
      databasePath,
      packageId: "budgeted",
      maxFiles: 2,
      maxBytesPerFile: 32
    });

    expect(result.fileCount).toBe(2);
    expect(result.skippedFileCount).toBe(1);
    expect(
      querySourceIndex({
        databasePath,
        text: "public",
        limit: 10
      }).matches
    ).toHaveLength(2);
  });

  it("indexes bounded chunks with line ranges and match reasons", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-index-chunks-"));
    const javaPath = join(sourceRoot, "demo", "ScreenRenderer.java");
    const databasePath = join(sourceRoot, "source-index.sqlite");

    await mkdir(join(javaPath, ".."), { recursive: true });
    await writeFile(
      javaPath,
      [
        "package demo;",
        "public class ScreenRenderer {",
        "  void render() {",
        "    RenderSystem.enableBlend();",
        "    GuiGraphics graphics;",
        "  }",
        "}"
      ].join("\n")
    );

    await buildSourceIndex({
      sourceRoot,
      databasePath,
      packageId: "demo-source-pack"
    });

    expect(
      querySourceIndex({
        databasePath,
        text: "RenderSystem enableBlend",
        limit: 5
      }).matches
    ).toEqual([
      expect.objectContaining({
        path: "demo/ScreenRenderer.java",
        startLine: expect.any(Number),
        endLine: expect.any(Number),
        matchReasons: expect.arrayContaining(["fts_chunk", "term:RenderSystem"])
      })
    ]);
  });

  it("falls back to bounded LIKE search for punctuation-heavy queries", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-index-fallback-"));
    const javaPath = join(sourceRoot, "demo", "Renderer.java");
    const databasePath = join(sourceRoot, "source-index.sqlite");

    await mkdir(join(javaPath, ".."), { recursive: true });
    await writeFile(
      javaPath,
      "class Renderer { void draw() { RenderSystem.enableBlend(); } }\n"
    );
    await buildSourceIndex({ sourceRoot, databasePath, packageId: "demo" });

    expect(
      querySourceIndex({
        databasePath,
        text: "RenderSystem.enableBlend()?? missingTerm",
        limit: 5
      }).matches[0]
    ).toMatchObject({
      path: "demo/Renderer.java",
      matchReasons: expect.arrayContaining(["like_fallback"])
    });
  });
});
