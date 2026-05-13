import { describe, expect, it } from "vitest";

import { buildMcpDevelopStructuredContent } from "./mcp-structured-content.js";
import type { McpServerRequestExecutorResult } from "../../request/execution/request-executor.js";

describe("buildMcpDevelopStructuredContent", () => {
  it("keeps structured output bounded while preserving route and selected evidence", () => {
    const result = createExecutorResult();
    const content = buildMcpDevelopStructuredContent(result, {
      maxArrayItems: 2,
      maxStringLength: 24,
      maxDepth: 6
    });

    expect(content).not.toHaveProperty("requestPlan");
    expect(content).not.toHaveProperty("evidencePlan");
    expect(content).toMatchObject({
      appId: "mcp-server",
      promptGuidance: {
        policy: "bounded_active_prompt_fragments",
        activeFragmentIds: [
          "workspace_summary",
          "task_evidence_policy",
          "task_kubejs_scripting_policy"
        ]
      },
      trace: {
        selectedCandidateId: "candidate-2-probejs_types"
      },
      budget: {
        payloadPolicy: "bounded",
        truncatedExecutionIds: [
          "candidate-1-log_files",
          "candidate-2-probejs_types"
        ]
      }
    });
    expect(content.executions).toHaveLength(2);
    expect(content.executions[0]).toMatchObject({
      candidateId: "candidate-1-log_files",
      payload: {
        signals: {
          actionableClassReferences: [
            "com.example.First",
            "com.example.Second"
          ]
        }
      },
      payloadBudget: {
        truncated: true,
        omittedArrayItems: 2,
        truncatedStrings: 0
      }
    });
    expect(content.selectedEvidence).toMatchObject({
      candidateId: "candidate-2-probejs_types",
      payload: {
        snippets: [
          { label: "server.recipes" },
          { label: "event.shaped" }
        ],
        documentation:
          "This ProbeJS documentati...<truncated 55 chars>"
      },
      payloadBudget: {
        truncated: true,
        omittedArrayItems: 1,
        truncatedStrings: 1
      }
    });
  });

  it("exposes bounded domain guidance without returning the full request plan", () => {
    const content = buildMcpDevelopStructuredContent(createExecutorResult(), {
      maxStringLength: 64
    });

    expect(content).not.toHaveProperty("requestPlan");
    expect(content.promptGuidance).toMatchObject({
      policy: "bounded_active_prompt_fragments",
      activeFragmentIds: expect.arrayContaining([
        "task_evidence_policy",
        "task_kubejs_scripting_policy"
      ]),
      exposedFragments: [
        {
          id: "task_evidence_policy",
          text: expect.stringContaining("prefer local evidence")
        },
        {
          id: "task_kubejs_scripting_policy",
          text: expect.stringContaining("KubeJS policy")
        }
      ]
    });
    expect(
      JSON.stringify((content.promptGuidance as any).exposedFragments)
    ).not.toContain("workspace_summary");
  });

  it("omits undefined payload fields instead of stringifying them", () => {
    const result = createExecutorResult({
      payload: {
        source: "workspace_analyze",
        mode: "java_diagnostics",
        files: [
          {
            uri: "file:///workspace/Broken.java",
            diagnostics: [
              {
                message: "RegistryObject cannot be resolved",
                code: undefined
              }
            ]
          }
        ]
      }
    });
    const content = buildMcpDevelopStructuredContent(result);

    expect(
      JSON.stringify(content.selectedEvidence)
    ).not.toContain('"undefined"');
    expect(content.selectedEvidence).toMatchObject({
      payload: {
        files: [
          {
            diagnostics: [
              {
                message: "RegistryObject cannot be resolved"
              }
            ]
          }
        ]
      }
    });
  });

  it("does not apply generic array caps to ProbeJS resource entries", () => {
    const itemEntries = Array.from({ length: 25 }, (_, index) => ({
      sourceKind: "item",
      extractorId: "probejs-line-list-v1",
      sourceFormat: "text-line-list",
      confidence: 0.75,
      name: `example:item_${index}`,
      value: `example:item_${index}`,
      file: "kubejs/probejs/items/example.txt"
    }));
    const result = createExecutorResult({
      payload: {
        source: "probejs_resources",
        queryMode: "resource_summary",
        probeResources: {
          summary: {
            counts: { item: 25 },
            totalCounts: { item: 25 },
            truncated: false
          },
          entries: {
            item: itemEntries,
            snippet: [],
            recipe: [],
            registry: [],
            fluid: [],
            tag: [],
            language_key: [],
            class: []
          },
          unknownResources: []
        }
      }
    });

    const content = buildMcpDevelopStructuredContent(result);

    expect(
      (content.selectedEvidence as any).payload.probeResources.entries.item
    ).toHaveLength(25);
    expect((content.selectedEvidence as any).payloadBudget).toBeUndefined();
    expect((content.budget as any).truncatedExecutionIds).toEqual([]);
  });

  it("promotes source acquisition capability guidance to top-level workspace preparation", () => {
    const result = createExecutorResult({
      candidateId: "candidate-1-source_acquisition_plan",
      routeStep: "source_acquisition_plan",
      summary: "Planned 2 source acquisition routes.",
      payload: {
        source: "source_acquisition_plan",
        requiresWorkspace: false,
        capabilityGuidance: {
          nextActions: ["populate Gradle dependency caches"],
          capabilityMap: {
            mode: "progressive_discovery",
            recommendedRouteOrder: ["runtime_cache", "local_jar"],
            routeCapabilities: [
              {
                origin: "runtime_cache",
                status: "ready",
                useFor: ["offline packages", "SQLite indexes"]
              },
              {
                origin: "local_jar",
                status: "ready",
                useFor: ["local mod classes"],
                nextAction: "inspect cached jar entries"
              }
            ]
          }
        },
        routes: [{ origin: "runtime_cache" }, { origin: "local_jar" }],
        workItems: [{ kind: "jar_index", sourceArchive: "/private/mods/demo.jar" }],
        sourceIndexPreview: {
          query: "ItemStack",
          searchedDatabaseCount: 1,
          matches: [{ path: "net/minecraft/world/item/ItemStack.java" }]
        },
        workItemExecutionStatus: "partial",
        workItemExecutions: [
          {
            kind: "workspace_gradle_dependencies",
            status: "completed",
            payload: {
              source: "workspace_gradle",
              dependencyCount: 2,
              repositoryCount: 1,
              declaredDependencySourceArchiveCount: 1,
              declaredDependencyBinaryArchiveCount: 1,
              gradleCacheSourceArchiveCount: 1,
              gradleCacheBinaryArchiveCount: 1,
              declaredDependencySourceArchives: [{ archivePath: "/gradle/demo-sources.jar" }],
              declaredDependencyBinaryArchives: [{ archivePath: "/gradle/demo.jar" }],
              gradleCacheSourceArchives: [{ archivePath: "/gradle-cache/cache-sources.jar" }],
              gradleCacheBinaryArchives: [{ archivePath: "/gradle-cache/cache-slim.jar" }]
            }
          },
          {
            kind: "workspace_probejs_types",
            status: "completed",
            payload: {
              probeResources: {
                summary: {
                  counts: { item: 2, recipe: 1 },
                  totalCounts: { item: 20, recipe: 4 }
                }
              }
            }
          },
          {
            kind: "jar_index",
            status: "completed",
            summary: "Indexed local jar.",
            payload: {
              source: "source_acquisition_jar_index",
              mode: "prewarm_entry_index",
              archiveCount: 1,
              entryCount: 3,
              cache: { archiveHits: 1, archiveMisses: 0 },
              rawLargePayloadShouldNotBeCopied: "x".repeat(100)
            }
          },
          {
            kind: "java_diagnostics",
            status: "completed",
            payload: {
              source: "workspace_analyze",
              mode: "java_diagnostics",
              totalDiagnostics: 1,
              files: [
                {
                  relativePath: "src/main/java/example/Broken.java",
                  diagnostics: [{
                    message: "RegistryObject cannot be resolved",
                    range: { start: { line: 11, character: 4 } }
                  }]
                }
              ]
            }
          }
        ]
      }
    });
    result.requestPlan.trace.selectedPromptFragmentIds = ["task_evidence_policy", "task_workspace_preparation_policy"];
    result.requestPlan.requestContext.taskBrief.promptFragments.push({
      id: "task_workspace_preparation_policy",
      text: "Workspace preparation policy: report ready routes, missing prerequisites, and concrete next actions."
    });

    const content = buildMcpDevelopStructuredContent(result);

    expect(content.workspacePreparation).toMatchObject({
      source: "source_acquisition_plan",
      status: "partial",
      candidateId: "candidate-1-source_acquisition_plan",
      requiresWorkspace: false,
      capabilityGuidance: {
        nextActions: ["populate Gradle dependency caches"]
      },
      capabilityMap: {
        mode: "progressive_discovery",
        recommendedRouteOrder: ["runtime_cache", "local_jar"]
      },
      workflow: {
        model: "catalog_inspect_execute",
        catalog: {
          routeCount: 2,
          recommendedRouteOrder: ["runtime_cache", "local_jar"],
          readyOrigins: ["runtime_cache", "local_jar"]
        },
        inspect: expect.arrayContaining([
          expect.objectContaining({
            origin: "local_jar",
            detailLocation: "executions[].payload.workItemExecutions",
            workItemKinds: ["jar_index"],
            useFor: ["local mod classes"]
          }),
          expect.objectContaining({
            origin: "runtime_cache",
            detailLocation: "executions[].payload.sourceIndexPreview"
          })
        ]),
        execute: expect.arrayContaining([
          expect.objectContaining({
            id: "prepare_local_jar",
            origin: "local_jar",
            safety: "local_read_only",
            inputPatch: { preparationRoutes: ["local_jar"] }
          }),
          expect.objectContaining({
            id: "prewarm_local_jar_entry_index",
            origin: "local_jar",
            safety: "local_background_cache",
            inputPatch: {
              preparationRoutes: ["local_jar"],
              preparationPolicy: { localJarMode: "prewarm_entry_index" }
            }
          }),
          expect.objectContaining({
            id: "inspect_source_index_preview",
            origin: "runtime_cache",
            safety: "read_only"
          }),
          expect.objectContaining({
            id: "inspect_runtime_cache_evidence",
            origin: "runtime_cache",
            safety: "read_only",
            inputPatch: { preparationRoutes: ["runtime_cache"] }
          })
        ]),
        decisionRules: expect.arrayContaining([
          expect.stringContaining("Prefer inspect actions"),
          expect.stringContaining("Run local_background_cache")
        ]),
        nextCallPatterns: expect.arrayContaining([
          expect.objectContaining({
            when: expect.stringContaining("Need more evidence"),
            call: "mc_develop",
            inputPatch: { preparationRoutes: ["runtime_cache"] }
          }),
          expect.objectContaining({
            when: expect.stringContaining("Crash triage"),
            inputPatch: {
              preparationRoutes: ["local_jar"],
              preparationPolicy: { localJarMode: "prewarm_entry_index" }
            }
          })
        ])
      },
      evidenceSummary: {
        gradle: {
          dependencyCount: 2,
          repositoryCount: 1,
          declaredSourceArchiveCount: 1,
          declaredBinaryArchiveCount: 1,
          gradleCacheSourceArchiveCount: 1,
          gradleCacheBinaryArchiveCount: 1,
          sourceArchiveCount: 2,
          binaryArchiveCount: 2,
          declaredSourceArchives: ["/gradle/demo-sources.jar"],
          declaredBinaryArchives: ["/gradle/demo.jar"],
          gradleCacheSourceArchives: ["/gradle-cache/cache-sources.jar"],
          gradleCacheBinaryArchives: ["/gradle-cache/cache-slim.jar"],
          sourceArchives: ["/gradle/demo-sources.jar", "/gradle-cache/cache-sources.jar"],
          binaryArchives: ["/gradle/demo.jar", "/gradle-cache/cache-slim.jar"]
        },
        probejs: {
          counts: { item: 2, recipe: 1 },
          totalCounts: { item: 20, recipe: 4 }
        },
        localJar: {
          mode: "prewarm_entry_index",
          archiveCount: 1,
          entryCount: 3,
          cache: { archiveHits: 1, archiveMisses: 0 }
        },
        sourceIndex: {
          query: "ItemStack",
          matchCount: 1,
          topPaths: ["net/minecraft/world/item/ItemStack.java"]
        },
        javaDiagnostics: {
          totalDiagnostics: 1,
          firstLocation: "src/main/java/example/Broken.java:12:5",
          firstMessage: "RegistryObject cannot be resolved"
        }
      }
    });
    expect(content.promptGuidance).toMatchObject({
      exposedFragments: expect.arrayContaining([
        {
          id: "task_workspace_preparation_policy",
          text: expect.stringContaining("report ready routes")
        }
      ])
    });
    expect(JSON.stringify(content.workspacePreparation)).not.toContain(
      "rawLargePayloadShouldNotBeCopied"
    );
  });

});

