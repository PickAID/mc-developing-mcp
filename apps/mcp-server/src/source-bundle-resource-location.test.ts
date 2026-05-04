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

describe("source.bundle resource-location metadata", () => {
  it("resolves loose asset entries by resource location metadata", async () => {
    const workspaceRoot = await createWorkspace();
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Find local resource assets for demo:item/gear."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "datapack_files"
    );

    if (!candidate) {
      throw new Error("datapack_files candidate missing");
    }

    const result = await buildMcpServerSourceBundleExecutor({ runtimeRoot })({
      candidate,
      evidencePlan,
      requestPlan
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "datapack_files",
        queries: ["demo:item/gear"],
        matches: [
          { file: { relativePath: "assets/demo/items/gear.json" } },
          { file: { relativePath: "assets/demo/models/item/gear.json" } },
          { file: { relativePath: "assets/demo/textures/item/gear.png" } }
        ]
      }
    });
    expect(JSON.stringify(result.payload?.resourceSummary)).not.toContain(
      "assets/demo"
    );
  });
});

async function createWorkspace(): Promise<string> {
  const root = await createTempRoot("mcpskill-resource-location-");

  await writeText(join(root, "assets", "demo", "items", "gear.json"), "{}\n");
  await writeText(
    join(root, "assets", "demo", "models", "item", "gear.json"),
    "{}\n"
  );
  await writeText(
    join(root, "assets", "demo", "textures", "item", "gear.png"),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])
  );
  await writeText(join(root, "assets", "demo", "models", "item", "other.json"), "{}\n");
  return root;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string | Buffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
