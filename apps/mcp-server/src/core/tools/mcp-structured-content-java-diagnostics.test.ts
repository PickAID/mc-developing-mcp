import { describe, expect, it } from "vitest";

import type { McpServerRequestExecutorResult } from "../../request/execution/request-executor.js";
import { buildMcpDevelopStructuredContent } from "./mcp-structured-content.js";

describe("buildMcpDevelopStructuredContent Java diagnostics summary", () => {
  it("promotes compact Java diagnostics to top-level structured content", () => {
    const content = buildMcpDevelopStructuredContent(createJavaDiagnosticsResult());

    expect(content.javaDiagnostics).toMatchObject({
      source: "execution",
      candidateId: "candidate-1-java_diagnostics",
      totalDiagnostics: 2,
      fileCount: 1,
      firstDiagnostic: {
        file: "src/main/java/example/Broken.java",
        line: 12,
        character: 5,
        message: "RegistryObject cannot be resolved to a type"
      }
    });
  });
});

function createJavaDiagnosticsResult(): McpServerRequestExecutorResult {
  const execution = {
    candidateId: "candidate-1-java_diagnostics",
    routeStep: "java_diagnostics",
    provenance: "workspace",
    preferredTool: "workspace.analyze",
    tier: "primary",
    pathHints: [],
    queryHint: "compile error",
    attempted: true,
    status: "context",
    summary: "Drained 2 pending Java LSP diagnostic(s) from 1 file(s).",
    payload: {
      source: "workspace_analyze",
      mode: "java_diagnostics",
      totalDiagnostics: 2,
      files: [
        {
          relativePath: "src/main/java/example/Broken.java",
          diagnostics: [
            {
              message: "RegistryObject cannot be resolved to a type",
              range: { start: { line: 11, character: 4 } }
            },
            {
              message: "Cannot infer generic type",
              range: { start: { line: 20, character: 8 } }
            }
          ]
        }
      ]
    }
  };

  return {
    appId: "mcp-server",
    requestPlan: {
      requestText: "Fix Java compile errors.",
      requestContext: {
        taskBrief: { promptFragments: [] },
        harnessSnapshot: {
          workspaceRoot: "/tmp/mod",
          workspaceKind: "java-mod",
          currentRuntime: {
            source: "unknown",
            confidence: "unknown",
            evidenceSources: [],
            candidates: [],
            evidence: []
          },
          facts: {
            hasGradle: true,
            hasJavaSource: true,
            hasKubeJS: false,
            hasProbeJS: false,
            hasModArchives: false,
            hasDatapack: false,
            buildFileCount: 1,
            javaSourceRootCount: 1,
            datapackRootCount: 0,
            logPathCount: 0
          }
        }
      },
      trace: { selectedPromptFragmentIds: [] }
    },
    evidencePlan: {},
    executions: [execution],
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
