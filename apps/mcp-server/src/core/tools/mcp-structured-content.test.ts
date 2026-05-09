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

  it("promotes source acquisition capability guidance to top-level workspace preparation", () => {
    const content = buildMcpDevelopStructuredContent(
      createExecutorResult({
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
          routes: [
            { origin: "runtime_cache", artifactStrategy: "query_cached_packages_and_indexes" },
            { origin: "local_jar", artifactStrategy: "index_binary_jar" }
          ],
          workItems: [
            {
              kind: "jar_index",
              sourceArchive: "/private/mods/demo.jar",
              cacheScope: "private_runtime"
            }
          ],
          sourceIndexPreview: {
            query: "ItemStack",
            searchedDatabaseCount: 1,
            matches: [{ symbol: "net.minecraft.world.item.ItemStack" }]
          },
          workItemExecutionStatus: "partial",
          workItemExecutions: [
            {
              kind: "jar_index",
              status: "completed",
              summary: "Indexed local jar.",
              payload: {
                rawLargePayloadShouldNotBeCopied: "x".repeat(100)
              }
            }
          ]
        }
      })
    );

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
        ])
      }
    });
    expect(JSON.stringify(content.workspacePreparation)).not.toContain(
      "rawLargePayloadShouldNotBeCopied"
    );
  });

  it("exposes MDM package install recommendations as confirmation-gated resource actions", () => {
    const content = buildMcpDevelopStructuredContent(createExecutorResult(), {
      mdmPackageRecommendations: {
        policy: "recommend_before_download",
        status: "available",
        message: "MDM packages are recommendations only.",
        suggestions: [
          {
            packageId: "minecraft-1.20.1-source-index",
            status: "missing_optional",
            priority: "high",
            matchedSignals: ["sources"],
            reason: "Matched source index request.",
            mdmReleaseInstall: {
              packageId: "minecraft-1.20.1-source-index",
              downloadPolicy: "disabled",
              manifestPath: "/repo/mdm-release-manifest.json"
            }
          }
        ]
      }
    });

    expect(content.resourceActions).toMatchObject({
      policy: "recommend_before_download",
      executeWithDownloadOnlyAfterUserConfirmation: true,
      actions: [
        {
          id: "install_mdm_minecraft-1.20.1-source-index",
          kind: "mdm_release_install",
          safety: "requires_user_confirmation",
          packageId: "minecraft-1.20.1-source-index",
          inputPatch: {
            mdmReleaseInstall: {
              packageId: "minecraft-1.20.1-source-index",
              downloadPolicy: "disabled"
            }
          }
        }
      ]
    });
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
