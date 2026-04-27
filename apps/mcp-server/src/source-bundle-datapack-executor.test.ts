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
