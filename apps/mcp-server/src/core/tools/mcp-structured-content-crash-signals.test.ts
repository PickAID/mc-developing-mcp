import { describe, expect, it } from "vitest";

import type { McpServerRequestExecutorResult } from "../../request/execution/request-executor.js";
import { buildMcpDevelopStructuredContent } from "./mcp-structured-content.js";

describe("buildMcpDevelopStructuredContent crash signal summary", () => {
  it("promotes compact crash log signals to top-level structured content", () => {
    const content = buildMcpDevelopStructuredContent(createCrashSignalResult(), {
      maxArrayItems: 2
    });

    expect(content.crashSignals).toMatchObject({
      source: "execution",
      candidateId: "candidate-1-log_files",
      logFileCount: 1,
      truncated: false,
      exceptionClasses: ["java.lang.IllegalStateException"],
      actionableClassReferences: [
        "com.example.external.SomeExternalClass",
        "com.example.project.LocalCaller"
      ],
      resourceLocations: ["ftbquests:object_started"],
      loaderModReferences: ["oculus"],
      ftbQuestsErrorCount: 1,
      firstFtbQuestsError: {
        kind: "load_error",
        path: "config/ftbquests/quests/addon_bridge/custom.snbt"
      }
    });
  });
});

function createCrashSignalResult(): McpServerRequestExecutorResult {
  const execution = {
    candidateId: "candidate-1-log_files",
    routeStep: "log_files",
    provenance: "workspace",
    preferredTool: "workspace.analyze",
    tier: "primary",
    pathHints: [],
    queryHint: "latest.log",
    attempted: true,
    status: "context",
    summary: "Extracted actionable crash signals from 1 log file(s).",
    payload: {
      source: "workspace_analyze",
      mode: "log_files",
      logFiles: [
        {
          path: "/tmp/modpack/logs/latest.log",
          signalCount: 5,
          truncated: false
        }
      ],
      signals: {
        exceptionClasses: ["java.lang.IllegalStateException"],
        actionableClassReferences: [
          "com.example.external.SomeExternalClass",
          "com.example.project.LocalCaller",
          "com.example.extra.OmittedByBudget"
        ],
        resourceLocations: ["ftbquests:object_started"],
        resourcePaths: ["assets/demo/models/block/gear.json"],
        loaderModIds: ["acceleratedrendering"],
        loaderModReferences: ["oculus"],
        ftbQuestsErrors: [
          {
            kind: "load_error",
            path: "config/ftbquests/quests/addon_bridge/custom.snbt",
            message: "Unknown task type hotai:flight_task"
          }
        ]
      },
      truncated: false
    }
  };

  return {
    appId: "mcp-server",
    requestPlan: {
      requestText: "The server crashes on startup.",
      requestContext: {
        taskBrief: { promptFragments: [] },
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
            hasProbeJS: false,
            hasModArchives: true,
            hasDatapack: true,
            buildFileCount: 0,
            javaSourceRootCount: 0,
            datapackRootCount: 1,
            logPathCount: 1
          }
        }
      },
      trace: { selectedPromptFragmentIds: [] }
    },
    evidencePlan: {},
    executions: [execution],
    selectedEvidence: undefined,
    trace: {
      routeSteps: ["log_files"],
      candidateIds: ["candidate-1-log_files"],
      executedCandidateIds: ["candidate-1-log_files"],
      contextCandidateIds: ["candidate-1-log_files"],
      failedCandidateIds: [],
      skippedCandidateIds: [],
      docsSelectionCandidateIds: [],
      selectedDocsPackageIds: [],
      fallbackUsed: true
    }
  } as McpServerRequestExecutorResult;
}
