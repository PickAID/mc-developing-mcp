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
      compatibleMinecraftVersions: ["1.20.1", "1.20.6", "1.21.1"]
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
  await mkdir(join(root, "data", "demo", "recipes"), { recursive: true });
  await writeFile(
    join(root, "pack.mcmeta"),
    JSON.stringify({
      pack: {
        pack_format: packFormat,
        ...(supportedFormats ? { supported_formats: supportedFormats } : {})
      }
    })
  );
  await writeFile(join(root, "data", "demo", "recipes", "gear.json"), "{}\n");
}
