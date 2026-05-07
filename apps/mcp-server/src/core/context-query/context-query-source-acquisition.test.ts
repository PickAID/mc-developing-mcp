import { describe, expect, it } from "vitest";

import { buildMcpServerContextQueryExecutor } from "./context-query-executor.js";
import type { McpServerEvidenceExecutorInput } from "../../request/execution/request-handler.js";

describe("context.query source acquisition plan", () => {
  it("returns compact source acquisition routes", async () => {
    const executor = buildMcpServerContextQueryExecutor();

    const result = await executor(inputFixture());

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "source_acquisition_plan",
        requiresWorkspace: false,
        routes: [
          {
            origin: "runtime_cache",
            artifactStrategy: "query_cached_packages_and_indexes",
            cacheMode: "runtime_source_index_cache",
            warnings: []
          },
          {
            origin: "modrinth",
            artifactStrategy: "resolve_remote_jar_metadata"
          }
        ],
        workItems: [
          {
            kind: "remote_metadata",
            source: "modrinth",
            cacheScope: "metadata"
          }
        ]
      }
    });
  });

  it("executes source acquisition work items when handlers are provided", async () => {
    const executor = buildMcpServerContextQueryExecutor({
      sourceAcquisitionWorkItemHandlers: {
        remoteMetadata: async (item) => ({
          summary: `resolved ${item.source}`,
          payload: {
            source: "test_remote_metadata",
            platform: item.source
          }
        })
      }
    });

    const result = await executor(inputFixture());

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "source_acquisition_plan",
        workItemExecutionStatus: "completed",
        workItemExecutions: [
          {
            kind: "remote_metadata",
            status: "completed",
            payload: {
              source: "test_remote_metadata",
              platform: "modrinth"
            }
          }
        ]
      }
    });
  });

  it("adds mapping index work items for versioned mapping requests", async () => {
    const executor = buildMcpServerContextQueryExecutor({
      sourceAcquisitionWorkItemHandlers: {
        mappingIndex: async (item) => ({
          summary: `indexed ${item.mappingFamily} ${item.minecraftVersion}`,
          payload: {
            source: "test_mapping_index",
            minecraftVersion: item.minecraftVersion,
            mappingFamily: item.mappingFamily
          }
        })
      }
    });

    const result = await executor(
      inputFixture({
        requestText: "Need Yarn mappings for Minecraft 1.21.1 mixin target."
      })
    );

    expect(result.matched).toBe(true);
    expect(result.payload).toMatchObject({
      source: "source_acquisition_plan"
    });
    expect((result.payload as { workItems: unknown[] }).workItems).toEqual(
      expect.arrayContaining([
        {
          kind: "mapping_index",
          minecraftVersion: "1.21.1",
          mappingFamily: "yarn",
          cacheScope: "private_runtime"
        }
      ])
    );
    expect(
      (result.payload as { workItemExecutions: unknown[] }).workItemExecutions
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "mapping_index",
          status: "completed",
          payload: {
            source: "test_mapping_index",
            minecraftVersion: "1.21.1",
            mappingFamily: "yarn"
          }
        })
      ])
    );
  });

  it("reports installed source index databases as immediately queryable evidence", async () => {
    const executor = buildMcpServerContextQueryExecutor({
      sourceIndexDatabasePaths: [
        "/runtime/artifacts/minecraft-1.20.1-source-index-0.1.0.sqlite"
      ]
    });

    const result = await executor(inputFixture());

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "source_acquisition_plan",
        cachedSourceIndexes: {
          databaseCount: 1,
          databases: [
            "/runtime/artifacts/minecraft-1.20.1-source-index-0.1.0.sqlite"
          ]
        }
      }
    });
  });
});

function inputFixture(input: { requestText?: string } = {}): McpServerEvidenceExecutorInput {
  const requestText =
    input.requestText ?? "Find source for a NeoForge mod from Modrinth.";

  return {
    candidate: {
      id: "candidate-1-source_acquisition_plan",
      priority: 1,
      tier: "primary",
      routeStep: "source_acquisition_plan",
      provenance: "source_acquisition",
      preferredTool: "context.query",
      estimatedCost: "low",
      reliability: "high",
      reason: "Plan source acquisition.",
      pathHints: [],
      queryHint: requestText
    },
    evidencePlan: {
      appId: "mcp-server",
      requestPlan: requestPlanFixture(),
      candidates: [],
      trace: {
        routeSteps: ["source_acquisition_plan"],
        candidateIds: [],
        fallbackCandidateIds: []
      }
    },
    requestPlan: requestPlanFixture({ requestText })
  };
}

function requestPlanFixture(input: {
  requestText?: string;
} = {}): McpServerEvidenceExecutorInput["requestPlan"] {
  const requestText =
    input.requestText ?? "Find source for a NeoForge mod from Modrinth.";

  return {
    appId: "mcp-server",
    requestText,
    requestContext: {},
    toolGuidance: {
      availableTools: ["context.query"],
      preferredTools: ["context.query"],
      routeSteps: ["source_acquisition_plan"]
    },
    trace: {
      bootstrapKind: "mcp-server",
      harnessSnapshot: {
        workspaceKind: "unknown",
        detectorReasons: [],
        routePlan: {
          scenario: "unknown-workspace",
          reasons: [],
          steps: ["docs_lookup"]
        },
        facts: {
          hasGradle: false,
          hasJavaSource: false,
          hasKubeJS: false,
          hasProbeJS: false,
          hasModArchives: false,
          hasDatapack: false,
          hasResourcePack: false,
          buildFileCount: 0,
          javaSourceRootCount: 0,
          datapackRootCount: 0,
          resourcePackRootCount: 0,
          logPathCount: 0
        }
      },
      taskIntent: {
        id: "external_mod_resolution",
        confidence: "high",
        reasons: []
      },
      taskBrief: {
        snapshot: {
          workspaceKind: "unknown",
          detectorReasons: [],
          routePlan: {
            scenario: "unknown-workspace",
            reasons: [],
            steps: ["docs_lookup"]
          },
          facts: {
            hasGradle: false,
            hasJavaSource: false,
            hasKubeJS: false,
            hasProbeJS: false,
            hasModArchives: false,
            hasDatapack: false,
            hasResourcePack: false,
            buildFileCount: 0,
            javaSourceRootCount: 0,
            datapackRootCount: 0,
            resourcePackRootCount: 0,
            logPathCount: 0
          }
        },
        intent: {
          id: "external_mod_resolution",
          confidence: "high",
          reasons: []
        },
        taskRoute: {
          intent: {
            id: "external_mod_resolution",
            confidence: "high",
            reasons: []
          },
          reasons: [],
          steps: ["source_acquisition_plan"],
          preferredTools: ["context.query"]
        },
        availableTools: ["context.query"],
        preferredTools: ["context.query"],
        promptFragments: []
      }
    }
  };
}
