import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";
import { buildMcpServerSourceBundleExecutor } from "./source-bundle-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("source.bundle datapack version profile", () => {
  it("adds compact datapack version profile evidence to local datapack payloads", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-datapack-profile-");

    await writeText(
      join(workspaceRoot, "pack.mcmeta"),
      JSON.stringify({ pack: { pack_format: 15 } })
    );
    await writeText(join(workspaceRoot, "data", "demo", "recipes", "gear.json"), "{}\n");

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "List local datapack evidence and version profile."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "datapack_files"
    );

    if (!candidate) {
      throw new Error("datapack_files candidate missing");
    }

    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      executeRecipe: async () => {
        throw new Error("vanilla recipe should not run");
      }
    });

    await expect(
      executor({
        candidate,
        evidencePlan,
        requestPlan
      })
    ).resolves.toMatchObject({
      matched: true,
      payload: {
        datapackVersionProfile: {
          tokenPolicy: "compact_profile",
          source: "pack_mcmeta_and_runtime",
          minecraftVersion: "1.20.1",
          packFormat: 15,
          packFormatId: "15",
          supportLevel: "known_profile",
          semanticValidation: "not_available"
        }
      }
    });
  });

  it("includes supported pack format ranges in compact datapack profiles", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-datapack-range-");

    await writeText(
      join(workspaceRoot, "pack.mcmeta"),
      JSON.stringify({
        pack: {
          pack_format: 15,
          supported_formats: [15, 34]
        }
      })
    );
    await writeText(join(workspaceRoot, "data", "demo", "recipes", "gear.json"), "{}\n");

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "List local datapack evidence and supported pack formats."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "datapack_files"
    );

    if (!candidate) {
      throw new Error("datapack_files candidate missing");
    }

    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      executeRecipe: async () => {
        throw new Error("vanilla recipe should not run");
      }
    });

    await expect(
      executor({
        candidate,
        evidencePlan,
        requestPlan
      })
    ).resolves.toMatchObject({
      payload: {
        datapackVersionProfile: {
          tokenPolicy: "compact_profile",
          packFormat: 15,
          supportedFormats: {
            minInclusive: 15,
            maxInclusive: 34,
            minFormat: { id: "15" },
            maxFormat: { id: "34.*" }
          },
          compatibleMinecraftVersions: [
            "1.20",
            "1.20.1",
            "1.20.2",
            "1.20.3",
            "1.20.4"
          ]
        }
      }
    });
  });

  it("adds pack-format migration analysis when the request names source and target versions", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-datapack-migration-");

    await writeText(
      join(workspaceRoot, "pack.mcmeta"),
      JSON.stringify({ pack: { pack_format: 15 } })
    );
    await writeText(join(workspaceRoot, "data", "demo", "recipes", "gear.json"), "{}\n");

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Analyze datapack migration from 1.20.1 to 1.21.1."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "datapack_files"
    );

    if (!candidate) {
      throw new Error("datapack_files candidate missing");
    }

    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      executeRecipe: async () => {
        throw new Error("vanilla recipe should not run");
      }
    });

    await expect(
      executor({
        candidate,
        evidencePlan,
        requestPlan
      })
    ).resolves.toMatchObject({
      payload: {
        datapackMigrationAnalysis: {
          tokenPolicy: "compact_migration",
          status: "ready",
          direction: "upgrade",
          compatibility: "pack_format_changed",
          from: {
            minecraftVersion: "1.20.1",
            packFormatId: "15"
          },
          to: {
            minecraftVersion: "1.21.1",
            packFormatId: "48"
          },
          packFormatChange: {
            fromPackFormatId: "15",
            toPackFormatId: "48",
            numericDelta: 33
          },
          requiredActions: [
            {
              kind: "update_pack_format",
              summary: "Update pack.mcmeta pack.pack_format from 15 to 48."
            }
          ],
          riskHints: [
            {
              kind: "recipes",
              severity: "medium"
            }
          ]
        }
      }
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
