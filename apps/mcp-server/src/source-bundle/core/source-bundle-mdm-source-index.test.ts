import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { buildSourceIndex } from "@mcpskill/source-index";
import {
  buildLocalSourcePackageRecipeExecutor,
  buildVanillaSourcePackCopyRecipe,
  writeSourcePackageConfirmation
} from "@mcpskill/source-package-manager";
import type { SourcePackageConfirmation } from "@mcpskill/shared-types";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";
import { buildMcpServerSourceBundleExecutor } from "./source-bundle-executor.js";

describe("source.bundle MDM source index artifacts", () => {
  it("uses installed source index sqlite chunks when source files are not installed", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-source-index-runtime-"));
    const indexSourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-source-index-src-"));
    const installedSourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-empty-source-pack-"));
    const workspaceRoot = await createForgeWorkspace();
    const databasePath = join(runtimeRoot, "artifacts", "minecraft-1.20.1-source-index.sqlite");

    await mkdir(join(indexSourceRoot, "net", "minecraft", "world", "item"), {
      recursive: true
    });
    await mkdir(join(databasePath, ".."), { recursive: true });
    await writeFile(
      join(indexSourceRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
      [
        "package net.minecraft.world.item;",
        "public class ItemStack {",
        "  public ItemStack copy() { return this; }",
        "}"
      ].join("\n")
    );
    await buildSourceIndex({
      sourceRoot: indexSourceRoot,
      databasePath,
      packageId: "minecraft-1.20.1-source-index"
    });
    await writeSourcePackageConfirmation(runtimeLayout(runtimeRoot), createConfirmation("1.20.1"));

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Read net.minecraft.world.item.ItemStack from vanilla sources."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      sourceIndexDatabasePaths: [databasePath],
      recipes: {
        "minecraft-1.20.1-source-pack-named": buildVanillaSourcePackCopyRecipe({
          minecraftVersion: "1.20.1",
          sourceRoot: installedSourceRoot
        })
      },
      executeRecipe: buildLocalSourcePackageRecipeExecutor()
    });

    await expect(
      executor({
        candidate: getWorkspaceSourceCandidate(evidencePlan),
        evidencePlan,
        requestPlan
      })
    ).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "vanilla_source",
        result: {
          status: "ready",
          references: [
            {
              relativePath: "net/minecraft/world/item/ItemStack.java",
              reason: "indexed vanilla source chunk match",
              content: expect.stringContaining("public class ItemStack")
            }
          ]
        }
      }
    });
  });

  it("uses source index sqlite chunks before requiring source-pack confirmation", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-source-index-runtime-"));
    const indexSourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-source-index-src-"));
    const workspaceRoot = await createForgeWorkspace();
    const databasePath = join(runtimeRoot, "artifacts", "minecraft-1.20.1-source-index.sqlite");

    await writeItemStackSourceIndex(indexSourceRoot, databasePath);

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Read net.minecraft.world.item.ItemStack from vanilla sources."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      sourceIndexDatabasePaths: [databasePath],
      executeRecipe: async () => {
        throw new Error("source-pack install should not run");
      }
    });

    await expect(
      executor({
        candidate: getWorkspaceSourceCandidate(evidencePlan),
        evidencePlan,
        requestPlan
      })
    ).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "vanilla_source",
        result: {
          status: "ready",
          references: [
            {
              reason: "indexed vanilla source chunk match",
              relativePath: "net/minecraft/world/item/ItemStack.java",
              content: expect.stringContaining("public class ItemStack")
            }
          ]
        }
      }
    });
  });
});

async function writeItemStackSourceIndex(
  indexSourceRoot: string,
  databasePath: string
): Promise<void> {
  await mkdir(join(indexSourceRoot, "net", "minecraft", "world", "item"), {
    recursive: true
  });
  await mkdir(join(databasePath, ".."), { recursive: true });
  await writeFile(
    join(indexSourceRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
    [
      "package net.minecraft.world.item;",
      "public class ItemStack {",
      "  public ItemStack copy() { return this; }",
      "}"
    ].join("\n")
  );
  await buildSourceIndex({
    sourceRoot: indexSourceRoot,
    databasePath,
    packageId: "minecraft-1.20.1-source-index"
  });
}

async function createForgeWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-forge-workspace-"));
  await writeFile(
    join(workspaceRoot, "build.gradle"),
    'dependencies { minecraft "net.minecraftforge:forge:1.20.1-47.2.0" }\n'
  );
  return workspaceRoot;
}

function runtimeLayout(root: string) {
  return {
    root,
    downloads: join(root, "downloads"),
    installs: join(root, "installs"),
    locks: join(root, "locks")
  };
}

function createConfirmation(minecraftVersion: string): SourcePackageConfirmation {
  return {
    packageId: `minecraft-${minecraftVersion}-source-pack-named`,
    namespace: "minecraft",
    minecraftVersion,
    artifactType: "source-pack",
    variant: "named",
    scope: "package-version",
    approvedAt: "2026-05-08T00:00:00Z",
    source: "explicit-user-confirmation"
  };
}

function getWorkspaceSourceCandidate(
  evidencePlan: ReturnType<typeof buildMcpServerEvidencePlan>
) {
  const candidate = evidencePlan.candidates.find(
    (entry) => entry.routeStep === "workspace_source"
  );
  if (!candidate) {
    throw new Error("workspace_source candidate missing");
  }
  return candidate;
}
