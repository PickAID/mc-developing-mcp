import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  discoverDatapackContent,
  listDatapackFiles,
  readDatapackFile,
  searchDatapackFiles
} from "./index.js";

const tempRoots: string[] = [];

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `${prefix}-`));
  tempRoots.push(root);
  return root;
}

async function writeFixture(root: string, relativePath: string, content: string | Buffer): Promise<void> {
  const absolutePath = join(root, relativePath);

  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content);
}

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("datapack-adapter", () => {
  it("discovers pack roots, data namespaces, data kinds, asset namespaces, and asset kinds", async () => {
    const root = await createTempRoot("datapack-discover");

    await writeFixture(root, "pack.mcmeta", JSON.stringify({ pack: { pack_format: 15 } }));
    await writeFixture(root, "data/demo/recipes/a.json", "{}\n");
    await writeFixture(root, "data/demo/tags/items/x.json", "{}\n");
    await writeFixture(root, "assets/demo/lang/en_us.json", "{}\n");

    const discovered = await discoverDatapackContent(root);

    expect(discovered.roots).toEqual([
      {
        absolutePath: root,
        hasPackMcmeta: true,
        hasData: true,
        hasAssets: true
      }
    ]);
    expect(discovered.namespaces).toEqual(["demo"]);
    expect(discovered.dataKinds).toEqual(["recipes", "tags"]);
    expect(discovered.assetKinds).toEqual(["lang"]);
  });

  it("discovers resource roots that contain data and assets without pack.mcmeta", async () => {
    const root = await createTempRoot("resource-root");
    const resourcesRoot = join(root, "src", "main", "resources");

    await writeFixture(root, "src/main/resources/data/demo/functions/start.mcfunction", "say hi\n");
    await writeFixture(root, "src/main/resources/assets/demo/models/item/tool.json", "{}\n");

    const discovered = await discoverDatapackContent(root);

    expect(discovered.roots).toEqual([
      {
        absolutePath: resourcesRoot,
        hasPackMcmeta: false,
        hasData: true,
        hasAssets: true
      }
    ]);
    expect(discovered.namespaces).toEqual(["demo"]);
    expect(discovered.dataKinds).toEqual(["functions"]);
    expect(discovered.assetKinds).toEqual(["models"]);
  });

  it("lists structured data and asset files with budget limits", async () => {
    const root = await createTempRoot("datapack-list");

    await writeFixture(root, "pack.mcmeta", "{}\n");
    await writeFixture(root, "data/demo/recipes/a.json", "{}\n");
    await writeFixture(root, "data/demo/tags/items/x.json", "{}\n");
    await writeFixture(root, "assets/demo/lang/en_us.json", "{}\n");

    const files = await listDatapackFiles(root, { limit: 2 });

    expect(files.entries).toEqual([
      expect.objectContaining({
        relativePath: "assets/demo/lang/en_us.json",
        namespace: "demo",
        kind: "lang",
        domain: "assets",
        sizeBytes: 3
      }),
      expect.objectContaining({
        relativePath: "data/demo/recipes/a.json",
        namespace: "demo",
        kind: "recipes",
        domain: "data",
        sizeBytes: 3
      })
    ]);
    expect(files.entries.every((entry) => entry.absolutePath.startsWith(root))).toBe(true);
    expect(files.truncated).toBe(true);
    expect(files.skipped).toEqual([]);
  });

  it("searches text files while skipping binary and oversized content", async () => {
    const root = await createTempRoot("datapack-search");

    await writeFixture(root, "data/demo/recipes/a.json", '{ "type": "minecraft:crafting_shaped" }\n');
    await writeFixture(root, "data/demo/recipes/large.json", "minecraft:crafting_shaped\n");
    await writeFixture(root, "assets/demo/lang/en_us.json", '{ "item.demo.tool": "Tool" }\n');
    await writeFixture(root, "assets/demo/textures/item/tool.png", Buffer.from([0, 1, 2, 3, 0]));

    const matches = await searchDatapackFiles(root, "crafting", {
      maxBytesPerFile: 10
    });

    expect(matches.matches).toEqual([]);
    expect(matches.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: "assets/demo/textures/item/tool.png",
          reason: "binary"
        }),
        expect.objectContaining({
          relativePath: "data/demo/recipes/a.json",
          reason: "too-large"
        }),
        expect.objectContaining({
          relativePath: "data/demo/recipes/large.json",
          reason: "too-large"
        })
      ])
    );
  });

  it("reads text files within budget and rejects binary or oversized reads", async () => {
    const root = await createTempRoot("datapack-read");

    await writeFixture(root, "assets/demo/lang/en_us.json", '{ "item.demo.tool": "Tool" }\n');
    await writeFixture(root, "assets/demo/textures/item/tool.png", Buffer.from([0, 1, 2, 3, 0]));

    await expect(
      readDatapackFile(root, "assets/demo/lang/en_us.json", { maxBytesPerFile: 100 })
    ).resolves.toMatchObject({
      file: expect.objectContaining({
        relativePath: "assets/demo/lang/en_us.json",
        namespace: "demo",
        kind: "lang",
        domain: "assets"
      }),
      content: '{ "item.demo.tool": "Tool" }\n'
    });
    await expect(
      readDatapackFile(root, "assets/demo/lang/en_us.json", { maxBytesPerFile: 5 })
    ).resolves.toMatchObject({
      skipped: expect.objectContaining({
        reason: "too-large"
      })
    });
    await expect(
      readDatapackFile(root, "assets/demo/textures/item/tool.png", { maxBytesPerFile: 100 })
    ).resolves.toMatchObject({
      skipped: expect.objectContaining({
        reason: "binary"
      })
    });
  });

  it("reads files from discovered nested resource roots by listed relative path", async () => {
    const root = await createTempRoot("datapack-nested-read");

    await writeFixture(
      root,
      "src/main/resources/assets/demo/lang/en_us.json",
      '{ "item.demo.nested": "Nested" }\n'
    );
    await expect(
      readDatapackFile(root, "assets/demo/lang/en_us.json", { maxBytesPerFile: 100 })
    ).resolves.toMatchObject({
      content: '{ "item.demo.nested": "Nested" }\n'
    });
  });
});
