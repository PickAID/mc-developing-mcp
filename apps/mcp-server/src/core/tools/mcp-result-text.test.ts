import { describe, expect, it } from "vitest";

import type { McpServerRequestExecutorResult } from "../../request/execution/request-executor.js";
import { formatMcpDevelopResultText } from "./mcp-result-text.js";

describe("formatMcpDevelopResultText", () => {
  it("summarizes Java diagnostics in plain text", () => {
    const text = formatMcpDevelopResultText(createResult());

    expect(text).toContain(
      "Java diagnostics: src/main/java/example/Broken.java:12:5 RegistryObject cannot be resolved to a type"
    );
  });

  it("summarizes KubeJS script quality evidence in plain text", () => {
    const text = formatMcpDevelopResultText(
      createResult({
        candidateId: "candidate-1-probejs_types",
        routeStep: "probejs_types",
        provenance: "probejs",
        preferredTool: "context.query",
        queryHint: "KubeJS console lifecycle",
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
              }
            ]
          }
        }
      })
    );

    expect(text).toContain(
      "KubeJS quality: issues=2, errors=1, warnings=1; kubejs/server_scripts/main.js:3 persistent_console_output"
    );
  });
});

function createResult(
  execution: Partial<McpServerRequestExecutorResult["executions"][number]> = {}
): McpServerRequestExecutorResult {
  return {
    appId: "mcp-server",
    requestPlan: { requestText: "Fix compile error" },
    evidencePlan: {},
    executions: [
      {
        candidateId: "candidate-1-java_diagnostics",
        routeStep: "java_diagnostics",
        provenance: "workspace",
        preferredTool: "workspace.analyze",
        tier: "primary",
        pathHints: [],
        queryHint: "compile error",
        attempted: true,
        status: "context",
        summary: "Drained 1 pending Java LSP diagnostic(s) from 1 file(s).",
        payload: {
          source: "workspace_analyze",
          mode: "java_diagnostics",
          totalDiagnostics: 1,
          files: [
            {
              relativePath: "src/main/java/example/Broken.java",
              diagnostics: [
                {
                  message: "RegistryObject cannot be resolved to a type",
                  severity: 1,
                  range: {
                    start: { line: 11, character: 4 },
                    end: { line: 11, character: 18 }
                  },
                  source: "jdtls"
                }
              ]
            }
          ]
        },
        ...execution
      }
    ],
    selectedEvidence: undefined,
    trace: {
      routeSteps: ["java_diagnostics"],
      candidateIds: ["candidate-1-java_diagnostics"],
      executedCandidateIds: ["candidate-1-java_diagnostics"],
      contextCandidateIds: ["candidate-1-java_diagnostics"],
      failedCandidateIds: [],
      skippedCandidateIds: [],
      docsSelectionCandidateIds: [],
      selectedDocsPackageIds: [],
      fallbackUsed: true
    }
  } as McpServerRequestExecutorResult;
}
