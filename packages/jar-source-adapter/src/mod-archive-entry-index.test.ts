import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import { queryCachedModArchiveEntries } from "./mod-archive-entry-index.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("queryCachedModArchiveEntries", () => {
  it("reuses a SQLite entry index when archive fingerprints match", async () => {
    const workspaceRoot = await createWorkspace();
    const databasePath = join(workspaceRoot, ".mcpskill", "mod-archives.sqlite");

    const first = await queryCachedModArchiveEntries({
      workspaceRoot,
      databasePath,
      domains: ["data", "assets"]
    });
    const second = await queryCachedModArchiveEntries({
      workspaceRoot,
      databasePath,
      domains: ["data"]
    });

    expect(first).toMatchObject({
      entries: [
        {
          archiveRelativePath: "mods/content-mod.jar",
          relativePath: "assets/demo/lang/en_us.json",
          domain: "assets"
        },
        {
          archiveRelativePath: "mods/content-mod.jar",
          relativePath: "data/demo/recipes/gear.json",
          domain: "data"
        }
      ],
      cache: {
        archiveHits: 0,
        archiveMisses: 1,
        archiveStale: 0
      }
    });
    expect(second).toMatchObject({
      entries: [
        {
          archiveRelativePath: "mods/content-mod.jar",
          relativePath: "data/demo/recipes/gear.json",
          domain: "data"
        }
      ],
      cache: {
        archiveHits: 1,
        archiveMisses: 0,
        archiveStale: 0
      }
    });
  });

  it("rebuilds a stale SQLite entry index when archive fingerprints change", async () => {
    const workspaceRoot = await createWorkspace();
    const databasePath = join(workspaceRoot, ".mcpskill", "mod-archives.sqlite");

    await queryCachedModArchiveEntries({ workspaceRoot, databasePath });
    await writeContentMod(workspaceRoot, [
      {
        name: "data/demo/recipes/plate.json",
        content: "{\"result\":\"demo:plate\"}\n",
        compressionMethod: 0
      }
    ]);

    const rebuilt = await queryCachedModArchiveEntries({
      workspaceRoot,
      databasePath,
      domains: ["data"]
    });

    expect(rebuilt).toMatchObject({
      entryCount: 2,
      entries: [
        {
          relativePath: "data/demo/recipes/gear.json",
          domain: "data"
        },
        {
          relativePath: "data/demo/recipes/plate.json",
          domain: "data"
        }
      ],
      cache: {
        archiveHits: 0,
        archiveMisses: 0,
        archiveStale: 1
      }
    });
  });

  it("classifies selected asset resources without default path dumping", async () => {
    const workspaceRoot = await createWorkspace([
      {
        name: "assets/demo/textures/gui/widgets.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        compressionMethod: 0
      },
      {
        name: "assets/demo/textures/gui/sprites/button/normal.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        compressionMethod: 0
      },
      {
        name: "assets/demo/atlases/gui.json",
        content: "{\"sources\":[]}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/font/ui.json",
        content: "{\"providers\":[]}\n",
        compressionMethod: 0
      }
    ]);
    const databasePath = join(workspaceRoot, ".mcpskill", "mod-archives.sqlite");

    const result = await queryCachedModArchiveEntries({
      workspaceRoot,
      databasePath,
      domains: ["assets"],
      assetKinds: ["gui_texture", "gui_sprite", "atlas", "font"],
      limit: 0
    });

    expect(result).toMatchObject({
      entries: [],
      entryCount: 4,
      assetSummary: {
        uiAssetCount: 4,
        byKind: {
          gui_texture: 1,
          gui_sprite: 1,
          atlas: 1,
          font: 1
        }
      },
      truncated: true
    });
  });

  it("summarizes vanilla asset roots from mod archives without path dumping", async () => {
    const workspaceRoot = await createWorkspace([
      {
        name: "assets/demo/blockstates/gear.json",
        content: "{\"variants\":{\"\":{\"model\":\"demo:block/gear\"}}}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/models/block/gear.json",
        content: "{\"textures\":{\"all\":\"demo:block/gear\"}}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/textures/block/gear.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        compressionMethod: 0
      }
    ]);
    const databasePath = join(workspaceRoot, ".mcpskill", "mod-archives.sqlite");

    const result = await queryCachedModArchiveEntries({
      workspaceRoot,
      databasePath,
      domains: ["assets"],
      limit: 0
    });

    expect(result).toMatchObject({
      entries: [],
      assetSummary: {
        assetEntryCount: 4,
        uiAssetCount: 1,
        byKind: {
          blockstates: 1,
          lang: 1,
          models: 1,
          textures: 1
        }
      },
      truncated: true
    });
  });

  it("summarizes anonymous advanced visual asset evidence from mod archives", async () => {
    const workspaceRoot = await createWorkspace([
      {
        name: "assets/demo/ctm/block/gear.properties",
        content: "matchBlocks=demo:gear\nmethod=ctm\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/models/block/ornate.obj",
        content: "o ornate\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/textures/block_entity/display/core.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        compressionMethod: 0
      },
      {
        name: "assets/demo/textures/gui/sprites/panel/active.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        compressionMethod: 0
      },
      {
        name: "assets/demo/atlases/blocks.json",
        content: "{\"sources\":[]}\n",
        compressionMethod: 0
      }
    ]);
    const databasePath = join(workspaceRoot, ".mcpskill", "mod-archives.sqlite");

    const result = await queryCachedModArchiveEntries({
      workspaceRoot,
      databasePath,
      domains: ["assets"],
      limit: 0
    });

    expect(result).toMatchObject({
      entries: [],
      assetSummary: {
        assetEntryCount: 6,
        uiAssetCount: 3,
        byKind: {
          atlas: 1,
          block_entity_renderer_asset: 1,
          connected_texture_metadata: 1,
          custom_model_format: 1,
          gui_sprite: 1,
          lang: 1
        }
      },
      truncated: true
    });
    expect(JSON.stringify(result.assetSummary)).not.toContain("ctm/block");
    expect(JSON.stringify(result.assetSummary)).not.toContain("ornate.obj");
  });

  it("summarizes datapack data roots from mod archives without path dumping", async () => {
    const workspaceRoot = await createWorkspace([
      {
        name: "data/demo/tags/items/gears.json",
        content: "{\"values\":[\"demo:gear\"]}\n",
        compressionMethod: 0
      },
      {
        name: "data/demo/loot_tables/blocks/gear.json",
        content: "{\"pools\":[]}\n",
        compressionMethod: 0
      },
      {
        name: "data/demo/worldgen/biome/gear_fields.json",
        content: "{\"temperature\":0.8}\n",
        compressionMethod: 0
      }
    ]);
    const databasePath = join(workspaceRoot, ".mcpskill", "mod-archives.sqlite");

    const result = await queryCachedModArchiveEntries({
      workspaceRoot,
      databasePath,
      domains: ["data"],
      limit: 0
    });

    expect(result).toMatchObject({
      entries: [],
      entryCount: 4,
      dataSummary: {
        dataEntryCount: 4,
        registryLikeCount: 4,
        byKind: {
          loot_tables: 1,
          recipes: 1,
          tags: 1,
          worldgen: 1
        }
      },
      truncated: true
    });
  });

  it("filters indexed datapack entries by data kind", async () => {
    const workspaceRoot = await createWorkspace([
      {
        name: "data/demo/loot_tables/blocks/gear.json",
        content: "{\"pools\":[]}\n",
        compressionMethod: 0
      },
      {
        name: "data/demo/tags/items/gears.json",
        content: "{\"values\":[\"demo:gear\"]}\n",
        compressionMethod: 0
      }
    ]);
    const databasePath = join(workspaceRoot, ".mcpskill", "mod-archives.sqlite");

    const result = await queryCachedModArchiveEntries({
      workspaceRoot,
      databasePath,
      domains: ["data"],
      dataKinds: ["recipes"],
      limit: 8
    });

    expect(result).toMatchObject({
      entryCount: 1,
      entries: [
        {
          relativePath: "data/demo/recipes/gear.json",
          domain: "data",
          dataKind: "recipes"
        }
      ],
      dataSummary: {
        dataEntryCount: 1,
        byKind: {
          recipes: 1
        }
      },
      truncated: false
    });
  });
});

async function createWorkspace(
  extraEntries: ZipFixtureEntry[] = []
): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-entry-index-"));
  tempRoots.push(workspaceRoot);
  await mkdir(join(workspaceRoot, "mods"), { recursive: true });
  await writeContentMod(workspaceRoot, extraEntries);
  return workspaceRoot;
}

async function writeContentMod(
  workspaceRoot: string,
  extraEntries: ZipFixtureEntry[] = []
): Promise<void> {
  await writeFile(
    join(workspaceRoot, "mods", "content-mod.jar"),
    createZip([
      {
        name: "fabric.mod.json",
        content: JSON.stringify({ id: "content_mod", version: "1.0.0" }),
        compressionMethod: 0
      },
      {
        name: "data/demo/recipes/gear.json",
        content: "{\"result\":\"demo:gear\"}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/lang/en_us.json",
        content: "{\"item.demo.gear\":\"Gear\"}\n",
        compressionMethod: 8
      },
      ...extraEntries
    ])
  );
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
