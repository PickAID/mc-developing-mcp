import { describe, expect, it } from "vitest";

import { buildMcpDevelopStructuredContent } from "./mcp-structured-content.js";
import type { McpServerRequestExecutorResult } from "./request-executor.js";

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
