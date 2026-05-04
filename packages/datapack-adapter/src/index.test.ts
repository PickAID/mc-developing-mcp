import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  discoverDatapackContent,
  listDatapackFiles,
  readDatapackFile,
  searchDatapackFiles,
  summarizeDatapackFiles,
  traceDatapackResourceReferences
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
        rootKind: "mixed_pack_root",
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
        rootKind: "mixed_pack_root",
        hasPackMcmeta: false,
        hasData: true,
        hasAssets: true
      }
    ]);
    expect(discovered.namespaces).toEqual(["demo"]);
    expect(discovered.dataKinds).toEqual(["functions"]);
    expect(discovered.assetKinds).toEqual(["models"]);
  });

  it("classifies vanilla asset format roots with resource-level granularity", async () => {
    const root = await createTempRoot("vanilla-asset-kinds");

    await writeFixture(root, "pack.mcmeta", JSON.stringify({ pack: { pack_format: 65 } }));
    await writeFixture(root, "assets/demo/atlases/blocks.json", "{}\n");
    await writeFixture(root, "assets/demo/blockstates/gear.json", "{}\n");
    await writeFixture(root, "assets/demo/equipment/chainmail.json", "{}\n");
    await writeFixture(root, "assets/demo/font/default.json", "{}\n");
    await writeFixture(root, "assets/demo/items/gear.json", "{}\n");
    await writeFixture(root, "assets/demo/lang/en_us.json", "{}\n");
    await writeFixture(root, "assets/demo/models/item/gear.json", "{}\n");
    await writeFixture(root, "assets/demo/particles/spark.json", "{}\n");
    await writeFixture(root, "assets/demo/post_effect/blur.json", "{}\n");
    await writeFixture(root, "assets/demo/shaders/core/demo.vsh", "void main() {}\n");
    await writeFixture(root, "assets/demo/sounds.json", "{}\n");
    await writeFixture(root, "assets/demo/texts/splashes.txt", "hello\n");
    await writeFixture(root, "assets/demo/textures/item/gear.png", Buffer.from([1, 2, 3]));
    await writeFixture(root, "assets/demo/waypoint_style/default.json", "{}\n");
    await writeFixture(root, "assets/demo/custom_format/example.json", "{}\n");

    const discovered = await discoverDatapackContent(root);
    const files = await listDatapackFiles(root);

    expect(discovered.assetKinds).toEqual([
      "atlases",
      "blockstates",
      "equipment",
      "font",
      "items",
      "lang",
      "models",
      "other",
      "particles",
      "post_effect",
      "shaders",
      "sounds",
      "texts",
      "textures",
      "waypoint_style"
    ]);
    expect(files.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: "pack.mcmeta",
          domain: "assets",
          kind: "pack_metadata"
        }),
        expect.objectContaining({
          relativePath: "assets/demo/items/gear.json",
          kind: "items"
        }),
        expect.objectContaining({
          relativePath: "assets/demo/post_effect/blur.json",
          kind: "post_effect"
        }),
        expect.objectContaining({
          relativePath: "assets/demo/waypoint_style/default.json",
          kind: "waypoint_style"
        }),
        expect.objectContaining({
          relativePath: "assets/demo/custom_format/example.json",
          kind: "other"
        })
      ])
    );
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

  it("summarizes data and resource evidence without path lists", async () => {
    const root = await createTempRoot("datapack-summary");

    await writeFixture(root, "pack.mcmeta", "{}\n");
    await writeFixture(root, "data/demo/recipes/a.json", "{}\n");
    await writeFixture(root, "data/demo/tags/items/x.json", "{}\n");
    await writeFixture(root, "assets/demo/items/gear.json", "{}\n");
    await writeFixture(root, "assets/demo/models/item/gear.json", "{}\n");
    await writeFixture(root, "assets/demo/textures/item/gear.png", Buffer.from([1, 2, 3]));

    const summary = await summarizeDatapackFiles(root);

    expect(summary).toEqual({
      rootCount: 1,
      entryCount: 6,
      byDomain: {
        assets: 4,
        data: 2
      },
      byRootKind: {
        mixed_pack_root: 1
      },
      byKind: {
        items: 1,
        models: 1,
        pack_metadata: 1,
        recipes: 1,
        tags: 1,
        textures: 1
      },
      byNamespace: {
        "": 1,
        demo: 5
      },
      skipped: [],
      truncated: false
    });
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

  it("traces blockstate model and model texture references without reading binary content", async () => {
    const root = await createTempRoot("datapack-resource-trace");

    await writeFixture(
      root,
      "assets/demo/blockstates/gear.json",
      JSON.stringify({ variants: { "": { model: "demo:block/gear" } } })
    );
    await writeFixture(
      root,
      "assets/demo/models/block/gear.json",
      JSON.stringify({
        textures: {
          all: "demo:block/gear",
          particle: "demo:block/missing"
        }
      })
    );
    await writeFixture(root, "assets/demo/textures/block/gear.png", Buffer.from([1, 2, 3]));

    const trace = await traceDatapackResourceReferences(root, {
      paths: ["assets/demo/blockstates/gear.json"]
    });

    expect(trace).toMatchObject({
      startPaths: ["assets/demo/blockstates/gear.json"],
      references: [
        {
          fromPath: "assets/demo/blockstates/gear.json",
          fromKind: "blockstates",
          relation: "blockstate_model",
          value: "demo:block/gear",
          toPath: "assets/demo/models/block/gear.json",
          toKind: "models",
          status: "resolved"
        },
        {
          fromPath: "assets/demo/models/block/gear.json",
          fromKind: "models",
          relation: "model_texture",
          value: "demo:block/gear",
          toPath: "assets/demo/textures/block/gear.png",
          toKind: "textures",
          status: "resolved"
        },
        {
          fromPath: "assets/demo/models/block/gear.json",
          fromKind: "models",
          relation: "model_texture",
          value: "demo:block/missing",
          toPath: "assets/demo/textures/block/missing.png",
          toKind: "textures",
          status: "missing"
        }
      ],
      unresolved: [
        {
          toPath: "assets/demo/textures/block/missing.png",
          status: "missing"
        }
      ],
      skipped: [],
      truncated: false
    });
  });

  it("traces item definition models and model textures", async () => {
    const root = await createTempRoot("resource-item-trace");

    await writeFixture(
      root,
      "assets/demo/items/gear.json",
      JSON.stringify({
        model: {
          type: "minecraft:model",
          model: "demo:item/gear"
        }
      })
    );
    await writeFixture(
      root,
      "assets/demo/models/item/gear.json",
      JSON.stringify({
        textures: {
          layer0: "demo:item/gear"
        }
      })
    );
    await writeFixture(root, "assets/demo/textures/item/gear.png", Buffer.from([1, 2, 3]));

    await expect(
      traceDatapackResourceReferences(root, {
        paths: ["assets/demo/items/gear.json"]
      })
    ).resolves.toMatchObject({
      startPaths: ["assets/demo/items/gear.json"],
      references: [
        {
          fromPath: "assets/demo/items/gear.json",
          fromKind: "items",
          relation: "item_model",
          value: "demo:item/gear",
          toPath: "assets/demo/models/item/gear.json",
          toKind: "models",
          status: "resolved"
        },
        {
          fromPath: "assets/demo/models/item/gear.json",
          fromKind: "models",
          relation: "model_texture",
          value: "demo:item/gear",
          toPath: "assets/demo/textures/item/gear.png",
          toKind: "textures",
          status: "resolved"
        }
      ],
      unresolved: [],
      skipped: [],
      truncated: false
    });
  });
});
