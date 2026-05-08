import { describe, expect, it, vi } from "vitest";

import { executeMcpServerSourceAcquisitionPlan } from "./source-acquisition-plan-executor.js";
import type { McpServerEvidenceExecutorInput } from "../request/execution/request-handler.js";

describe("executeMcpServerSourceAcquisitionPlan no-workspace policy", () => {
  it("does not plan or execute workspace work items without workspaceRoot or descriptor", async () => {
    const workspaceGradleDependencies = vi.fn(async () => {
      throw new Error("workspace Gradle handler should not run");
    });
    const workspaceProbeJsTypes = vi.fn(async () => {
      throw new Error("workspace ProbeJS handler should not run");
    });
    const result = await executeMcpServerSourceAcquisitionPlan(inputFixture(), {
      workItemHandlers: {
        vanillaGeneration: async (item) => ({
          summary: `planned vanilla generation for ${item.minecraftVersion}`
        }),
        remoteMetadata: async (item) => ({
          summary: `planned remote metadata for ${item.source}`
        }),
        mappingIndex: async (item) => ({
          summary: `planned ${item.mappingFamily} mappings`
        }),
        workspaceGradleDependencies,
        workspaceProbeJsTypes
      }
    });
    const payload = result.payload as {
      routes: Array<{ origin: string; requiresWorkspace?: boolean }>;
      workItems: Array<{ kind: string }>;
      workItemExecutions: Array<{ kind: string; status: string }>;
    };

    expect(result.matched).toBe(true);
    expect(payload.routes.map((route) => route.origin)).toEqual([
      "runtime_cache",
      "official",
      "modrinth",
      "curseforge"
    ]);
    expect(payload.routes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ origin: "workspace_gradle" }),
        expect.objectContaining({ origin: "workspace_probejs" })
      ])
    );
    expect(payload.workItems).toEqual([
      {
        kind: "vanilla_generation",
        minecraftVersion: "1.21.1",
        cacheScope: "private_runtime"
      },
      {
        kind: "remote_metadata",
        source: "modrinth",
        cacheScope: "metadata"
      },
      {
        kind: "remote_metadata",
        source: "curseforge",
        cacheScope: "metadata"
      },
      {
        kind: "mapping_index",
        minecraftVersion: "1.21.1",
        mappingFamily: "yarn",
        cacheScope: "private_runtime"
      }
    ]);
    expect(payload.workItems).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "workspace_gradle_dependencies" }),
        expect.objectContaining({ kind: "workspace_probejs_types" })
      ])
    );
    expect(payload.workItemExecutions.map((execution) => execution.kind)).toEqual([
      "vanilla_generation",
      "remote_metadata",
      "remote_metadata",
      "mapping_index"
    ]);
    expect(workspaceGradleDependencies).not.toHaveBeenCalled();
    expect(workspaceProbeJsTypes).not.toHaveBeenCalled();
  });
});

function inputFixture(): McpServerEvidenceExecutorInput {
  const requestText =
    "Need official vanilla, Modrinth, CurseForge, and Yarn mapping source evidence for Minecraft 1.21.1.";

  return {
    candidate: {
      id: "candidate-source-acquisition-no-workspace",
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
      requestPlan: requestPlanFixture(requestText),
      candidates: [],
      trace: {
        routeSteps: ["source_acquisition_plan"],
        candidateIds: [],
        fallbackCandidateIds: []
      }
    },
    requestPlan: requestPlanFixture(requestText)
  };
}

function requestPlanFixture(
  requestText: string
): McpServerEvidenceExecutorInput["requestPlan"] {
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
      bootstrapKind: "mcp-server"
    }
  };
}
