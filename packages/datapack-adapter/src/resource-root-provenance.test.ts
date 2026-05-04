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

describe("standard mod workspace resource root provenance", () => {
  it("reports main and generated resources in roots, entries, and summaries", async () => {
    const root = await createTempRoot("resource-root-provenance");

    await writeFixture(root, "src/main/resources/pack.mcmeta", "{}\n");
    await writeFixture(root, "src/main/resources/assets/demo/lang/en_us.json", "{}\n");
    await writeFixture(root, "src/generated/resources/data/demo/recipes/gear.json", "{}\n");
    await writeFixture(root, "src/generated/resources/assets/demo/models/item/gear.json", "{}\n");

    const discovered = await discoverDatapackContent(root);
    const listed = await listDatapackFiles(root);
    const summary = await summarizeDatapackFiles(root);

    expect(discovered.roots.map((contentRoot) => ({
      rootRelativePath: contentRoot.rootRelativePath,
      rootKind: contentRoot.rootKind,
      provenance: contentRoot.provenance,
      hasPackMcmeta: contentRoot.hasPackMcmeta,
      hasData: contentRoot.hasData,
      hasAssets: contentRoot.hasAssets
    }))).toEqual([
      {
        rootRelativePath: "src/generated/resources",
        rootKind: "mixed_pack_root",
        provenance: "generated_resources",
        hasPackMcmeta: false,
        hasData: true,
        hasAssets: true
      },
      {
        rootRelativePath: "src/main/resources",
        rootKind: "resource_pack_root",
        provenance: "main_resources",
        hasPackMcmeta: true,
        hasData: false,
        hasAssets: true
      }
    ]);
    expect(listed.entries.map((entry) => ({
      rootRelativePath: entry.rootRelativePath,
      provenance: entry.provenance,
      relativePath: entry.relativePath,
      domain: entry.domain,
      kind: entry.kind
    }))).toEqual([
      {
        rootRelativePath: "src/main/resources",
        provenance: "main_resources",
        relativePath: "assets/demo/lang/en_us.json",
        domain: "assets",
        kind: "lang"
      },
      {
        rootRelativePath: "src/generated/resources",
        provenance: "generated_resources",
        relativePath: "assets/demo/models/item/gear.json",
        domain: "assets",
        kind: "models"
      },
      {
        rootRelativePath: "src/generated/resources",
        provenance: "generated_resources",
        relativePath: "data/demo/recipes/gear.json",
        domain: "data",
        kind: "recipes"
      },
      {
        rootRelativePath: "src/main/resources",
        provenance: "main_resources",
        relativePath: "pack.mcmeta",
        domain: "assets",
        kind: "pack_metadata"
      }
    ]);
    expect(summary.byProvenance).toEqual({
      generated_resources: 1,
      main_resources: 1
    });
  });
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `${prefix}-`));

  tempRoots.push(root);
  return root;
}

async function writeFixture(
  root: string,
  relativePath: string,
  content: string
): Promise<void> {
  const absolutePath = join(root, relativePath);

  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content);
}
