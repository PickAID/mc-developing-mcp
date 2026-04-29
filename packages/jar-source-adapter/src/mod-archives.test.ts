import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { readModArchiveMetadata } from "./mod-archives.js";

describe("readModArchiveMetadata", () => {
  it("reads Fabric and NeoForge mod descriptors from jar metadata", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mod-meta-"));
    const fabricJar = join(runtimeRoot, "fabric-content.jar");
    const neoForgeJar = join(runtimeRoot, "neoforge-content.jar");

    await writeFile(
      fabricJar,
      createZip([
        {
          name: "fabric.mod.json",
          content: JSON.stringify({
            id: "fabric_content",
            name: "Fabric Content",
            version: "1.2.3"
          }),
          compressionMethod: 8
        }
      ])
    );
    await writeFile(
      neoForgeJar,
      createZip([
        {
          name: "META-INF/neoforge.mods.toml",
          content: [
            'modLoader="javafml"',
            "[[mods]]",
            'modId="neoforge_content"',
            'version="4.5.6"',
            'displayName="NeoForge Content"',
            ""
          ].join("\n"),
          compressionMethod: 0
        }
      ])
    );

    await expect(readModArchiveMetadata(fabricJar)).resolves.toEqual({
      loader: "fabric",
      modId: "fabric_content",
      name: "Fabric Content",
      version: "1.2.3",
      metadataPath: "fabric.mod.json"
    });
    await expect(readModArchiveMetadata(neoForgeJar)).resolves.toEqual({
      loader: "neoforge",
      modId: "neoforge_content",
      name: "NeoForge Content",
      version: "4.5.6",
      metadataPath: "META-INF/neoforge.mods.toml"
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
