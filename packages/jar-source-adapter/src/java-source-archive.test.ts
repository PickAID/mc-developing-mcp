import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { extractJavaSourcesArchive } from "./java-source-archive.js";

describe("extractJavaSourcesArchive", () => {
  it("extracts Java sources from stored and deflated JAR entries only", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-zip-"));
    const sourceArchive = join(runtimeRoot, "minecraft-sources.jar");
    const targetRoot = join(runtimeRoot, "install");

    await writeFile(
      sourceArchive,
      createZip([
        {
          name: "net/minecraft/world/item/ItemStack.java",
          content: "package net.minecraft.world.item;\npublic class ItemStack {}\n",
          compressionMethod: 8
        },
        {
          name: "assets/minecraft/lang/en_us.json",
          content: "{}\n",
          compressionMethod: 0
        },
        {
          name: "../escape.java",
          content: "public class Escape {}\n",
          compressionMethod: 0
        }
      ])
    );

    await expect(
      extractJavaSourcesArchive({
        sourceArchive,
        targetRoot
      })
    ).resolves.toEqual({
      fileCount: 1
    });
    await expect(
      readFile(
        join(targetRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
        "utf-8"
      )
    ).resolves.toContain("public class ItemStack");
    await expect(readFile(join(targetRoot, "escape.java"), "utf-8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });
});

interface ZipFixtureEntry {
  name: string;
  content: string;
  compressionMethod: 0 | 8;
}

function createZip(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.from(entry.content);
    const compressed =
      entry.compressionMethod === 8 ? deflateRawSync(content) : content;
    const localHeader = Buffer.alloc(30);
    const centralHeader = Buffer.alloc(46);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(entry.compressionMethod, 8);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(entry.compressionMethod, 10);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);

    localParts.push(localHeader, name, compressed);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + compressed.length;
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
