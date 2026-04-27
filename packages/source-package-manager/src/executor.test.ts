import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import type { ManagedRuntimeLayout } from "@mcpskill/shared-types";
import { querySourceIndex } from "@mcpskill/source-index";

import { buildLocalSourcePackageRecipeExecutor } from "./executor.js";
import { readSourcePackageManifest } from "./manifest.js";
import {
  buildVanillaSourcePackCopyRecipe,
  buildVanillaSourcePackZipRecipe
} from "./vanilla.js";

describe("buildLocalSourcePackageRecipeExecutor", () => {
  it("copies a materialized source tree into the managed install path and writes a manifest", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-materialized-"));

    await mkdir(join(sourceRoot, "net", "minecraft", "world", "item"), {
      recursive: true
    });
    await writeFile(
      join(sourceRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
      "package net.minecraft.world.item;\npublic class ItemStack {}\n"
    );

    const executor = buildLocalSourcePackageRecipeExecutor();
    const recipe = buildVanillaSourcePackCopyRecipe({
      minecraftVersion: "1.20.1",
      sourceRoot
    });
    const runtimeLayout = createRuntimeLayout(runtimeRoot);

    const result = await executor({
      runtimeLayout,
      recipe
    });

    await expect(
      readFile(
        join(result.installPath, "net", "minecraft", "world", "item", "ItemStack.java"),
        "utf-8"
      )
    ).resolves.toContain("public class ItemStack");
    await expect(readSourcePackageManifest(result.installPath)).resolves.toMatchObject({
      packageId: "minecraft-1.20.1-source-pack-named",
      provenance: "materialized-local-copy",
      stepKinds: ["copy_tree", "build_source_index", "write_package_manifest"],
      fileCount: 1
    });
    expect(
      querySourceIndex({
        databasePath: join(result.installPath, "source-index.sqlite"),
        symbol: "ItemStack",
        limit: 5
      }).matches
    ).toMatchObject([
      {
        path: "net/minecraft/world/item/ItemStack.java",
        qualifiedName: "net.minecraft.world.item.ItemStack"
      }
    ]);
    await expect(readSourcePackageManifest(result.installPath)).resolves.not.toHaveProperty(
      "steps"
    );
    expect(result.fileCount).toBe(1);
    expect(result.sourceIndex?.javaSymbolCount).toBe(1);
  });

  it("installs a vanilla source pack from a Java sources ZIP recipe", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const sourceZip = await createStoredSourceZip(runtimeRoot);
    const executor = buildLocalSourcePackageRecipeExecutor();
    const recipe = buildVanillaSourcePackZipRecipe({
      minecraftVersion: "1.20.1",
      sourceZip
    });

    const result = await executor({
      runtimeLayout: createRuntimeLayout(runtimeRoot),
      recipe
    });

    await expect(
      readFile(
        join(result.installPath, "net", "minecraft", "world", "item", "ItemStack.java"),
        "utf-8"
      )
    ).resolves.toContain("public class ItemStack");
    await expect(readSourcePackageManifest(result.installPath)).resolves.toMatchObject({
      packageId: "minecraft-1.20.1-source-pack-named",
      provenance: "java-sources-zip",
      stepKinds: [
        "extract_java_sources_zip",
        "build_source_index",
        "write_package_manifest"
      ],
      fileCount: 1
    });
    expect(
      querySourceIndex({
        databasePath: join(result.installPath, "source-index.sqlite"),
        text: "ItemStack",
        limit: 5
      }).matches[0]
    ).toMatchObject({
      path: "net/minecraft/world/item/ItemStack.java"
    });
  });
});

function createRuntimeLayout(runtimeRoot: string): ManagedRuntimeLayout {
  return {
    root: runtimeRoot,
    downloads: join(runtimeRoot, "downloads"),
    installs: join(runtimeRoot, "installs"),
    locks: join(runtimeRoot, "locks")
  };
}

async function createStoredSourceZip(runtimeRoot: string): Promise<string> {
  const sourceZip = join(runtimeRoot, "minecraft-sources.jar");
  const name = Buffer.from("net/minecraft/world/item/ItemStack.java");
  const content = Buffer.from(
    "package net.minecraft.world.item;\npublic class ItemStack {}\n"
  );
  const localHeader = Buffer.alloc(30);
  const centralHeader = Buffer.alloc(46);
  const eocd = Buffer.alloc(22);

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

  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralHeader.length + name.length, 12);
  eocd.writeUInt32LE(localHeader.length + name.length + content.length, 16);

  await writeFile(
    sourceZip,
    Buffer.concat([localHeader, name, content, centralHeader, name, eocd])
  );

  return sourceZip;
}
