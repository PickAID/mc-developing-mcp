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

describe("source.bundle datapack execution", () => {
  it("searches local datapack files for resource locations before docs", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-datapack-workspace-");

    await writeText(
      join(workspaceRoot, "data", "demo", "recipes", "gear.json"),
      '{ "type": "minecraft:crafting_shaped", "result": "demo:gear" }\n'
    );

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Find the datapack recipe for demo:gear before checking docs."
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
        source: "datapack_files",
        queries: ["demo:gear"],
        discovery: {
          namespaces: ["demo"],
          dataKinds: ["recipes"]
        },
        matches: [
          {
            file: {
              relativePath: "data/demo/recipes/gear.json",
              domain: "data",
              kind: "recipes",
              namespace: "demo"
            },
            preview: '{ "type": "minecraft:crafting_shaped", "result": "demo:gear" }'
          }
        ]
      }
    });
  });

  it("includes compact data and asset summaries for local resource roots", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-resource-workspace-");

    await writeText(join(workspaceRoot, "pack.mcmeta"), "{}\n");
    await writeText(join(workspaceRoot, "data", "demo", "recipes", "gear.json"), "{}\n");
    await writeText(join(workspaceRoot, "assets", "demo", "items", "gear.json"), "{}\n");
    await writeText(
      join(workspaceRoot, "assets", "demo", "models", "item", "gear.json"),
      "{}\n"
    );

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "List local datapack and resource asset evidence."
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
        source: "datapack_files",
        resourceSummary: {
          tokenPolicy: "counts_only",
          rootCount: 1,
          entryCount: 4,
          byDomain: {
            assets: 3,
            data: 1
          },
          byKind: {
            items: 1,
            models: 1,
            pack_metadata: 1,
            recipes: 1
          }
        }
      }
    });
  });

  it("traces explicit resource asset references without adding paths to the summary", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-resource-trace-");

    await writeText(join(workspaceRoot, "pack.mcmeta"), "{}\n");
    await writeText(
      join(workspaceRoot, "assets", "demo", "blockstates", "gear.json"),
      JSON.stringify({ variants: { "": { model: "demo:block/gear" } } })
    );
    await writeText(
      join(workspaceRoot, "assets", "demo", "models", "block", "gear.json"),
      JSON.stringify({ textures: { all: "demo:block/gear" } })
    );
    await writeText(
      join(workspaceRoot, "assets", "demo", "textures", "block", "gear.png"),
      Buffer.from([1, 2, 3])
    );

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Trace local datapack resource references for assets/demo/blockstates/gear.json."
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

    const result = await executor({
      candidate,
      evidencePlan,
      requestPlan
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "datapack_files",
        resourceSummary: {
          tokenPolicy: "counts_only"
        },
        resourceReferenceTrace: {
          tokenPolicy: "explicit_trace",
          startPaths: ["assets/demo/blockstates/gear.json"],
          referenceCount: 2,
          unresolvedCount: 0,
          references: [
            {
              fromPath: "assets/demo/blockstates/gear.json",
              relation: "blockstate_model",
              toPath: "assets/demo/models/block/gear.json",
              status: "resolved"
            },
            {
              fromPath: "assets/demo/models/block/gear.json",
              relation: "model_texture",
              toPath: "assets/demo/textures/block/gear.png",
              status: "resolved"
            }
          ],
          truncated: false
        }
      }
    });
    expect(result.payload?.resourceSummary).not.toHaveProperty("files");
    expect(result.payload?.resourceSummary).not.toHaveProperty("references");
  });
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));

  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string | Buffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