function createExecutorResult(
  overrides: Partial<McpServerRequestExecutorResult["executions"][number]> = {}
): McpServerRequestExecutorResult {
  const contextExecution = {
    candidateId: "candidate-1-log_files",
    routeStep: "log_files",
    provenance: "workspace",
    preferredTool: "workspace.analyze",
    tier: "primary",
    pathHints: ["/tmp/modpack/logs/latest.log"],
    queryHint: "latest.log",
    attempted: true,
    status: "context",
    summary: "Extracted class references.",
    payload: {
      source: "workspace_analyze",
      signals: {
        actionableClassReferences: [
          "com.example.First",
          "com.example.Second",
          "com.example.Third",
          "com.example.Fourth"
        ]
      }
    }
  };
  const selectedExecution = {
    candidateId: "candidate-2-probejs_types",
    routeStep: "probejs_types",
    provenance: "workspace",
    preferredTool: "context.query",
    tier: "primary",
    pathHints: ["/tmp/modpack/.probe/server/probe.d.ts"],
    queryHint: "recipes",
    attempted: true,
    status: "selected",
    summary: "Found ProbeJS snippets.",
    payload: overrides.payload ?? {
      source: "probejs_types",
      snippets: [
        { label: "server.recipes" },
        { label: "event.shaped" },
        { label: "event.remove" }
      ],
      documentation:
        "This ProbeJS documentation block is intentionally long and should be truncated."
    },
    ...overrides
  };

  return {
    appId: "mcp-server",
    requestPlan: {
      requestText: "How do I fix this KubeJS recipe crash?",
      requestContext: {
        taskBrief: {
          promptFragments: [
            {
              id: "workspace_summary",
              text: "Workspace summary should stay internal here."
            },
            {
              id: "task_evidence_policy",
              text: "Evidence policy: prefer local evidence before docs."
            },
            {
              id: "task_kubejs_scripting_policy",
              text:
                "KubeJS policy: use ProbeJS/d.ts evidence and avoid generic JavaScript assumptions."
            }
          ]
        },
        harnessSnapshot: {
          workspaceRoot: "/tmp/modpack",
          workspaceKind: "modpack",
          currentRuntime: {
            source: "unknown",
            confidence: "unknown",
            evidenceSources: [],
            candidates: [],
            evidence: []
          },
          facts: {
            hasGradle: false,
            hasJavaSource: false,
            hasKubeJS: true,
            hasProbeJS: true,
            hasModArchives: true,
            hasDatapack: false,
            buildFileCount: 0,
            javaSourceRootCount: 0,
            datapackRootCount: 0,
            logPathCount: 1
          }
        }
      }
      ,
      trace: {
        taskIntent: {
          id: "kubejs_authoring",
          confidence: "high",
          reasons: []
        },
        selectedPromptFragmentIds: [
          "workspace_summary",
          "task_evidence_policy",
          "task_kubejs_scripting_policy"
        ]
      }
    },
    evidencePlan: {} as McpServerRequestExecutorResult["evidencePlan"],
    executions: [contextExecution, selectedExecution],
    selectedEvidence: selectedExecution,
    trace: {
      routeSteps: ["log_files", "probejs_types"],
      candidateIds: ["candidate-1-log_files", "candidate-2-probejs_types"],
      executedCandidateIds: [
        "candidate-1-log_files",
        "candidate-2-probejs_types"
      ],
      contextCandidateIds: ["candidate-1-log_files"],
      failedCandidateIds: [],
      skippedCandidateIds: [],
      docsSelectionCandidateIds: [],
      selectedDocsPackageIds: [],
      selectedCandidateId: "candidate-2-probejs_types",
      fallbackUsed: false
    }
  } as McpServerRequestExecutorResult;
}
