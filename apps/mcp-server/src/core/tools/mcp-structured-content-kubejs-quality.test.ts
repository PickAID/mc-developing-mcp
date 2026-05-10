import { describe, expect, it } from "vitest";

import type { McpServerRequestExecutorResult } from "../../request/execution/request-executor.js";
import { buildMcpDevelopStructuredContent } from "./mcp-structured-content.js";

describe("buildMcpDevelopStructuredContent KubeJS quality summary", () => {
  it("promotes compact KubeJS quality evidence to top-level structured content", () => {
    const content = buildMcpDevelopStructuredContent(createKubeJsQualityResult(), {
      maxArrayItems: 1
    });

    expect(content.kubeJsQuality).toMatchObject({
      source: "selectedEvidence",
      candidateId: "candidate-1-probejs_types",
      issueCount: 2,
      severityCounts: { error: 1, warning: 1 },
      firstIssue: {
        kind: "persistent_console_output",
        severity: "warning",
        file: "kubejs/server_scripts/main.js",
        line: 3
      }
    });
  });
});

function createKubeJsQualityResult(): McpServerRequestExecutorResult {
  const selectedExecution = {
    candidateId: "candidate-1-probejs_types",
    routeStep: "probejs_types",
    provenance: "workspace",
    preferredTool: "context.query",
    tier: "primary",
    pathHints: [],
    queryHint: "KubeJS console lifecycle",
    attempted: true,
    status: "selected",
    summary: "Resolved KubeJS ProbeJS context.",
    payload: {
      source: "kubejs_language_service",
      scriptQualityEvidence: {
        issueCount: 2,
        severityCounts: { error: 1, warning: 1 },
        issues: [
          {
            kind: "persistent_console_output",
            severity: "warning",
            file: "kubejs/server_scripts/main.js",
            line: 3,
            message:
              "Persistent console.* output should be removed or gated before committed KubeJS scripts."
          },
          {
            kind: "generic_js_pattern",
            severity: "error",
            file: "kubejs/startup_scripts/main.js",
            line: 9
          }
        ]
      }
    }
  };

  return {
    appId: "mcp-server",
    requestPlan: {
      requestText: "Fix this KubeJS script.",
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
            hasProbeJS: true,
            hasModArchives: true,
            hasDatapack: false,
            buildFileCount: 0,
            javaSourceRootCount: 0,
            datapackRootCount: 0,
            logPathCount: 0
          }
        }
      },
      trace: { selectedPromptFragmentIds: [] }
    },
    evidencePlan: {},
    executions: [selectedExecution],
    selectedEvidence: selectedExecution,
    trace: {
      routeSteps: ["probejs_types"],
      candidateIds: ["candidate-1-probejs_types"],
      executedCandidateIds: ["candidate-1-probejs_types"],
      contextCandidateIds: [],
      failedCandidateIds: [],
      skippedCandidateIds: [],
      docsSelectionCandidateIds: [],
      selectedDocsPackageIds: [],
      selectedCandidateId: "candidate-1-probejs_types",
      fallbackUsed: false
    }
  } as McpServerRequestExecutorResult;
}
