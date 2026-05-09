import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  discoverKubeJsTypeResources,
  readKubeJsTypeResource,
  searchKubeJsTypeResources
} from "./index.js";

const tempRoots: string[] = [];

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `${prefix}-`));
  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("discoverKubeJsTypeResources", () => {
  it("discovers Prism legacy kubejs/probejs roots and classifies type resources", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-prism-kubejs");

    await writeText(
      join(workspaceRoot, "kubejs", "probejs", "globals.d.ts"),
      "declare const Item: unknown;\n"
    );
    await writeText(
      join(workspaceRoot, "kubejs", "probejs", "snippets", "recipes.txt"),
      "ServerEvents.recipes(event => {})\n"
    );
    await writeText(
      join(workspaceRoot, "kubejs", "probejs", "items", "minecraft.txt"),
      "minecraft:stone\n"
    );
    await writeText(
      join(workspaceRoot, "kubejs", "probejs", "recipes", "minecraft.txt"),
      "minecraft:crafting_shaped\n"
    );
    await writeText(
      join(workspaceRoot, "kubejs", "probejs", "registries", "blocks.txt"),
      "minecraft:block\n"
    );

    const result = await discoverKubeJsTypeResources({ workspaceRoot });

    expect(result.roots).toMatchObject([
      {
        absolutePath: join(workspaceRoot, "kubejs", "probejs"),
        relativePath: "kubejs/probejs",
        rootKind: "kubejs-nested"
      }
    ]);
    expect(result.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          absolutePath: join(workspaceRoot, "kubejs", "probejs", "globals.d.ts"),
          relativePath: "kubejs/probejs/globals.d.ts",
          sourceKind: "dts",
          rootKind: "kubejs-nested"
        }),
        expect.objectContaining({
          relativePath: "kubejs/probejs/snippets/recipes.txt",
          sourceKind: "snippet"
        }),
        expect.objectContaining({
          relativePath: "kubejs/probejs/items/minecraft.txt",
          sourceKind: "item"
        }),
        expect.objectContaining({
          relativePath: "kubejs/probejs/recipes/minecraft.txt",
          sourceKind: "recipe"
        }),
        expect.objectContaining({
          relativePath: "kubejs/probejs/registries/blocks.txt",
          sourceKind: "registry"
        })
      ])
    );
    expect(result.summary).toMatchObject({
      rootCount: 1,
      fileCount: 5,
      bySourceKind: {
        dts: 1,
        item: 1,
        other: 0,
        recipe: 1,
        registry: 1,
        snippet: 1
      }
    });
  });

  it("discovers workspace-local .probejs roots", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-local-probejs");

    await writeText(
      join(workspaceRoot, ".probejs", "probe-types.d.ts"),
      "declare namespace ProbeJS {}\n"
    );

    const result = await discoverKubeJsTypeResources({ workspaceRoot });

    expect(result.roots).toMatchObject([
      {
        absolutePath: join(workspaceRoot, ".probejs"),
        relativePath: ".probejs",
        rootKind: "workspace-local"
      }
    ]);
    expect(result.files).toMatchObject([
      {
        absolutePath: join(workspaceRoot, ".probejs", "probe-types.d.ts"),
        relativePath: ".probejs/probe-types.d.ts",
        sourceKind: "dts",
        sizeBytes: 29,
        rootKind: "workspace-local"
      }
    ]);
  });

  it("applies maxFiles during discovery", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-budget-discover");

    await writeText(join(workspaceRoot, ".probejs", "a.d.ts"), "declare const A: 1;\n");
    await writeText(join(workspaceRoot, ".probejs", "b.d.ts"), "declare const B: 1;\n");

    const result = await discoverKubeJsTypeResources({
      workspaceRoot,
      maxFiles: 1
    });

    expect(result.files).toHaveLength(1);
    expect(result.summary.truncated).toBe(true);
    expect(result.summary.skippedFiles).toBe(1);
  });
});

describe("searchKubeJsTypeResources", () => {
  it("searches discovered type resources with file and result budgets", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-search-probejs");

    await writeText(
      join(workspaceRoot, ".probejs", "first.d.ts"),
      "declare const BlockEvents: unknown;\n"
    );
    await writeText(
      join(workspaceRoot, ".probejs", "second.d.ts"),
      "declare const ItemEvents: unknown;\n"
    );

    const result = await searchKubeJsTypeResources({
      workspaceRoot,
      query: "events",
      limit: 1,
      maxFiles: 1,
      maxBytesPerFile: 1_000
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      lineNumber: 1,
      file: {
        absolutePath: join(workspaceRoot, ".probejs", "first.d.ts"),
        relativePath: ".probejs/first.d.ts",
        sourceKind: "dts",
        rootKind: "workspace-local"
      }
    });
    expect(result.truncated).toBe(true);
  });
});

describe("readKubeJsTypeResource", () => {
  it("reads a discovered resource with a byte budget", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-read-probejs");

    await writeText(
      join(workspaceRoot, ".probejs", "long.d.ts"),
      "declare const VeryLongProbeJsType: string;\n"
    );

    const result = await readKubeJsTypeResource({
      workspaceRoot,
      relativePath: ".probejs/long.d.ts",
      maxBytes: 12
    });

    expect(result).toMatchObject({
      file: {
        absolutePath: join(workspaceRoot, ".probejs", "long.d.ts"),
        relativePath: ".probejs/long.d.ts",
        sourceKind: "dts",
        sizeBytes: 43,
        rootKind: "workspace-local"
      },
      content: "declare cons",
      bytesRead: 12,
      truncated: true
    });
  });
});
