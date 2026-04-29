import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { createArchiveContentCache } from "./archive-content-cache.js";
import { buildModArchiveInventory } from "./mod-archive-inventory.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("buildModArchiveInventory", () => {
  it("summarizes mod archives and one-level JarJar metadata", async () => {
    const workspaceRoot = await createInventoryWorkspace();

    await expect(buildModArchiveInventory({ workspaceRoot })).resolves.toMatchObject({
      archiveCount: 1,
      archives: [
        {
          relativePath: "mods/outer-mod.jar",
          archiveMetadata: {
            loader: "fabric",
            modId: "outer_mod",
            name: "Outer Mod"
          },
          contentSummary: {
            fileCount: 4,
            byDomain: {
              java: 1,
              data: 1,
              assets: 1,
              class: 1
            }
          },
          nestedArchives: [
            {
              embeddedArchivePath: "META-INF/jarjar/nested-content.jar",
              embeddedArchiveMetadata: {
                loader: "fabric",
                modId: "nested_content"
              },
              contentSummary: {
                fileCount: 2,
                byDomain: {
                  data: 1,
                  assets: 1
                }
              }
            }
          ]
        }
      ],
      truncated: false
    });
  });

  it("reports central directory cache hits for repeated inventory reads", async () => {
    const workspaceRoot = await createInventoryWorkspace();
    const cache = createArchiveContentCache();

    await expect(
      buildModArchiveInventory({ workspaceRoot, cache })
    ).resolves.toMatchObject({
      cache: { centralDirectoryHits: 0, centralDirectoryMisses: 1 }
    });
    await expect(
      buildModArchiveInventory({ workspaceRoot, cache })
    ).resolves.toMatchObject({
      cache: { centralDirectoryHits: 1, centralDirectoryMisses: 0 }
    });
  });

  it("marks inventory as truncated when nested JarJar entries are capped", async () => {
    const workspaceRoot = await createInventoryWorkspace({ nestedArchiveCount: 3 });

    await expect(
      buildModArchiveInventory({ workspaceRoot, maxNestedArchives: 1 })
    ).resolves.toMatchObject({
      archives: [
        {
          nestedArchives: [
            { embeddedArchivePath: "META-INF/jarjar/nested-0.jar" }
          ]
        }
      ],
      truncated: true
    });
  });
});

async function createInventoryWorkspace(input: {
  nestedArchiveCount?: number;
} = {}): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-mod-inventory-"));
  const nestedJar = createZip([
    {
      name: "fabric.mod.json",
      content: JSON.stringify({ id: "nested_content", version: "2.0.0" }),
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

  tempRoots.push(workspaceRoot);
  await mkdir(join(workspaceRoot, "mods"), { recursive: true });
  await writeFile(
    join(workspaceRoot, "mods", "outer-mod.jar"),
    createZip([
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "outer_mod",
          name: "Outer Mod",
          version: "1.0.0"
        }),
        compressionMethod: 0
      },
      {
        name: "data/demo/tags/items/gears.json",
        content: "{\"values\":[\"demo:gear\"]}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/lang/en_us.json",
        content: "{\"item.demo.gear\":\"Gear\"}\n",
        compressionMethod: 8
      },
      {
        name: "com/example/OuterMod.java",
        content: "package com.example;\npublic class OuterMod {}\n",
        compressionMethod: 8
      },
      {
        name: "com/example/OuterMod.class",
        content: Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
        compressionMethod: 0
      },
      ...createNestedArchiveEntries(nestedJar, input.nestedArchiveCount ?? 1)
    ])
  );

  return workspaceRoot;
}

function createNestedArchiveEntries(
  nestedJar: Buffer,
  count: number
): ZipFixtureEntry[] {
  if (count === 1) {
    return [{
      name: "META-INF/jarjar/nested-content.jar",
      content: nestedJar,
      compressionMethod: 8
    }];
  }

  return Array.from({ length: count }, (_, index) => ({
    name: `META-INF/jarjar/nested-${index}.jar`,
    content: nestedJar,
    compressionMethod: 8
  }));
}

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
