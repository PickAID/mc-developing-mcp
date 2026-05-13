import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerRequestPlan } from "../planning/request-plan.js";
import { buildMcpServerEvidencePlan } from "../evidence/evidence-plan.js";
import { executeMcpServerRequestHandler } from "./request-handler.js";
import { buildMcpServerSourceBundleExecutor } from "../../source-bundle/core/source-bundle-executor.js";

describe("executeMcpServerRequestHandler", () => {
  it("short-circuits after the first primary evidence candidate resolves the request", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot: resolveScenarioPath("modpack_kubejs")
      }
    });

    const evidencePlan = buildMcpServerEvidencePlan(
      buildMcpServerRequestPlan(
        bootstrap,
        "Add a KubeJS startup_scripts recipe for this modpack."
      )
    );
    const callOrder: string[] = [];

    const result = await executeMcpServerRequestHandler({
      evidencePlan,
      executors: {
        "context.query": ({ candidate }) => {
          callOrder.push(candidate.id);

          return {
            matched: candidate.routeStep === "probejs_types",
            summary: "Loaded ProbeJS declarations for the target recipe.",
            payload: {
              source: "probejs"
            }
          };
        }
      }
    });

    expect(callOrder).toEqual(["candidate-1-probejs_types"]);
    expect(result.selectedEvidence).toMatchObject({
      candidateId: "candidate-1-probejs_types",
      status: "selected",
      attempted: true,
      payload: {
        source: "probejs"
      }
    });
    expect(result.executions).toMatchObject([
      {
        candidateId: "candidate-1-probejs_types",
        status: "selected",
        attempted: true,
        summary: "Loaded ProbeJS declarations for the target recipe."
      },
      {
        candidateId: "candidate-2-docs_lookup",
        status: "skipped",
        attempted: false,
        summary:
          "Skipped because candidate-1-probejs_types already resolved the request."
      }
    ]);
    expect(result.trace).toEqual({
      routeSteps: ["probejs_types", "docs_lookup"],
      candidateIds: [
        "candidate-1-probejs_types",
        "candidate-2-docs_lookup"
      ],
      executedCandidateIds: ["candidate-1-probejs_types"],
      failedCandidateIds: [],
      skippedCandidateIds: ["candidate-2-docs_lookup"],
      docsSelectionCandidateIds: [],
      selectedDocsPackageIds: [],
      selectedCandidateId: "candidate-1-probejs_types",
      fallbackUsed: false
    });
  });

  it("continues through misses and failures before selecting fallback evidence", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot: resolveScenarioPath("modpack_external_crash")
      }
    });

    const evidencePlan = buildMcpServerEvidencePlan(
      buildMcpServerRequestPlan(
        bootstrap,
        "The server crashes on startup and latest.log shows an exception in a mod."
      )
    );
    const callOrder: string[] = [];

    const result = await executeMcpServerRequestHandler({
      evidencePlan,
      executors: {
        "workspace.analyze": ({ candidate }) => {
          callOrder.push(candidate.id);

          return {
            matched: false,
            summary: "latest.log did not isolate the offending mod."
          };
        },
        "source.bundle": ({ candidate }) => {
          callOrder.push(candidate.id);
          throw new Error("jar source unavailable");
        },
        "context.query": ({ candidate }) => {
          callOrder.push(candidate.id);
          if (candidate.routeStep === "external_mod_resolution") {
            return {
              matched: false,
              summary: "No external mod candidate matched the crash context."
            };
          }

          return {
            matched: true,
            summary: "Resolved against the offline docs index.",
            payload: {
              source: "docs",
              matchedVersion: "1.20.1"
            }
          };
        }
      }
    });

    expect(callOrder).toEqual([
      "candidate-1-log_files",
      "candidate-2-external_mod_resolution",
      "candidate-3-workspace_source",
      "candidate-4-docs_lookup"
    ]);
    expect(result.selectedEvidence).toMatchObject({
      candidateId: "candidate-4-docs_lookup",
      status: "fallback",
      attempted: true,
      payload: {
        source: "docs",
        matchedVersion: "1.20.1"
      }
    });
    expect(result.executions).toMatchObject([
      {
        candidateId: "candidate-1-log_files",
        status: "skipped",
        attempted: true,
        summary: "latest.log did not isolate the offending mod."
      },
      {
        candidateId: "candidate-2-external_mod_resolution",
        status: "skipped",
        attempted: true,
        summary: "No external mod candidate matched the crash context."
      },
      {
        candidateId: "candidate-3-workspace_source",
        status: "failed",
        attempted: true,
        summary: "Executor failed for source.bundle.",
        error: "jar source unavailable"
      },
      {
        candidateId: "candidate-4-docs_lookup",
        status: "fallback",
        attempted: true,
        summary: "Resolved against the offline docs index."
      }
    ]);
    expect(result.trace).toEqual({
      routeSteps: [
        "log_files",
        "external_mod_resolution",
        "workspace_source",
        "docs_lookup"
      ],
      candidateIds: [
        "candidate-1-log_files",
        "candidate-2-external_mod_resolution",
        "candidate-3-workspace_source",
        "candidate-4-docs_lookup"
      ],
      executedCandidateIds: [
        "candidate-1-log_files",
        "candidate-2-external_mod_resolution",
        "candidate-3-workspace_source",
        "candidate-4-docs_lookup"
      ],
      failedCandidateIds: ["candidate-3-workspace_source"],
      skippedCandidateIds: [
        "candidate-1-log_files",
        "candidate-2-external_mod_resolution"
      ],
      docsSelectionCandidateIds: ["candidate-4-docs_lookup"],
      selectedDocsPackageIds: [],
      selectedCandidateId: "candidate-4-docs_lookup",
      fallbackUsed: true
    });
    expect(result.executions[3]).toMatchObject({
      candidateId: "candidate-4-docs_lookup",
      docsSelection: {
        selections: [],
        trace: {
          rejectedPackages: expect.arrayContaining([
            {
              packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn",
              reason:
                "task intent crash_triage is outside the package intent scope"
            }
          ])
        }
      }
    });
  });

  it("attaches docs package selection trace when docs lookup resolves a KubeJS request", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot: resolveScenarioPath("modpack_kubejs")
      }
    });

    const evidencePlan = buildMcpServerEvidencePlan(
      buildMcpServerRequestPlan(
        bootstrap,
        "How should I place this startup_scripts recipe and use ProbeJS in 1.20.1?"
      )
    );
    const docsSelections = new Map<string, unknown>();

    const result = await executeMcpServerRequestHandler({
      evidencePlan,
      executors: {
        "context.query": ({ candidate, docsSelection }) => {
          docsSelections.set(candidate.id, docsSelection);

          if (candidate.routeStep === "probejs_types") {
            return {
              matched: false,
              summary: "ProbeJS declarations were insufficient for this question."
            };
          }

          return {
            matched: true,
            summary: "Resolved from the versioned CrychicDoc package.",
            payload: {
              packageIds:
                docsSelection?.selections.map((selection) => selection.packageId) ??
                []
            }
          };
        }
      }
    });

    expect(docsSelections.get("candidate-1-probejs_types")).toBeUndefined();
    expect(docsSelections.get("candidate-2-docs_lookup")).toMatchObject({
      selections: [
        {
          packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn"
        }
      ]
    });
    expect(result.selectedEvidence).toMatchObject({
      candidateId: "candidate-2-docs_lookup",
      status: "fallback",
      payload: {
        packageIds: ["crychicdoc-kubejs-1.20.1-course-zh-cn"]
      },
      docsSelection: {
        selections: [
          {
            packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn"
          }
        ]
      }
    });
    expect(result.executions[1]).toMatchObject({
      candidateId: "candidate-2-docs_lookup",
      docsSelection: {
        selections: [
          {
            packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn"
          }
        ]
      }
    });
    expect(result.trace).toEqual({
      routeSteps: ["probejs_types", "docs_lookup"],
      candidateIds: [
        "candidate-1-probejs_types",
        "candidate-2-docs_lookup"
      ],
      executedCandidateIds: [
        "candidate-1-probejs_types",
        "candidate-2-docs_lookup"
      ],
      failedCandidateIds: [],
      skippedCandidateIds: ["candidate-1-probejs_types"],
      docsSelectionCandidateIds: ["candidate-2-docs_lookup"],
      selectedDocsPackageIds: ["crychicdoc-kubejs-1.20.1-course-zh-cn"],
      selectedCandidateId: "candidate-2-docs_lookup",
      fallbackUsed: true
    });
  });

  it("does not mark docs packages as selected when docs lookup fails after selection", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot: resolveScenarioPath("modpack_kubejs")
      }
    });

    const evidencePlan = buildMcpServerEvidencePlan(
      buildMcpServerRequestPlan(
        bootstrap,
        "How should I place this startup_scripts recipe and use ProbeJS in 1.20.1?"
      )
    );
    let failingDocsSelection: unknown;

    const result = await executeMcpServerRequestHandler({
      evidencePlan,
      executors: {
        "context.query": ({ candidate, docsSelection }) => {
          if (candidate.routeStep === "probejs_types") {
            return {
              matched: false,
              summary: "ProbeJS declarations were insufficient for this question."
            };
          }

          failingDocsSelection = docsSelection;
          throw new Error("docs lookup backend failed");
        }
      }
    });

    expect(result.selectedEvidence).toBeUndefined();
    expect(result.executions[1]).toMatchObject({
      candidateId: "candidate-2-docs_lookup",
      status: "failed",
      attempted: true,
      summary: "Executor failed for context.query.",
      error: "docs lookup backend failed"
    });
    expect(result.executions[1].docsSelection).toBe(failingDocsSelection);
    expect(result.trace).toEqual({
      routeSteps: ["probejs_types", "docs_lookup"],
      candidateIds: [
        "candidate-1-probejs_types",
        "candidate-2-docs_lookup"
      ],
      executedCandidateIds: [
        "candidate-1-probejs_types",
        "candidate-2-docs_lookup"
      ],
      failedCandidateIds: ["candidate-2-docs_lookup"],
      skippedCandidateIds: ["candidate-1-probejs_types"],
      docsSelectionCandidateIds: ["candidate-2-docs_lookup"],
      selectedDocsPackageIds: [],
      selectedCandidateId: undefined,
      fallbackUsed: false
    });
  });

  it("stops at source.bundle when vanilla source requires confirmation", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-handler-runtime-"));
    const workspaceRoot = await createForgeWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: {
        workspaceRoot
      }
    });

    const evidencePlan = buildMcpServerEvidencePlan(
      buildMcpServerRequestPlan(
        bootstrap,
        "Inspect net.minecraft.world.item.ItemStack for this workspace."
      )
    );

    const result = await executeMcpServerRequestHandler({
      evidencePlan,
      executors: {
        "source.bundle": buildMcpServerSourceBundleExecutor({
          runtimeRoot,
          executeRecipe: async () => {
            throw new Error("should not run before confirmation");
          }
        }),
        "context.query": () => ({
          matched: true,
          summary: "This docs fallback should not run."
        })
      }
    });

    expect(result.selectedEvidence).toMatchObject({
      candidateId: "candidate-1-workspace_source",
      status: "selected",
      payload: {
        source: "vanilla_source",
        result: {
          status: "needs_confirmation",
          packageId: "minecraft-1.20.1-source-pack-named"
        }
      }
    });
    expect(result.executions).toMatchObject([
      {
        candidateId: "candidate-1-workspace_source",
        status: "selected",
        attempted: true
      },
      {
        candidateId: "candidate-2-docs_lookup",
        status: "skipped",
        attempted: false,
        summary:
          "Skipped because candidate-1-workspace_source already resolved the request."
      }
    ]);
  });
});

function resolveScenarioPath(name: string): string {
  return fileURLToPath(
    new URL(`../../../../../testdata/scenarios/${name}`, import.meta.url)
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
