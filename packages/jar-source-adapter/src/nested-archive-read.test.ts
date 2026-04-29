import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { readNestedArchiveContentFile } from "./nested-archive-read.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("readNestedArchiveContentFile", () => {
  it("reads a selected text file from a one-level JarJar nested archive", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-jarjar-read-"));
    tempRoots.push(runtimeRoot);
    const outerJar = join(runtimeRoot, "outer.jar");
    const nestedJar = createZip([
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "nested_content",
          name: "Nested Content",
          version: "2.0.0"
        }),
        compressionMethod: 0
      },
      {
        name: "data/demo/recipes/nested_gear.json",
        content: "{\"result\":\"demo:nested_gear\"}\n",
        compressionMethod: 0
      }
    ]);

    await writeFile(outerJar, createZip([
      {
        name: "META-INF/jarjar/nested-content.jar",
        content: nestedJar,
        compressionMethod: 8
      }
    ]));

    await expect(
      readNestedArchiveContentFile({
        sourceArchive: outerJar,
        embeddedArchivePath: "META-INF/jarjar/nested-content.jar",
        relativePath: "data/demo/recipes/nested_gear.json",
        maxBytes: 100
      })
    ).resolves.toMatchObject({
      sourceArchive: outerJar,
      embeddedArchivePath: "META-INF/jarjar/nested-content.jar",
      embeddedArchiveMetadata: {
        loader: "fabric",
        modId: "nested_content",
        name: "Nested Content",
        version: "2.0.0"
      },
      entry: {
        domain: "data",
        relativePath: "data/demo/recipes/nested_gear.json"
      },
      content: "{\"result\":\"demo:nested_gear\"}\n"
    });
  });

  it("skips oversized embedded jars before reading their content", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-jarjar-read-"));
    tempRoots.push(runtimeRoot);
    const outerJar = join(runtimeRoot, "outer.jar");

    await writeFile(outerJar, createZip([
      {
        name: "META-INF/jarjar/huge-content.jar",
        content: "not a zip",
        compressionMethod: 0,
        uncompressedSizeOverride: 128
      }
    ]));

    await expect(
      readNestedArchiveContentFile({
        sourceArchive: outerJar,
        embeddedArchivePath: "META-INF/jarjar/huge-content.jar",
        relativePath: "data/demo/recipes/nested_gear.json",
        maxNestedArchiveBytes: 64
      })
    ).resolves.toMatchObject({
      embeddedArchivePath: "META-INF/jarjar/huge-content.jar",
      skipped: {
        relativePath: "META-INF/jarjar/huge-content.jar",
        reason: "too-large"
      }
    });
  });
});

interface ZipFixtureEntry {
  name: string;
  content: string | Buffer;
  compressionMethod: 0 | 8;
  uncompressedSizeOverride?: number;
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
    localHeader.writeUInt32LE(
      entry.uncompressedSizeOverride ?? content.length,
      22
    );
    localHeader.writeUInt16LE(name.length, 26);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(entry.compressionMethod, 10);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(
      entry.uncompressedSizeOverride ?? content.length,
      24
    );
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
