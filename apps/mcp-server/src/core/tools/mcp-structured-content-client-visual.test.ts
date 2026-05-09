import { describe, expect, it } from "vitest";

import type { McpServerRequestExecutorResult } from "../../request/execution/request-executor.js";
import { buildMcpDevelopStructuredContent } from "./mcp-structured-content.js";

describe("buildMcpDevelopStructuredContent client visual summary", () => {
  it("promotes compact client visual verifier status to top-level structured content", () => {
    const content = buildMcpDevelopStructuredContent(createClientVisualResult(), {
      maxArrayItems: 2
    });

    expect(content.clientVisualVerifier).toMatchObject({
      source: "selectedEvidence",
      candidateId: "candidate-1-datapack_files",
      overall: "risky",
      missingChecks: ["resource_reload_or_dynamic_texture"],
      riskyChecks: ["api_version"],
      nextProofSteps: [
        "resolve loader/version API mismatch before naming client methods or events",
        "prove reload/cache lifecycle before generating dynamic textures or resources"
      ]
    });
  });
});

function createClientVisualResult(): McpServerRequestExecutorResult {
  const selectedExecution = {
    candidateId: "candidate-1-datapack_files",
    routeStep: "datapack_files",
    provenance: "workspace",
    preferredTool: "source.bundle",
    tier: "primary",
    pathHints: [],
    queryHint: "demo:block/gear",
    attempted: true,
    status: "selected",
    summary: "Found client visual evidence.",
    payload: {
      source: "datapack_files",
      clientVisualEvidence: {
        visualVerifier: {
          tokenPolicy: "compact_client_visual_verifier",
          overall: "risky",
          checks: {
            registry: { status: "proven" },
            client_init: { status: "proven" },
            resource_reload_or_dynamic_texture: { status: "missing" },
            api_version: { status: "risky" }
          },
          nextProofSteps: [
            "resolve loader/version API mismatch before naming client methods or events",
            "prove reload/cache lifecycle before generating dynamic textures or resources",
            "extra proof step should be bounded"
          ]
        }
      }
    }
  };

  return {
    appId: "mcp-server",
    requestPlan: {
      requestText: "Help me fix this renderer.",
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
            hasDatapack: true,
            buildFileCount: 1,
            javaSourceRootCount: 1,
            datapackRootCount: 1,
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
      routeSteps: ["datapack_files"],
      candidateIds: ["candidate-1-datapack_files"],
      executedCandidateIds: ["candidate-1-datapack_files"],
      contextCandidateIds: [],
      failedCandidateIds: [],
      skippedCandidateIds: [],
      docsSelectionCandidateIds: [],
      selectedDocsPackageIds: [],
      selectedCandidateId: "candidate-1-datapack_files",
      fallbackUsed: false
    }
  } as McpServerRequestExecutorResult;
}
