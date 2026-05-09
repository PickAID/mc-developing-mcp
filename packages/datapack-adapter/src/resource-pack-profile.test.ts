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
  it("resolves resource-pack metadata through the official resource catalog", async () => {
    const root = await createTempRoot("mcpskill-resource-profile-");

    await writeText(
      join(root, "pack.mcmeta"),
      JSON.stringify({ pack: { pack_format: 15 } })
    );
    await writeText(join(root, "assets", "demo", "lang", "en_us.json"), "{}\n");

    await expect(
      resolveResourcePackVersionProfile(root, {
        assetKinds: ["lang"],
        minecraftVersion: "1.20.1"
      })
    ).resolves.toMatchObject({
      source: "pack_mcmeta_and_assets_runtime",
      confidence: "medium",
      supportLevel: "known_profile",
      packFormatStatus: "known",
      minecraftVersion: "1.20.1",
      packFormat: 15,
      packFormatId: "15",
      compatibleMinecraftVersions: [],
      assetKinds: ["lang"],
      semanticValidation: "not_available",
      migrationAnalysis: "not_available",
      notes: [
        "profile describes resource-pack metadata and observed asset kinds only",
        "deep per-asset validation is outside this compact profile",
        "resource-pack migration evidence is reported separately when source and target versions are known"
      ]
    });
  });

  it("detects resource-pack metadata conflicts with runtime version", async () => {
    const root = await createTempRoot("mcpskill-resource-profile-conflict-");

    await writeText(
      join(root, "pack.mcmeta"),
      JSON.stringify({ pack: { pack_format: 34 } })
    );
    await writeText(join(root, "assets", "demo", "lang", "en_us.json"), "{}\n");

    await expect(
      resolveResourcePackVersionProfile(root, {
        assetKinds: ["lang"],
        minecraftVersion: "1.20.1"
      })
    ).resolves.toMatchObject({
      source: "conflict",
      supportLevel: "known_profile",
      packFormatStatus: "conflict",
      minecraftVersion: "1.20.1",
      packFormatId: "34",
      notes: expect.arrayContaining([
        "pack.mcmeta resource format is incompatible with runtime 1.20.1"
      ])
    });
  });

  it("keeps resource pack formats separate from datapack formats", async () => {
    const currentRoot = await createTempRoot("mcpskill-resource-profile-current-");
    const futureRoot = await createTempRoot("mcpskill-resource-profile-future-");

    await writeText(
      join(currentRoot, "pack.mcmeta"),
      JSON.stringify({ pack: { pack_format: 34 } })
    );
    await writeText(join(currentRoot, "assets", "demo", "lang", "en_us.json"), "{}\n");
    await writeText(join(futureRoot, "assets", "demo", "lang", "en_us.json"), "{}\n");

    await expect(
      resolveResourcePackVersionProfile(currentRoot, {
        minecraftVersion: "1.21.1"
      })
    ).resolves.toMatchObject({
      supportLevel: "known_profile",
      packFormatId: "34",
      minecraftVersion: "1.21.1"
    });

    await expect(
      resolveResourcePackVersionProfile(futureRoot, {
        minecraftVersion: "26.1.2"
      })
    ).resolves.toMatchObject({
      supportLevel: "known_profile",
      packFormatId: "84.0",
      minecraftVersion: "26.1.2"
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
