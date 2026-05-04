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

describe("source.bundle resource-pack item trace", () => {
  it("returns compact reference traces for local assets item definitions", async () => {
    const workspaceRoot = await createResourcePackWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Trace references for assets/demo/items/gear.json."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "datapack_files"
    );

    if (!candidate) {
      throw new Error("datapack_files candidate missing");
    }

    await expect(
      buildMcpServerSourceBundleExecutor({ runtimeRoot: "/tmp/mcpskill-runtime" })({
        candidate,
        evidencePlan,
        requestPlan
      })
    ).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "datapack_files",
        resourceReferenceTrace: {
          tokenPolicy: "explicit_trace",
          startPaths: ["assets/demo/items/gear.json"],
          referenceCount: 2,
          unresolvedCount: 0,
          references: [
            {
              fromPath: "assets/demo/items/gear.json",
              fromKind: "items",
              relation: "item_model",
              toPath: "assets/demo/models/item/gear.json",
              status: "resolved"
            },
            {
              fromPath: "assets/demo/models/item/gear.json",
              fromKind: "models",
              relation: "model_texture",
              toPath: "assets/demo/textures/item/gear.png",
              status: "resolved"
            }
          ],
          truncated: false
        }
      }
    });
  });
});

async function createResourcePackWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-resource-items-"));
  tempRoots.push(root);

  await writeText(
    join(root, "assets", "demo", "items", "gear.json"),
    "{\"model\":{\"type\":\"minecraft:model\",\"model\":\"demo:item/gear\"}}\n"
  );
  await writeText(
    join(root, "assets", "demo", "models", "item", "gear.json"),
    "{\"textures\":{\"layer0\":\"demo:item/gear\"}}\n"
  );
  await writeText(
    join(root, "assets", "demo", "textures", "item", "gear.png"),
    Buffer.from([0x89, 0x50, 0x4e, 0x47])
  );

  return root;
}

async function writeText(path: string, content: string | Buffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
