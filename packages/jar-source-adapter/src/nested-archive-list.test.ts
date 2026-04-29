import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { listNestedArchiveContent } from "./nested-archive-list.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("listNestedArchiveContent", () => {
  it("lists selected domains from a one-level JarJar nested archive", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-jarjar-list-"));
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
      },
      {
        name: "assets/demo/lang/en_us.json",
        content: "{\"item.demo.nested_gear\":\"Nested Gear\"}\n",
        compressionMethod: 8
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
      listNestedArchiveContent({
        sourceArchive: outerJar,
        embeddedArchivePath: "META-INF/jarjar/nested-content.jar",
        domains: ["data"],
        limit: 8
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
      entries: [
        {
          domain: "data",
          relativePath: "data/demo/recipes/nested_gear.json"
        }
      ],
      truncated: false
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
