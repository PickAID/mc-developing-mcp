import { describe, expect, it } from "vitest";

import type { McpServerEvidencePlan } from "../evidence/evidence-plan.js";
import {
  createRequestExecutionContext,
  prepareExecutorInput,
  rememberContext
} from "./request-execution-context.js";

describe("request execution context", () => {
  it("chains FTB Quests schema log errors into later evidence requests", () => {
    const context = createRequestExecutionContext();

    rememberContext(
      {
        source: "workspace_analyze",
        signals: {
          ftbQuestsErrors: [
            {
              kind: "load_error",
              path: "config/ftbquests/quests/addon_bridge/custom.snbt",
              message: "Unknown task type hotai:flight_task"
            }
          ]
        }
      },
      context
    );

    const prepared = prepareExecutorInput(
      createEvidencePlan(),
      {
        id: "candidate-2-datapack_files",
        priority: 2,
        tier: "primary",
        routeStep: "datapack_files",
        provenance: "datapack_files",
        preferredTool: "source.bundle",
        estimatedCost: "medium",
        reliability: "high",
        reason: "Inspect datapack files.",
        pathHints: [],
        queryHint: "Inspect FTB Quests files."
      },
      context
    );

    expect(prepared.requestPlan.requestText).toContain(
      "Crash log FTB Quests schema errors: load_error config/ftbquests/quests/addon_bridge/custom.snbt Unknown task type hotai:flight_task"
    );
    expect(prepared.candidate.queryHint).toContain(
      "Crash log FTB Quests schema errors: load_error config/ftbquests/quests/addon_bridge/custom.snbt Unknown task type hotai:flight_task"
    );
  });
});

function createEvidencePlan(): McpServerEvidencePlan {
  return {
    appId: "mcp-server",
    requestPlan: {
      appId: "mcp-server",
      requestText: "Inspect FTB Quests files.",
      requestContext: {
        requestText: "Inspect FTB Quests files."
      },
      prompt: {
        sections: []
      },
      toolGuidance: {
        availableTools: [],
        preferredTools: [],
        routeSteps: ["log_files", "datapack_files"]
      },
      trace: {
        workspaceKind: "unknown",
        defaultRouteSteps: [],
        taskIntent: { id: "datapack_lookup" },
        taskRouteReasons: [],
        taskRouteSteps: ["log_files", "datapack_files"],
        selectedPromptFragmentIds: []
      }
    },
    candidates: [],
    trace: {
      routeSteps: ["log_files", "datapack_files"],
      candidateIds: ["candidate-1-log_files", "candidate-2-datapack_files"],
      fallbackCandidateIds: []
    }
  } as McpServerEvidencePlan;
}
