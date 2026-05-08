import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type {
  ManagedRuntimeLayout,
  SourcePackageConfirmation,
  SourcePackageCoordinate
} from "minecraft-developing-mcp-shared-types";

import { writeSourcePackageConfirmation } from "./confirmation.js";
import { buildLocalSourcePackageRecipeExecutor } from "./executor.js";
import { ensureSourcePackageInstalled } from "./install.js";
import { readSourcePackageInstallState } from "./state.js";
import {
  buildMojangVanillaAssetsRecipeProvider,
  buildMojangVanillaDataPackRecipeProvider,
  buildMojangVanillaResourcePackRecipeProvider
} from "./vanilla.js";

describe("Mojang vanilla generated package providers", () => {
  it("installs a confirmed vanilla datapack package from the server archive", async () => {
    const sourcePackage = createCoordinate("datapack");
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-datapack-package-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const versionManifestUrl = createVersionManifestUrl({
      server: dataUrl(
        "application/octet-stream",
        createZip([
          {
            name: "data/minecraft/recipe/stone.json",
            content: "{\"type\":\"minecraft:crafting_shapeless\"}\n"
          },
          {
            name: "assets/minecraft/lang/en_us.json",
            content: "{\"item.minecraft.stone\":\"Stone\"}\n"
          }
        ])
      )
    });

    await writeSourcePackageConfirmation(
      runtimeLayout,
      createConfirmation(sourcePackage)
    );

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: {},
        recipeProvider: buildMojangVanillaDataPackRecipeProvider({
          versionManifestUrl
        }),
        executeRecipe: buildLocalSourcePackageRecipeExecutor()
      })
    ).resolves.toMatchObject({ status: "ready", package: sourcePackage });

    const state = await readSourcePackageInstallState(runtimeLayout, sourcePackage);
    await expect(
      readFile(
        join(state?.installPath ?? "", "data", "minecraft", "recipe", "stone.json"),
        "utf-8"
      )
    ).resolves.toContain("crafting_shapeless");
    await expect(
      readFile(join(state?.installPath ?? "", "assets", "minecraft", "lang", "en_us.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("installs a confirmed vanilla assets package from the client archive", async () => {
    const sourcePackage = createCoordinate("assets");
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-assets-package-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const versionManifestUrl = createVersionManifestUrl({
      client: dataUrl(
        "application/octet-stream",
        createZip([
          {
            name: "assets/minecraft/models/item/stone.json",
            content: "{\"parent\":\"minecraft:item/generated\"}\n"
          },
          {
            name: "data/minecraft/recipe/stone.json",
            content: "{\"type\":\"minecraft:crafting_shapeless\"}\n"
          }
        ])
      )
    });

    await writeSourcePackageConfirmation(
      runtimeLayout,
      createConfirmation(sourcePackage)
    );

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: {},
        recipeProvider: buildMojangVanillaAssetsRecipeProvider({
          versionManifestUrl
        }),
        executeRecipe: buildLocalSourcePackageRecipeExecutor()
      })
    ).resolves.toMatchObject({ status: "ready", package: sourcePackage });

    const state = await readSourcePackageInstallState(runtimeLayout, sourcePackage);
    await expect(
      readFile(
        join(
          state?.installPath ?? "",
          "assets",
          "minecraft",
          "models",
          "item",
          "stone.json"
        ),
        "utf-8"
      )
    ).resolves.toContain("minecraft:item/generated");
    await expect(
      readFile(join(state?.installPath ?? "", "data", "minecraft", "recipe", "stone.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("installs a confirmed vanilla resource-pack package from the client archive", async () => {
    const sourcePackage = createCoordinate("resource-pack");
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-resource-pack-package-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const versionManifestUrl = createVersionManifestUrl({
      client: dataUrl(
        "application/octet-stream",
        createZip([
          {
            name: "assets/minecraft/models/item/stone.json",
            content: "{\"parent\":\"minecraft:item/generated\"}\n"
          },
          {
            name: "data/minecraft/recipe/stone.json",
            content: "{\"type\":\"minecraft:crafting_shapeless\"}\n"
          }
        ])
      )
    });

    await writeSourcePackageConfirmation(
      runtimeLayout,
      createConfirmation(sourcePackage)
    );

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: {},
        recipeProvider: buildMojangVanillaResourcePackRecipeProvider({
          versionManifestUrl
        }),
        executeRecipe: buildLocalSourcePackageRecipeExecutor()
      })
    ).resolves.toMatchObject({ status: "ready", package: sourcePackage });

    const state = await readSourcePackageInstallState(runtimeLayout, sourcePackage);
    await expect(
      readFile(
        join(
          state?.installPath ?? "",
          "assets",
          "minecraft",
          "models",
          "item",
          "stone.json"
        ),
        "utf-8"
      )
    ).resolves.toContain("minecraft:item/generated");
  });
});

function createRuntimeLayout(runtimeRoot: string): ManagedRuntimeLayout {
  return {
    root: runtimeRoot,
    downloads: join(runtimeRoot, "downloads"),
    installs: join(runtimeRoot, "installs"),
    locks: join(runtimeRoot, "locks")
  };
}

function createCoordinate(
  artifactType: "datapack" | "assets" | "resource-pack"
): SourcePackageCoordinate {
  return {
    packageId: artifactType === "resource-pack"
      ? "minecraft-26.1.2-vanilla-resource-pack-official"
      : `minecraft-26.1.2-vanilla-${artifactType}-official`,
    namespace: "minecraft",
    minecraftVersion: "26.1.2",
    artifactType,
    variant: "official"
  };
}

function createConfirmation(
  sourcePackage: SourcePackageCoordinate
): SourcePackageConfirmation {
  return {
    ...sourcePackage,
    scope: "package-version",
    approvedAt: "2026-05-01T00:00:00Z",
    source: "explicit-user-confirmation"
  };
}

function createVersionManifestUrl(downloads: {
  client?: string;
  server?: string;
}): string {
  const versionUrl = jsonDataUrl({
    downloads: {
      client: downloads.client ? { url: downloads.client } : undefined,
      server: downloads.server ? { url: downloads.server } : undefined
    }
  });

  return jsonDataUrl({
    versions: [
      {
        id: "26.1.2",
        url: versionUrl
      }
    ]
  });
}

interface ZipFixtureEntry {
  name: string;
  content: string;
}

function jsonDataUrl(payload: unknown): string {
  return dataUrl("application/json", Buffer.from(JSON.stringify(payload)));
}

function dataUrl(contentType: string, content: Buffer): string {
  return `data:${contentType};base64,${content.toString("base64")}`;
}

function createZip(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

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
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, name, content);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + content.length;
  }

  const eocd = Buffer.alloc(22);

  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(
    centralParts.reduce((total, part) => total + part.length, 0),
    12
  );
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}
