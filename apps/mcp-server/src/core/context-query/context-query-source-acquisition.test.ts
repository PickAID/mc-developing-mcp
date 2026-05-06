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
        ]
      }
    });
  });
});

function inputFixture(): McpServerEvidenceExecutorInput {
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
      queryHint: "Find source for a NeoForge mod from Modrinth."
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
    requestPlan: requestPlanFixture()
  };
}

function requestPlanFixture(): McpServerEvidenceExecutorInput["requestPlan"] {
  return {
    appId: "mcp-server",
    requestText: "Find source for a NeoForge mod from Modrinth.",
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
