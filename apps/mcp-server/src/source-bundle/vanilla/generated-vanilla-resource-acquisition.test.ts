import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildLocalSourcePackageRecipeExecutor,
  buildVanillaResourcePackArchiveRecipe,
  writeSourcePackageConfirmation
} from "minecraft-developing-mcp-source-package-manager";
import type {
  ManagedRuntimeLayout,
  SourcePackageConfirmation,
  SourcePackageCoordinate
} from "minecraft-developing-mcp-shared-types";

import { executeMcpServerGeneratedVanillaResourcePackage } from "./source-bundle-generated-vanilla-resource.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("generated vanilla resource acquisition evidence", () => {
  it("returns package-level acquisition evidence when datapack confirmation is missing", async () => {
    const runtimeLayout = createRuntimeLayout(await createTempRoot());

    await expect(
      executeMcpServerGeneratedVanillaResourcePackage({
        minecraftVersion: "1.20.1",
        sourcePackage: sourcePackage("datapack"),
        payloadSource: "vanilla_datapack",
        evidenceLabel: "vanilla datapack",
        requestText: "Find vanilla recipe minecraft:stone.",
        queries: ["minecraft:stone"],
        requestedPaths: [],
        options: {
          runtimeLayout,
          executeRecipe: async () => {
            throw new Error("should not install without confirmation");
          }
        }
      })
    ).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "vanilla_datapack",
        result: {
          status: "needs_confirmation",
          acquisition: {
            status: "needs_confirmation",
            artifactType: "datapack",
            confirmationScope: "package-version"
          }
        }
      }
    });
  });

  it("does not attach source decompile job phases to ready assets packages", async () => {
    const runtimeLayout = createRuntimeLayout(await createTempRoot());
    const clientJar = join(runtimeLayout.root, "client.jar");

    await writeSourcePackageConfirmation(
      runtimeLayout,
      confirmation("resource-pack")
    );
    await writeFile(
      clientJar,
      createZip([
        {
          name: "assets/minecraft/models/item/stone.json",
          content: "{\"parent\":\"minecraft:item/generated\"}\n"
        }
      ])
    );

    const result = await executeMcpServerGeneratedVanillaResourcePackage({
      minecraftVersion: "1.20.1",
      sourcePackage: sourcePackage("resource-pack"),
      payloadSource: "vanilla_assets",
      evidenceLabel: "vanilla assets",
      requestText: "Read assets/minecraft/models/item/stone.json.",
      queries: [],
      requestedPaths: ["assets/minecraft/models/item/stone.json"],
      options: {
        runtimeLayout,
        recipes: {
          "minecraft-1.20.1-vanilla-resource-pack-official":
            buildVanillaResourcePackArchiveRecipe({
              minecraftVersion: "1.20.1",
              sourceArchive: clientJar
            })
        },
        executeRecipe: buildLocalSourcePackageRecipeExecutor()
      }
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "vanilla_assets",
        result: {
          status: "ready",
          acquisition: {
            status: "ready",
            artifactType: "resource-pack"
          }
        }
      }
    });
    expect(result.payload?.result.acquisition).not.toHaveProperty("sourceJob");
  });
});

function createRuntimeLayout(root: string): ManagedRuntimeLayout {
  return {
    root,
    downloads: join(root, "downloads"),
    installs: join(root, "installs"),
    locks: join(root, "locks")
  };
}

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-resource-acquisition-"));
  tempRoots.push(root);
  return root;
}

function sourcePackage(
  artifactType: "datapack" | "resource-pack"
): SourcePackageCoordinate {
  return {
    packageId: `minecraft-1.20.1-vanilla-${artifactType}-official`,
    namespace: "minecraft",
    minecraftVersion: "1.20.1",
    artifactType,
    variant: "official"
  };
}

function confirmation(
  artifactType: "datapack" | "resource-pack"
): SourcePackageConfirmation {
  return {
    ...sourcePackage(artifactType),
    scope: "package-version",
    approvedAt: "2026-05-05T00:00:00Z",
    source: "explicit-user-confirmation"
  };
}

function createZip(entries: Array<{ name: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.from(entry.content);
    const localHeader = Buffer.alloc(30);
    const centralHeader = Buffer.alloc(46);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);

    localParts.push(localHeader, name, content);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const eocd = Buffer.alloc(22);

  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localFiles.length, 16);

  return Buffer.concat([localFiles, centralDirectory, eocd]);
}
