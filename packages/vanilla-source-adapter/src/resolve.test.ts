import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import type {
  CurrentRuntime,
  ManagedRuntimeLayout,
  SourcePackageConfirmation
} from "@mcpskill/shared-types";
import {
  buildLocalSourcePackageRecipeExecutor,
  buildVanillaSourcePackCopyRecipe,
  writeSourcePackageConfirmation
} from "@mcpskill/source-package-manager";

import { isVanillaSourceRequest } from "./request.js";
import { resolveVanillaSource } from "./resolve.js";

describe("resolveVanillaSource", () => {
  it("recognizes net.minecraft symbol requests as vanilla source requests", () => {
    expect(
      isVanillaSourceRequest({
        symbol: "net.minecraft.world.item.ItemStack"
      })
    ).toBe(true);
  });

  it("returns version_unresolved when runtime is not authoritative", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-source-"));

    await expect(
      resolveVanillaSource({
        runtimeLayout: createRuntimeLayout(runtimeRoot),
        currentRuntime: {
          minecraftVersion: "1.20.1",
          source: "workspace-detect",
          confidence: "low",
          evidenceSources: [],
          candidates: [],
          evidence: []
        },
        request: {
          symbol: "net.minecraft.world.item.ItemStack"
        },
        recipes: {},
        executeRecipe: async () => {
          throw new Error("should not run");
        }
      })
    ).resolves.toMatchObject({
      status: "version_unresolved"
    });
  });

  it("returns needs_confirmation when the source pack is not approved", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-source-"));

    await expect(
      resolveVanillaSource({
        runtimeLayout: createRuntimeLayout(runtimeRoot),
        currentRuntime: createCurrentRuntime("1.20.1"),
        request: {
          symbol: "net.minecraft.world.item.ItemStack"
        },
        recipes: {},
        executeRecipe: async () => {
          throw new Error("should not run");
        }
      })
    ).resolves.toMatchObject({
      status: "needs_confirmation",
      packageId: "minecraft-1.20.1-source-pack-named"
    });
  });

  it("returns ready when a confirmed install produces the exact vanilla file", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-source-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-materialized-"));

    await writeSourcePackageConfirmation(
      runtimeLayout,
      createConfirmation("1.20.1")
    );
    await mkdir(join(sourceRoot, "net", "minecraft", "world", "item"), {
      recursive: true
    });
    await writeFile(
      join(sourceRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
      "package net.minecraft.world.item;\npublic class ItemStack {}\n"
    );

    const result = await resolveVanillaSource({
      runtimeLayout,
      currentRuntime: createCurrentRuntime("1.20.1"),
      request: {
        symbol: "net.minecraft.world.item.ItemStack"
      },
      recipes: {
        "minecraft-1.20.1-source-pack-named": buildVanillaSourcePackCopyRecipe({
          minecraftVersion: "1.20.1",
          sourceRoot
        })
      },
      executeRecipe: buildLocalSourcePackageRecipeExecutor()
    });

    expect(result).toMatchObject({
      status: "ready",
      packageId: "minecraft-1.20.1-source-pack-named",
      references: [
        {
          relativePath: "net/minecraft/world/item/ItemStack.java",
          reason: "indexed vanilla source match",
          startLine: 1,
          endLine: 3,
          totalLines: 3,
          matchReasons: ["path_exact"]
        }
      ]
    });
  });

  it("returns chunk line ranges for indexed vanilla source text matches", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-source-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-materialized-"));

    await writeSourcePackageConfirmation(
      runtimeLayout,
      createConfirmation("1.20.1")
    );
    await mkdir(join(sourceRoot, "net", "minecraft", "client", "gui"), {
      recursive: true
    });
    await writeFile(
      join(sourceRoot, "net", "minecraft", "client", "gui", "GuiGraphics.java"),
      [
        "package net.minecraft.client.gui;",
        "public class GuiGraphics {",
        "  void render() {",
        "    RenderSystem.enableBlend();",
        "  }",
        "}"
      ].join("\n")
    );

    await expect(
      resolveVanillaSource({
        runtimeLayout,
        currentRuntime: createCurrentRuntime("1.20.1"),
        request: {
          packageHint: "RenderSystem enableBlend"
        },
        recipes: {
          "minecraft-1.20.1-source-pack-named": buildVanillaSourcePackCopyRecipe({
            minecraftVersion: "1.20.1",
            sourceRoot
          })
        },
        executeRecipe: buildLocalSourcePackageRecipeExecutor()
      })
    ).resolves.toMatchObject({
      status: "ready",
      packageId: "minecraft-1.20.1-source-pack-named",
      references: [
        {
          relativePath: "net/minecraft/client/gui/GuiGraphics.java",
          reason: "indexed vanilla source match",
          startLine: 1,
          endLine: 6,
          chunkId: "lines-1-6",
          matchReasons: expect.arrayContaining([
            "fts_chunk",
            "term:RenderSystem"
          ])
        }
      ]
    });
  });

  it("returns installed_but_no_match when the package is installed but the target file is absent", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-source-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-materialized-"));

    await writeSourcePackageConfirmation(
      runtimeLayout,
      createConfirmation("1.20.1")
    );
    await mkdir(join(sourceRoot, "net", "minecraft", "world", "block"), {
      recursive: true
    });
    await writeFile(
      join(sourceRoot, "net", "minecraft", "world", "block", "Block.java"),
      "package net.minecraft.world.block;\npublic class Block {}\n"
    );

    await expect(
      resolveVanillaSource({
        runtimeLayout,
        currentRuntime: createCurrentRuntime("1.20.1"),
        request: {
          symbol: "net.minecraft.world.item.ItemStack"
        },
        recipes: {
          "minecraft-1.20.1-source-pack-named": buildVanillaSourcePackCopyRecipe({
            minecraftVersion: "1.20.1",
            sourceRoot
          })
        },
        executeRecipe: buildLocalSourcePackageRecipeExecutor()
      })
    ).resolves.toMatchObject({
      status: "installed_but_no_match"
    });
  });

  it("returns install_validation_failed when install output is missing the manifest", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-source-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const invalidInstallPath = await mkdtemp(
      join(tmpdir(), "mcpskill-invalid-install-")
    );

    await writeSourcePackageConfirmation(
      runtimeLayout,
      createConfirmation("1.20.1")
    );

    await expect(
      resolveVanillaSource({
        runtimeLayout,
        currentRuntime: createCurrentRuntime("1.20.1"),
        request: {
          symbol: "net.minecraft.world.item.ItemStack"
        },
        recipes: {
          "minecraft-1.20.1-source-pack-named": buildVanillaSourcePackCopyRecipe({
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
      packageId: "minecraft-1.20.1-source-pack-named",
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

function createCurrentRuntime(minecraftVersion: string): CurrentRuntime {
  return {
    minecraftVersion,
    source: "workspace-detect",
    confidence: "high",
    evidenceSources: ["workspace-detect"],
    candidates: [],
    evidence: []
  };
}

function createConfirmation(
  minecraftVersion: string
): SourcePackageConfirmation {
  return {
    packageId: `minecraft-${minecraftVersion}-source-pack-named`,
    namespace: "minecraft",
    minecraftVersion,
    artifactType: "source-pack",
    variant: "named",
    scope: "package-version",
    approvedAt: "2026-04-24T02:00:00Z",
    source: "explicit-user-confirmation"
  };
}
