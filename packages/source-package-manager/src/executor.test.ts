import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import type { ManagedRuntimeLayout } from "@mcpskill/shared-types";
import { querySourceIndex } from "@mcpskill/source-index";

import { buildLocalSourcePackageRecipeExecutor } from "./executor.js";
import { readSourcePackageManifest } from "./manifest.js";
import {
  buildVanillaAssetsArchiveRecipe,
  buildVanillaDataPackArchiveRecipe,
  buildVanillaResourcePackArchiveRecipe,
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

  it("generates a vanilla datapack package from official jar data entries only", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-datapack-package-"));
    const serverJar = join(runtimeRoot, "minecraft-server.jar");
    const executor = buildLocalSourcePackageRecipeExecutor();
    const recipe = buildVanillaDataPackArchiveRecipe({
      minecraftVersion: "26.1.2",
      sourceArchive: serverJar
    });

    await writeFile(
      serverJar,
      createZip([
        {
          name: "data/minecraft/recipe/stone.json",
          content: "{\"type\":\"minecraft:crafting_shapeless\"}\n"
        },
        {
          name: "assets/minecraft/lang/en_us.json",
          content: "{\"item.minecraft.stone\":\"Stone\"}\n"
        },
        {
          name: "net/minecraft/server/Main.class",
          content: "\u0000class"
        }
      ])
    );

    const result = await executor({
      runtimeLayout: createRuntimeLayout(runtimeRoot),
      recipe
    });

    await expect(
      readFile(
        join(result.installPath, "data", "minecraft", "recipe", "stone.json"),
        "utf-8"
      )
    ).resolves.toContain("crafting_shapeless");
    await expect(
      readFile(join(result.installPath, "assets", "minecraft", "lang", "en_us.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readSourcePackageManifest(result.installPath)).resolves.toMatchObject({
      packageId: "minecraft-26.1.2-vanilla-datapack-official",
      artifactType: "datapack",
      variant: "official",
      provenance: "mojang-official-archive",
      stepKinds: ["extract_archive_content", "write_package_manifest"],
      fileCount: 1
    });
    expect(result.fileCount).toBe(1);
  });

  it("generates a vanilla assets package from official client jar assets entries only", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-assets-package-"));
    const clientJar = join(runtimeRoot, "minecraft-client.jar");
    const executor = buildLocalSourcePackageRecipeExecutor();
    const recipe = buildVanillaAssetsArchiveRecipe({
      minecraftVersion: "26.1.2",
      sourceArchive: clientJar
    });

    await writeFile(
      clientJar,
      createZip([
        {
          name: "assets/minecraft/models/item/stone.json",
          content: "{\"parent\":\"minecraft:item/generated\"}\n"
        },
        {
          name: "data/minecraft/recipe/stone.json",
          content: "{\"type\":\"minecraft:crafting_shapeless\"}\n"
        },
        {
          name: "net/minecraft/client/Minecraft.class",
          content: "\u0000class"
        }
      ])
    );

    const result = await executor({
      runtimeLayout: createRuntimeLayout(runtimeRoot),
      recipe
    });

    await expect(
      readFile(
        join(result.installPath, "assets", "minecraft", "models", "item", "stone.json"),
        "utf-8"
      )
    ).resolves.toContain("minecraft:item/generated");
    await expect(
      readFile(join(result.installPath, "data", "minecraft", "recipe", "stone.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readSourcePackageManifest(result.installPath)).resolves.toMatchObject({
      packageId: "minecraft-26.1.2-vanilla-assets-official",
      artifactType: "assets",
      variant: "official",
      provenance: "mojang-official-archive",
      stepKinds: ["extract_archive_content", "write_package_manifest"],
      fileCount: 1
    });
    expect(result.fileCount).toBe(1);
  });

  it("generates a vanilla resource-pack package from official client jar assets entries only", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-resource-pack-package-"));
    const clientJar = join(runtimeRoot, "minecraft-client.jar");
    const executor = buildLocalSourcePackageRecipeExecutor();
    const recipe = buildVanillaResourcePackArchiveRecipe({
      minecraftVersion: "26.1.2",
      sourceArchive: clientJar
    });

    await writeFile(
      clientJar,
      createZip([
        {
          name: "assets/minecraft/models/item/stone.json",
          content: "{\"parent\":\"minecraft:item/generated\"}\n"
        },
        {
          name: "data/minecraft/recipe/stone.json",
          content: "{\"type\":\"minecraft:crafting_shapeless\"}\n"
        }
      ])
    );

    const result = await executor({
      runtimeLayout: createRuntimeLayout(runtimeRoot),
      recipe
    });

    await expect(
      readFile(
        join(result.installPath, "assets", "minecraft", "models", "item", "stone.json"),
        "utf-8"
      )
    ).resolves.toContain("minecraft:item/generated");
    await expect(readSourcePackageManifest(result.installPath)).resolves.toMatchObject({
      packageId: "minecraft-26.1.2-vanilla-resource-pack-official",
      artifactType: "resource-pack",
      variant: "official",
      provenance: "mojang-official-archive",
      stepKinds: ["extract_archive_content", "write_package_manifest"],
      fileCount: 1
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
  await writeFile(
    sourceZip,
    createZip([
      {
        name: "net/minecraft/world/item/ItemStack.java",
        content: "package net.minecraft.world.item;\npublic class ItemStack {}\n"
      }
    ])
  );

  return sourceZip;
}

interface ZipFixtureEntry {
  name: string;
  content: string;
}

function createZip(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

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
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, name, content);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + content.length;
  }

  const eocd = Buffer.alloc(22);

  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(
    centralParts.reduce((total, part) => total + part.length, 0),
    12
  );
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}
