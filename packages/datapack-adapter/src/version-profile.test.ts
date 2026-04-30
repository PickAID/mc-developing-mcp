import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveDatapackVersionProfile } from "./version-profile.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("resolveDatapackVersionProfile", () => {
  it("combines matching pack.mcmeta and workspace runtime evidence", async () => {
    const root = await createRoot("mcpskill-profile-");

    await writePack(root, 15);

    await expect(
      resolveDatapackVersionProfile(root, {
        minecraftVersion: "1.20.1",
        runtimeConfidence: "high"
      })
    ).resolves.toMatchObject({
      source: "pack_mcmeta_and_runtime",
      confidence: "high",
      supportLevel: "known_profile",
      packFormatStatus: "known",
      minecraftVersion: "1.20.1",
      packFormat: 15,
      semanticValidation: "not_available",
      migrationAnalysis: "not_available",
      knownDataKinds: expect.arrayContaining(["recipes", "tags", "worldgen"])
    });
  });

  it("marks conflicting pack.mcmeta and runtime evidence explicitly", async () => {
    const root = await createRoot("mcpskill-profile-conflict-");

    await writePack(root, 15);

    await expect(
      resolveDatapackVersionProfile(root, {
        minecraftVersion: "1.21.1",
        runtimeConfidence: "high"
      })
    ).resolves.toMatchObject({
      source: "conflict",
      confidence: "unknown",
      supportLevel: "known_profile",
      packFormatStatus: "conflict",
      minecraftVersion: "1.21.1",
      packFormat: 15
    });
  });

  it("returns an unresolved profile when no version evidence exists", async () => {
    const root = await createRoot("mcpskill-profile-unknown-");

    await expect(resolveDatapackVersionProfile(root)).resolves.toMatchObject({
      source: "unknown",
      confidence: "unknown",
      supportLevel: "unresolved",
      packFormatStatus: "unknown",
      semanticValidation: "not_available"
    });
  });

  it("reports supported pack format ranges from modern pack metadata", async () => {
    const root = await createRoot("mcpskill-profile-range-");

    await writePack(root, 15, [15, 34]);

    await expect(resolveDatapackVersionProfile(root)).resolves.toMatchObject({
      source: "pack_mcmeta",
      confidence: "medium",
      supportLevel: "known_profile",
      packFormatStatus: "known",
      minecraftVersion: "1.20.1",
      packFormat: 15,
      supportedFormats: {
        minInclusive: 15,
        maxInclusive: 34
      },
      compatibleMinecraftVersions: [
        "1.20",
        "1.20.1",
        "1.20.2",
        "1.20.3",
        "1.20.4"
      ]
    });
  });

  it("uses official data pack formats from 1.18.2 through 26.1 releases", async () => {
    const root = await createRoot("mcpskill-profile-catalog-");
    const cases = [
      ["1.18.2", 9, "9"],
      ["1.20.6", 41, "41"],
      ["1.21.1", 48, "48"],
      ["1.21.10", 88, "88.0"],
      ["1.21.11", 94.1, "94.1"],
      ["26.1", 101.1, "101.1"],
      ["26.1.2", 101.1, "101.1"]
    ] as const;

    for (const [minecraftVersion, packFormat, packFormatId] of cases) {
      await expect(
        resolveDatapackVersionProfile(root, { minecraftVersion })
      ).resolves.toMatchObject({
        source: "runtime",
        supportLevel: "known_profile",
        packFormatStatus: "known",
        minecraftVersion,
        packFormat,
        packFormatId
      });
    }
  });

  it("does not mark pack format evidence as conflicting when runtime is in the same data format", async () => {
    const root = await createRoot("mcpskill-profile-shared-format-");

    await writePack(root, 48);

    await expect(
      resolveDatapackVersionProfile(root, { minecraftVersion: "1.21.1" })
    ).resolves.toMatchObject({
      source: "pack_mcmeta_and_runtime",
      supportLevel: "known_profile",
      packFormatStatus: "known",
      minecraftVersion: "1.21.1",
      packFormat: 48,
      packFormatId: "48"
    });
  });

  it("parses minor data pack format bounds from min_format and max_format", async () => {
    const root = await createRoot("mcpskill-profile-min-max-");

    await writePackMetadata(root, {
      pack: {
        min_format: [101, 1],
        max_format: 101
      }
    });

    await expect(resolveDatapackVersionProfile(root)).resolves.toMatchObject({
      source: "pack_mcmeta",
      packFormatStatus: "known",
      packFormat: 101.1,
      packFormatId: "101.1",
      supportedFormats: {
        minFormat: { major: 101, minor: 1, id: "101.1" },
        maxFormat: { major: 101, minor: null, id: "101.*" }
      },
      compatibleMinecraftVersions: ["26.1", "26.1.1", "26.1.2"]
    });
  });
});

async function createRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function writePack(
  root: string,
  packFormat: number,
  supportedFormats?: [number, number]
): Promise<void> {
  await writePackMetadata(root, {
    pack: {
      pack_format: packFormat,
      ...(supportedFormats ? { supported_formats: supportedFormats } : {})
    }
  });
}

async function writePackMetadata(
  root: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await mkdir(join(root, "data", "demo", "recipes"), { recursive: true });
  await writeFile(join(root, "pack.mcmeta"), JSON.stringify(metadata));
  await writeFile(join(root, "data", "demo", "recipes", "gear.json"), "{}\n");
}
