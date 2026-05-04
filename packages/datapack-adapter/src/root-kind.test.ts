import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  discoverDatapackContent,
  listDatapackFiles,
  summarizeDatapackFiles
} from "./index.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("datapack loose resource root kinds", () => {
  it("classifies pack.mcmeta assets-only roots as resource pack roots", async () => {
    const root = await createTempRoot("mcpskill-resource-root-");

    await writeText(
      join(root, "pack.mcmeta"),
      JSON.stringify({ pack: { pack_format: 15 } })
    );
    await writeText(join(root, "assets", "demo", "lang", "en_us.json"), "{}\n");

    const discovered = await discoverDatapackContent(root);

    expect(discovered.roots).toEqual([
      expect.objectContaining({
        absolutePath: root,
        hasPackMcmeta: true,
        hasData: false,
        hasAssets: true,
        rootKind: "resource_pack_root"
      })
    ]);
  });

  it("classifies assets-only workspace roots without assuming Prism metadata", async () => {
    const root = await createTempRoot("mcpskill-workspace-assets-");

    await writeText(join(root, "assets", "demo", "models", "block", "gear.json"), "{}\n");

    const listed = await listDatapackFiles(root);
    const summary = await summarizeDatapackFiles(root);

    expect(listed.entries).toEqual([
      expect.objectContaining({
        relativePath: "assets/demo/models/block/gear.json",
        rootKind: "workspace_assets_root",
        rootRelativePath: "."
      })
    ]);
    expect(summary).toMatchObject({
      rootCount: 1,
      byRootKind: {
        workspace_assets_root: 1
      },
      byDomain: {
        assets: 1
      },
      byKind: {
        models: 1
      }
    });
  });

  it("classifies loose mixed data and assets roots as mixed pack roots", async () => {
    const root = await createTempRoot("mcpskill-mixed-root-");
    const resourcesRoot = join(root, "src", "main", "resources");

    await writeText(
      join(resourcesRoot, "data", "demo", "recipes", "gear.json"),
      "{}\n"
    );
    await writeText(
      join(resourcesRoot, "assets", "demo", "textures", "item", "gear.png"),
      "png\n"
    );

    const listed = await listDatapackFiles(root);
    const summary = await summarizeDatapackFiles(root);

    expect(listed.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: "assets/demo/textures/item/gear.png",
          rootKind: "mixed_pack_root",
          rootRelativePath: "src/main/resources"
        }),
        expect.objectContaining({
          relativePath: "data/demo/recipes/gear.json",
          rootKind: "mixed_pack_root",
          rootRelativePath: "src/main/resources"
        })
      ])
    );
    expect(summary.byRootKind).toEqual({
      mixed_pack_root: 1
    });
  });
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));

  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
