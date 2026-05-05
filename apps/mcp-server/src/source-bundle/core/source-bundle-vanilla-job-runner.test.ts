import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  buildFileQueuedSourceAcquisitionJobRunner,
  buildVanillaSourcePackCopyRecipe,
  writeSourcePackageConfirmation
} from "@mcpskill/source-package-manager";
import type { SourcePackageConfirmation } from "@mcpskill/shared-types";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";
import { buildMcpServerSourceBundleExecutor } from "./source-bundle-executor.js";

describe("source.bundle vanilla source acquisition jobs", () => {
  it("threads queued source acquisition job evidence through mc_develop", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-bundle-"));
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-materialized-"));
    const workspaceRoot = await createForgeWorkspace();
    const runtimeLayout = {
      root: runtimeRoot,
      downloads: join(runtimeRoot, "downloads"),
      installs: join(runtimeRoot, "installs"),
      locks: join(runtimeRoot, "locks")
    };

    await writeSourcePackageConfirmation(
      runtimeLayout,
      createConfirmation("1.20.1")
    );

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Inspect net.minecraft.world.item.ItemStack for this modpack."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "workspace_source"
    );

    if (!candidate) {
      throw new Error("workspace_source candidate missing");
    }

    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      recipes: {
        "minecraft-1.20.1-source-pack-named": buildVanillaSourcePackCopyRecipe({
          minecraftVersion: "1.20.1",
          sourceRoot
        })
      },
      executeRecipe: async () => {
        throw new Error("queued runner should not execute synchronously");
      },
      jobRunner: buildFileQueuedSourceAcquisitionJobRunner({
        jobId: "mcp-vanilla-source-job"
      })
    });

    await expect(
      executor({ candidate, evidencePlan, requestPlan })
    ).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "vanilla_source",
        result: {
          status: "backend_missing",
          acquisition: {
            status: "installing",
            sourceJobExecution: {
              status: "queued",
              jobId: "mcp-vanilla-source-job"
            }
          }
        }
      }
    });
  });
});

async function createForgeWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-forge-workspace-"));

  await mkdir(join(workspaceRoot, "src", "main", "java", "example"), {
    recursive: true
  });
  await writeFile(
    join(workspaceRoot, "build.gradle"),
    [
      'plugins { id "net.minecraftforge.gradle" }',
      "dependencies {",
      '  minecraft "net.minecraftforge:forge:1.20.1-47.2.0"',
      "}"
    ].join("\n")
  );

  return workspaceRoot;
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
