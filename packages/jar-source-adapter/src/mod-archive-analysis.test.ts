import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { analyzeModArchiveBeforeDecompile } from "./mod-archive-analysis.js";

describe("analyzeModArchiveBeforeDecompile", () => {
  it("summarizes mixin, access, service, class, data, and asset evidence", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-archive-analysis-"));
    const archivePath = join(runtimeRoot, "content-mod.jar");

    await writeFile(
      archivePath,
      createZip([
        { name: "fabric.mod.json", content: "{}", compressionMethod: 0 },
        { name: "META-INF/mods.toml", content: "", compressionMethod: 0 },
        { name: "demo.mixins.json", content: "{}", compressionMethod: 0 },
        { name: "demo.accesswidener", content: "accessWidener v2 named", compressionMethod: 0 },
        { name: "META-INF/services/demo.Service", content: "demo.Impl", compressionMethod: 0 },
        { name: "assets/demo/models/block/gear.json", content: "{}", compressionMethod: 0 },
        { name: "data/demo/recipes/gear.json", content: "{}", compressionMethod: 0 },
        { name: "demo/Client.class", content: Buffer.from([0xca, 0xfe]), compressionMethod: 8 }
      ])
    );

    await expect(
      analyzeModArchiveBeforeDecompile({ sourceArchive: archivePath })
    ).resolves.toMatchObject({
      sourceArchive: archivePath,
      tokenPolicy: "compact_mod_archive_pre_decompile_analysis",
      mixinConfigCount: 1,
      accessWidenerCount: 1,
      serviceProviderCount: 1,
      classFileCount: 1,
      assetFileCount: 1,
      dataFileCount: 1,
      needsSourceDecompileReasons: expect.arrayContaining([
        "class_files_present",
        "mixin_configs_present",
        "access_wideners_present",
        "service_providers_present"
      ])
    });
  });
});

interface ZipFixtureEntry {
  name: string;
  content: string | Buffer;
  compressionMethod: 0 | 8;
}

function createZip(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content);
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
