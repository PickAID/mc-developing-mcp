import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  buildSourceIndex,
  querySourceIndex,
  readIndexedSourceChunk,
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
      javaMemberCount: 1,
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

  it("does not count a terminating newline as an extra indexed source line", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-index-lines-"));
    const javaPath = join(sourceRoot, "demo", "TrailingNewline.java");
    const databasePath = join(sourceRoot, "source-index.sqlite");

    await mkdir(join(javaPath, ".."), { recursive: true });
    await writeFile(javaPath, "class TrailingNewline {}\n");
    await buildSourceIndex({ sourceRoot, databasePath, packageId: "demo" });

    await expect(
      readIndexedSourceFile({
        sourceRoot,
        databasePath,
        path: "demo/TrailingNewline.java"
      })
    ).resolves.toMatchObject({
      startLine: 1,
      endLine: 1,
      totalLines: 1,
      content: "class TrailingNewline {}"
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

  it("reads indexed chunk content without requiring source files on disk", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-index-read-chunk-"));
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
        "  }",
        "}"
      ].join("\n")
    );
    await buildSourceIndex({ sourceRoot, databasePath, packageId: "demo" });

    const match = querySourceIndex({
      databasePath,
      text: "RenderSystem enableBlend",
      limit: 1
    }).matches[0];

    await writeFile(javaPath, "");

    expect(readIndexedSourceChunk({ databasePath, match })).toMatchObject({
      path: "demo/ScreenRenderer.java",
      chunkId: "lines-1-6",
      startLine: 1,
      endLine: 6,
      content: expect.stringContaining("RenderSystem.enableBlend")
    });
  });

  it("indexes Java members and filters member matches by owner", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-index-members-"));
    const itemPath = join(sourceRoot, "demo", "ItemStack.java");
    const blockPath = join(sourceRoot, "demo", "BlockStack.java");
    const databasePath = join(sourceRoot, "source-index.sqlite");

    await mkdir(join(itemPath, ".."), { recursive: true });
    await writeFile(
      itemPath,
      [
        "package demo;",
        "public class ItemStack {",
        "  private int count;",
        "  public ItemStack(int count) { this.count = count; }",
        "  public int getCount() { return count; }",
        "}"
      ].join("\n")
    );
    await writeFile(
      blockPath,
      [
        "package demo;",
        "public class BlockStack {",
        "  public int getCount() { return 64; }",
        "}"
      ].join("\n")
    );

    const result = await buildSourceIndex({
      sourceRoot,
      databasePath,
      packageId: "demo"
    });

    expect(result.javaMemberCount).toBe(4);

    expect(
      querySourceIndex({
        databasePath,
        member: "getCount",
        limit: 5
      }).matches
    ).toMatchObject([
      {
        path: "demo/BlockStack.java",
        ownerQualifiedName: "demo.BlockStack",
        memberName: "getCount",
        memberKind: "method",
        returnType: "int"
      },
      {
        path: "demo/ItemStack.java",
        ownerQualifiedName: "demo.ItemStack",
        memberName: "getCount",
        memberKind: "method",
        returnType: "int"
      }
    ]);

    expect(
      querySourceIndex({
        databasePath,
        member: "getCount",
        memberKind: "method",
        owner: "demo.ItemStack",
        limit: 5
      }).matches
    ).toMatchObject([
      {
        path: "demo/ItemStack.java",
        ownerSimpleName: "ItemStack",
        ownerQualifiedName: "demo.ItemStack",
        memberName: "getCount",
        memberKind: "method",
        signature: "getCount()"
      }
    ]);

    expect(
      querySourceIndex({
        databasePath,
        member: "count",
        memberKind: "field",
        owner: "ItemStack",
        limit: 5
      }).matches
    ).toMatchObject([
      {
        path: "demo/ItemStack.java",
        ownerQualifiedName: "demo.ItemStack",
        memberName: "count",
        memberKind: "field",
        returnType: "int"
      }
    ]);

    expect(
      querySourceIndex({
        databasePath,
        member: "count",
        memberKind: "method",
        owner: "ItemStack",
        limit: 5
      }).matches
    ).toEqual([]);
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
