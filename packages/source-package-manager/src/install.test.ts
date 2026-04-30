import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, vi } from "vitest";

import type {
  ManagedRuntimeLayout,
  SourcePackageConfirmation,
  SourcePackageCoordinate
} from "@mcpskill/shared-types";

import { writeSourcePackageConfirmation } from "./confirmation.js";
import { buildLocalSourcePackageRecipeExecutor } from "./executor.js";
import { ensureSourcePackageInstalled } from "./install.js";
import { readSourcePackageInstallState } from "./state.js";
import {
  buildMojangVanillaDataPackRecipeProvider,
  buildVanillaSourcePackCopyRecipe
} from "./vanilla.js";

const sourcePackage: SourcePackageCoordinate = {
  packageId: "minecraft-1.20.1-source-pack-named",
  namespace: "minecraft",
  minecraftVersion: "1.20.1",
  artifactType: "source-pack",
  variant: "named"
};

const confirmation: SourcePackageConfirmation = {
  ...sourcePackage,
  scope: "package-version",
  approvedAt: "2026-04-24T02:00:00Z",
  source: "explicit-user-confirmation"
};

const vanillaDataPackPackage: SourcePackageCoordinate = {
  packageId: "minecraft-26.1.2-vanilla-datapack-official",
  namespace: "minecraft",
  minecraftVersion: "26.1.2",
  artifactType: "datapack",
  variant: "official"
};

const vanillaDataPackConfirmation: SourcePackageConfirmation = {
  ...vanillaDataPackPackage,
  scope: "package-version",
  approvedAt: "2026-05-01T00:00:00Z",
  source: "explicit-user-confirmation"
};

describe("ensureSourcePackageInstalled", () => {
  it("returns needs_confirmation when the package is not approved yet", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const executeRecipe = vi.fn();

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: {},
        executeRecipe
      })
    ).resolves.toMatchObject({
      status: "needs_confirmation",
      package: sourcePackage,
      confirmationScope: "package-version"
    });

    expect(executeRecipe).not.toHaveBeenCalled();
  });

  it("installs a confirmed package through the recipe executor", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-materialized-"));

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);
    await mkdir(join(sourceRoot, "net", "minecraft", "world", "item"), {
      recursive: true
    });
    await writeFile(
      join(sourceRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
      "package net.minecraft.world.item;\npublic class ItemStack {}\n"
    );

    const executeRecipe = buildLocalSourcePackageRecipeExecutor();

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: {
          [sourcePackage.packageId]: buildVanillaSourcePackCopyRecipe({
            minecraftVersion: "1.20.1",
            sourceRoot
          })
        },
        executeRecipe
      })
    ).resolves.toMatchObject({
      status: "ready",
      package: sourcePackage,
      summary: `Executed 3 recipe step(s) for ${sourcePackage.packageId}.`
    });

    await expect(
      readSourcePackageInstallState(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      status: "ready"
    });
  });

  it("installs a confirmed package through a lazy recipe provider", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-materialized-"));

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);
    await mkdir(join(sourceRoot, "net", "minecraft", "world", "item"), {
      recursive: true
    });
    await writeFile(
      join(sourceRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
      "package net.minecraft.world.item;\npublic class ItemStack {}\n"
    );

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: {},
        recipeProvider: async (requestedPackage) =>
          requestedPackage.packageId === sourcePackage.packageId
            ? buildVanillaSourcePackCopyRecipe({
                minecraftVersion: "1.20.1",
                sourceRoot
              })
            : undefined,
        executeRecipe: buildLocalSourcePackageRecipeExecutor()
      })
    ).resolves.toMatchObject({
      status: "ready",
      package: sourcePackage
    });
  });

  it("installs a confirmed vanilla datapack package through a Mojang manifest provider", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-datapack-package-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const serverJarUrl = dataUrl(
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
    );
    const versionUrl = jsonDataUrl({
      downloads: {
        server: {
          url: serverJarUrl
        }
      }
    });
    const versionManifestUrl = jsonDataUrl({
      versions: [
        {
          id: "26.1.2",
          url: versionUrl
        }
      ]
    });

    await writeSourcePackageConfirmation(
      runtimeLayout,
      vanillaDataPackConfirmation
    );

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage: vanillaDataPackPackage,
        recipes: {},
        recipeProvider: buildMojangVanillaDataPackRecipeProvider({
          versionManifestUrl
        }),
        executeRecipe: buildLocalSourcePackageRecipeExecutor()
      })
    ).resolves.toMatchObject({
      status: "ready",
      package: vanillaDataPackPackage
    });

    const state = await readSourcePackageInstallState(
      runtimeLayout,
      vanillaDataPackPackage
    );

    await expect(
      readFile(
        join(
          state?.installPath ?? "",
          "data",
          "minecraft",
          "recipe",
          "stone.json"
        ),
        "utf-8"
      )
    ).resolves.toContain("crafting_shapeless");
    await expect(
      readFile(
        join(state?.installPath ?? "", "assets", "minecraft", "lang", "en_us.json")
      )
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not rerun the recipe when a ready install state already exists", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-materialized-"));

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);
    await mkdir(join(sourceRoot, "net", "minecraft", "world", "item"), {
      recursive: true
    });
    await writeFile(
      join(sourceRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
      "package net.minecraft.world.item;\npublic class ItemStack {}\n"
    );

    const executeRecipe = vi.fn(buildLocalSourcePackageRecipeExecutor());
    const recipe = buildVanillaSourcePackCopyRecipe({
      minecraftVersion: "1.20.1",
      sourceRoot
    });

    await ensureSourcePackageInstalled({
      runtimeLayout,
      sourcePackage,
      recipes: { [sourcePackage.packageId]: recipe },
      executeRecipe
    });

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: { [sourcePackage.packageId]: recipe },
        executeRecipe
      })
    ).resolves.toMatchObject({
      status: "ready",
      summary: `Source package ${sourcePackage.packageId} is already installed.`
    });

    expect(executeRecipe).toHaveBeenCalledTimes(1);
  });

  it("records install_failed when the recipe executor throws", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const sourceRoot = join(runtimeRoot, "missing-materialized-root");

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: {
          [sourcePackage.packageId]: buildVanillaSourcePackCopyRecipe({
            minecraftVersion: "1.20.1",
            sourceRoot
          })
        },
        executeRecipe: buildLocalSourcePackageRecipeExecutor()
      })
    ).resolves.toMatchObject({
      status: "install_failed",
      error: expect.stringContaining("ENOENT")
    });

    await expect(
      readSourcePackageInstallState(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      status: "install_failed",
      error: expect.stringContaining("ENOENT")
    });
  });

  it("records install_validation_failed when the executor does not materialize a manifest", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const invalidInstallPath = await mkdtemp(
      join(tmpdir(), "mcpskill-invalid-install-")
    );

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: {
          [sourcePackage.packageId]: buildVanillaSourcePackCopyRecipe({
            minecraftVersion: "1.20.1",
            sourceRoot: invalidInstallPath
          })
        },
        executeRecipe: async () => ({
          installPath: invalidInstallPath,
          summary: "executor returned an invalid install"
        })
      })
    ).resolves.toMatchObject({
      status: "install_validation_failed",
      error: expect.stringContaining("missing source-package.manifest.json")
    });

    await expect(
      readSourcePackageInstallState(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      status: "install_validation_failed",
      error: expect.stringContaining("missing source-package.manifest.json")
    });
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
