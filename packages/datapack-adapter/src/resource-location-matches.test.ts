import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { searchDatapackFiles } from "./index.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("resource-location metadata matches", () => {
  it("matches existing loose asset entries by resource location without reading content", async () => {
    const root = await createTempRoot();

    await writeFixture(root, "assets/demo/items/gear.json", "{}\n");
    await writeFixture(root, "assets/demo/models/item/gear.json", "{}\n");
    await writeFixture(
      root,
      "assets/demo/textures/item/gear.png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])
    );
    await writeFixture(root, "assets/demo/models/item/missing.json", "{}\n");

    const result = await searchDatapackFiles(root, "demo:item/gear");

    expect(result.matches.map((match) => match.file.relativePath)).toEqual([
      "assets/demo/items/gear.json",
      "assets/demo/models/item/gear.json",
      "assets/demo/textures/item/gear.png"
    ]);
    expect(result.matches.every((match) => match.preview.includes("metadata"))).toBe(
      true
    );
    expect(result.skipped).toEqual([]);
  });

  it("matches block ids across blockstate, model, and texture asset paths", async () => {
    const root = await createTempRoot();

    await writeFixture(root, "assets/demo/blockstates/block/gear.json", "{}\n");
    await writeFixture(root, "assets/demo/models/block/gear.json", "{}\n");
    await writeFixture(
      root,
      "assets/demo/textures/block/gear.png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])
    );

    const result = await searchDatapackFiles(root, "demo:block/gear");

    expect(result.matches.map((match) => match.file.relativePath)).toEqual([
      "assets/demo/blockstates/block/gear.json",
      "assets/demo/models/block/gear.json",
      "assets/demo/textures/block/gear.png"
    ]);
    expect(result.matches.every((match) => match.preview.includes("metadata"))).toBe(
      true
    );
    expect(result.skipped).toEqual([]);
  });
});

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "datapack-resource-locations-"));
  tempRoots.push(root);
  return root;
}

async function writeFixture(
  root: string,
  relativePath: string,
  content: string | Buffer
): Promise<void> {
  const absolutePath = join(root, relativePath);

  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content);
}
