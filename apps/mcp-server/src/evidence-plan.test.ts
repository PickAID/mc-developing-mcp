import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";

describe("buildMcpServerEvidencePlan", () => {
  it("assembles ProbeJS-first evidence candidates for KubeJS authoring requests", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot: resolveScenarioPath("modpack_kubejs")
      }
    });

    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Add a KubeJS startup_scripts recipe for this modpack."
    );

    expect(buildMcpServerEvidencePlan(requestPlan)).toMatchObject({
      appId: "mcp-server",
      candidates: [
        {
          id: "candidate-1-probejs_types",
          priority: 1,
          tier: "primary",
          routeStep: "probejs_types",
          provenance: "probejs_types",
          preferredTool: "context.query",
          estimatedCost: "low",
          reliability: "high",
          queryHint: "Add a KubeJS startup_scripts recipe for this modpack.",
          pathHints: [
            expect.stringContaining("testdata/scenarios/modpack_kubejs/.probejs"),
            expect.stringContaining(
              "testdata/scenarios/modpack_kubejs/kubejs/probe"
            )
          ]
        },
        {
          id: "candidate-2-docs_lookup",
          priority: 2,
          tier: "fallback",
          routeStep: "docs_lookup",
          provenance: "docs",
          preferredTool: "context.query",
          estimatedCost: "medium",
          reliability: "medium",
          queryHint: "Add a KubeJS startup_scripts recipe for this modpack.",
          pathHints: []
        }
      ],
      trace: {
        candidateIds: [
          "candidate-1-probejs_types",
          "candidate-2-docs_lookup"
        ],
        fallbackCandidateIds: ["candidate-2-docs_lookup"]
      }
    });
  });

  it("keeps crash triage log-first and docs as fallback evidence", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot: resolveScenarioPath("modpack_external_crash")
      }
    });

    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "The server crashes on startup and latest.log shows an exception in a mod."
    );

    expect(buildMcpServerEvidencePlan(requestPlan)).toMatchObject({
      appId: "mcp-server",
      candidates: [
        {
          id: "candidate-1-log_files",
          priority: 1,
          tier: "primary",
          routeStep: "log_files",
          provenance: "logs",
          preferredTool: "workspace.analyze",
          estimatedCost: "low",
          reliability: "high",
          pathHints: [
            expect.stringContaining(
              "testdata/scenarios/modpack_external_crash/logs/latest.log"
            )
          ]
        },
        {
          id: "candidate-2-workspace_source",
          priority: 2,
          tier: "primary",
          routeStep: "workspace_source",
          provenance: "workspace_source",
          preferredTool: "source.bundle",
          estimatedCost: "medium",
          reliability: "high",
          pathHints: [
            expect.stringContaining(
              "testdata/scenarios/modpack_external_crash/build.gradle"
            )
          ]
        },
        {
          id: "candidate-3-docs_lookup",
          priority: 3,
          tier: "fallback",
          routeStep: "docs_lookup",
          provenance: "docs",
          preferredTool: "context.query",
          estimatedCost: "medium",
          reliability: "medium"
        }
      ],
      trace: {
        routeSteps: ["log_files", "workspace_source", "docs_lookup"],
        fallbackCandidateIds: ["candidate-3-docs_lookup"]
      }
    });
  });

  it("adds mod archive content before docs for crash triage in modpacks", async () => {
    const workspaceRoot = await createModpackWithJar();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: { workspaceRoot }
    });

    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "The server crashes in com.example.problem.CrashHandler."
    );

    expect(buildMcpServerEvidencePlan(requestPlan)).toMatchObject({
      candidates: [
        {
          id: "candidate-1-log_files",
          routeStep: "log_files",
          provenance: "logs",
          preferredTool: "workspace.analyze"
        },
        {
          id: "candidate-2-mod_archive_content",
          routeStep: "mod_archive_content",
          provenance: "mod_archive_content",
          preferredTool: "context.query",
          pathHints: [expect.stringContaining("mods/content-mod.jar")]
        },
        {
          id: "candidate-3-workspace_source",
          routeStep: "workspace_source",
          provenance: "workspace_source"
        },
        {
          id: "candidate-4-docs_lookup",
          provenance: "docs"
        }
      ],
      trace: {
        routeSteps: [
          "log_files",
          "mod_archive_content",
          "workspace_source",
          "docs_lookup"
        ],
        fallbackCandidateIds: ["candidate-4-docs_lookup"]
      }
    });
  });

  it("marks net.minecraft requests as vanilla source evidence", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-evidence-plan-"));
    const workspaceRoot = await createForgeWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: {
        workspaceRoot
      }
    });

    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Inspect net.minecraft.world.item.ItemStack in this workspace."
    );

    expect(buildMcpServerEvidencePlan(requestPlan)).toMatchObject({
      candidates: [
        {
          id: "candidate-1-workspace_source",
          routeStep: "workspace_source",
          provenance: "vanilla_source",
          preferredTool: "source.bundle",
          reason:
            "Request targets net.minecraft.* and should resolve through version-bound vanilla source for Minecraft 1.20.1 before docs.",
          pathHints: [
            "vanilla-source-pack:minecraft:1.20.1:named",
            expect.stringContaining("build.gradle")
          ]
        },
        {
          id: "candidate-2-docs_lookup",
          provenance: "docs"
        }
      ]
    });
  });
});

function resolveScenarioPath(name: string): string {
  return fileURLToPath(
    new URL(`../../../testdata/scenarios/${name}`, import.meta.url)
  );
}

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

async function createModpackWithJar(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-modpack-"));

  await mkdir(join(workspaceRoot, "mods"), { recursive: true });
  await mkdir(join(workspaceRoot, "logs"), { recursive: true });
  await writeFile(join(workspaceRoot, "mods", "content-mod.jar"), "");
  await writeFile(join(workspaceRoot, "logs", "latest.log"), "CrashHandler\n");

  return workspaceRoot;
}
