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

describe("source.bundle resource-pack profile", () => {
  it("uses a resource-pack profile for assets-only roots with pack metadata", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-resource-profile-");

    await writeText(
      join(workspaceRoot, "pack.mcmeta"),
      JSON.stringify({ pack: { pack_format: 15 } })
    );
    await writeText(join(workspaceRoot, "assets", "demo", "lang", "en_us.json"), "{}\n");

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "List local resource pack assets."
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
        resourcePackVersionProfile: {
          tokenPolicy: "compact_resource_profile",
          source: "pack_mcmeta_and_assets_runtime",
          supportLevel: "known_profile",
          packFormatStatus: "known",
          minecraftVersion: "1.20.1",
          packFormatId: "15",
          compatibleMinecraftVersions: [],
          assetKinds: ["lang"]
        }
      }
    });
    expect(result.payload).not.toHaveProperty("datapackVersionProfile");
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
