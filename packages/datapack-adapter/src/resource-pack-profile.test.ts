import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveResourcePackVersionProfile } from "./resource-pack-profile.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("resolveResourcePackVersionProfile", () => {
  it("reports resource-pack metadata without using the datapack catalog", async () => {
    const root = await createTempRoot("mcpskill-resource-profile-");

    await writeText(
      join(root, "pack.mcmeta"),
      JSON.stringify({ pack: { pack_format: 15 } })
    );
    await writeText(join(root, "assets", "demo", "lang", "en_us.json"), "{}\n");

    await expect(
      resolveResourcePackVersionProfile(root, {
        assetKinds: ["lang"]
      })
    ).resolves.toMatchObject({
      source: "pack_mcmeta_and_assets_runtime",
      confidence: "medium",
      supportLevel: "format_catalog_not_available",
      packFormatStatus: "metadata_only",
      packFormat: 15,
      packFormatId: "15",
      assetKinds: ["lang"],
      semanticValidation: "not_available",
      migrationAnalysis: "not_available",
      notes: [
        "profile describes resource-pack metadata and observed asset kinds only",
        "official resource pack format catalog is not implemented yet",
        "versioned asset validation is not implemented yet"
      ]
    });
  });

  it("reports assets-only roots without guessing pack format", async () => {
    const root = await createTempRoot("mcpskill-resource-profile-no-meta-");

    await writeText(join(root, "assets", "demo", "models", "item", "gear.json"), "{}\n");

    await expect(
      resolveResourcePackVersionProfile(root, {
        assetKinds: ["models"]
      })
    ).resolves.toMatchObject({
      source: "assets_runtime",
      supportLevel: "unresolved",
      packFormatStatus: "missing_metadata",
      assetKinds: ["models"]
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
