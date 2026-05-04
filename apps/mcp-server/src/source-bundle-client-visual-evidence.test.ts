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

describe("source.bundle client visual evidence", () => {
  it("returns a compact registry-to-asset evidence packet for visual resources", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createVisualWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Wire the block entity renderer, blockstate, model registration, and client init for demo:block/gear."
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
        matches: [
          { file: { relativePath: "assets/demo/blockstates/block/gear.json" } },
          { file: { relativePath: "assets/demo/models/block/gear.json" } },
          { file: { relativePath: "assets/demo/textures/block/gear.png" } }
        ],
        clientVisualEvidence: {
          intent: "client_visual_resources",
          workspaceEvidence: {
            hasJavaSource: true,
            hasResourcePack: true
          },
          sourceEvidence: {
            candidateRegistries: 0,
            candidateRendererBindings: 0
          },
          assetEvidence: {
            namespaces: ["demo"],
            byKind: {
              blockstates: 1,
              models: 1,
              textures: 1
            },
            binaryContentReturned: false
          },
          registryToAssetSummary: {
            requestedResourceLocations: ["demo:block/gear"],
            matchedAssetPaths: [
              "assets/demo/blockstates/block/gear.json",
              "assets/demo/models/block/gear.json",
              "assets/demo/textures/block/gear.png"
            ],
            missingAssetKinds: []
          },
          missingEvidence: [
            "source registry scan not implemented",
            "renderer binding scan not implemented"
          ],
          nextReads: [
            "assets/demo/blockstates/block/gear.json",
            "assets/demo/models/block/gear.json"
          ]
        }
      }
    });
  });
});

async function createVisualWorkspace(): Promise<string> {
  const root = await createTempRoot("mcpskill-client-visual-");

  await writeText(join(root, "build.gradle"), "plugins { id 'java' }\n");
  await writeText(join(root, "src", "main", "java", "demo", "VisualBlock.java"), "\n");
  await writeText(join(root, "assets", "demo", "blockstates", "block", "gear.json"), "{}\n");
  await writeText(join(root, "assets", "demo", "models", "block", "gear.json"), "{}\n");
  await writeText(
    join(root, "assets", "demo", "textures", "block", "gear.png"),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])
  );

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
