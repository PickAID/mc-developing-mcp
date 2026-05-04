import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";

describe("buildMcpServerEvidencePlan resource-pack evidence", () => {
  it("marks vanilla asset requests as generated vanilla assets evidence", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-evidence-plan-"));
    const workspaceRoot = await createForgeWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Read the vanilla official asset assets/minecraft/models/item/stone.json"
    );

    expect(buildMcpServerEvidencePlan(requestPlan)).toMatchObject({
      candidates: [
        {
          id: "candidate-1-datapack_files",
          routeStep: "datapack_files",
          provenance: "resource_pack_files",
          preferredTool: "source.bundle",
          reason:
            "Request targets generated vanilla assets evidence for Minecraft 1.20.1 before docs.",
          pathHints: ["vanilla-assets-package:minecraft:1.20.1:official"]
        },
        {
          id: "candidate-2-docs_lookup",
          provenance: "docs"
        }
      ]
    });
  });

  it("marks local assets paths as resource-pack file evidence", async () => {
    const workspaceRoot = await createResourcePackWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: { workspaceRoot }
    });

    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Trace references for assets/demo/blockstates/gear.json."
    );

    expect(buildMcpServerEvidencePlan(requestPlan)).toMatchObject({
      requestPlan: {
        trace: {
          taskIntent: {
            id: "resource_pack_lookup"
          }
        }
      },
      candidates: [
        {
          id: "candidate-1-datapack_files",
          routeStep: "datapack_files",
          provenance: "resource_pack_files",
          preferredTool: "source.bundle",
          reason: "Inspect resource-pack assets before secondary docs.",
          pathHints: [workspaceRoot]
        },
        {
          id: "candidate-2-docs_lookup",
          provenance: "docs"
        }
      ]
    });
  });

  it("marks client visual datapack_files candidates as resource-pack visual evidence", async () => {
    const workspaceRoot = await createClientVisualWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: { workspaceRoot }
    });

    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Fix the custom block client visual model using assets/demo/models/block/gear.json and blockstates."
    );

    expect(buildMcpServerEvidencePlan(requestPlan)).toMatchObject({
      requestPlan: {
        trace: {
          taskIntent: {
            id: "client_visual_resources"
          }
        }
      },
      candidates: expect.arrayContaining([
        expect.objectContaining({
          routeStep: "datapack_files",
          provenance: "resource_pack_files",
          preferredTool: "source.bundle",
          reason:
            "Inspect resource-pack assets, models, blockstates, textures, and client visual evidence before docs.",
          pathHints: [workspaceRoot]
        })
      ])
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

async function createResourcePackWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-resource-pack-"));

  await mkdir(join(workspaceRoot, "assets", "demo", "blockstates"), {
    recursive: true
  });
  await writeFile(
    join(workspaceRoot, "assets", "demo", "blockstates", "gear.json"),
    "{\"variants\":{}}\n"
  );

  return workspaceRoot;
}

async function createClientVisualWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-client-visual-"));

  await mkdir(join(workspaceRoot, "assets", "demo", "models", "block"), {
    recursive: true
  });
  await mkdir(join(workspaceRoot, "assets", "demo", "blockstates"), {
    recursive: true
  });
  await writeFile(
    join(workspaceRoot, "assets", "demo", "models", "block", "gear.json"),
    "{\"parent\":\"minecraft:block/cube_all\"}\n"
  );
  await writeFile(
    join(workspaceRoot, "assets", "demo", "blockstates", "gear.json"),
    "{\"variants\":{}}\n"
  );

  return workspaceRoot;
}
