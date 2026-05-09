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
});

function createResult(): McpServerRequestExecutorResult {
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
        }
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
