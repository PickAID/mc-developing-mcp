import { describe, expect, it } from "vitest";

import { buildMcpDevelopStructuredContent } from "./mcp-structured-content.js";
import type { McpServerRequestExecutorResult } from "../../request/execution/request-executor.js";

describe("buildMcpDevelopStructuredContent resource actions", () => {
  it("exposes MDM package install recommendations as confirmation-gated actions", () => {
    const content = buildMcpDevelopStructuredContent(createExecutorResult(), {
      mdmPackageRecommendations: {
        policy: "recommend_before_download",
        status: "available",
        message: "MDM packages are recommendations only.",
        suggestions: [
          {
            packageId: "minecraft-1.20.1-source-index",
            status: "missing_optional",
            priority: "high",
            matchedSignals: ["sources"],
            reason: "Matched source index request.",
            mdmReleaseInstall: {
              packageId: "minecraft-1.20.1-source-index",
              downloadPolicy: "disabled",
              manifestPath: "/repo/mdm-release-manifest.json"
            }
          }
        ]
      }
    });

    expect(content.resourceActions).toMatchObject({
      policy: "recommend_before_download",
      executeWithDownloadOnlyAfterUserConfirmation: true,
      actions: [
        {
          id: "install_mdm_minecraft-1.20.1-source-index",
          kind: "mdm_release_install",
          safety: "requires_user_confirmation",
          packageId: "minecraft-1.20.1-source-index",
          inputPatch: {
            mdmReleaseInstall: {
              packageId: "minecraft-1.20.1-source-index",
              downloadPolicy: "disabled"
            }
          }
        }
      ]
    });
  });
});

function createExecutorResult(): McpServerRequestExecutorResult {
  return {
    appId: "mcp-server",
    requestPlan: {
      requestText: "Install Minecraft source index",
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
            hasKubeJS: false,
            hasProbeJS: false,
            hasModArchives: false,
            hasDatapack: false,
            buildFileCount: 0,
            javaSourceRootCount: 0,
            datapackRootCount: 0,
            logPathCount: 0
          }
        }
      },
      trace: {
        taskIntent: { id: "docs_lookup", confidence: "low", reasons: [] },
        selectedPromptFragmentIds: []
      }
    },
    evidencePlan: {} as McpServerRequestExecutorResult["evidencePlan"],
    executions: [],
    selectedEvidence: undefined,
    trace: {
      routeSteps: [],
      candidateIds: [],
      executedCandidateIds: [],
      contextCandidateIds: [],
      failedCandidateIds: [],
      skippedCandidateIds: [],
      docsSelectionCandidateIds: [],
      selectedDocsPackageIds: [],
      fallbackUsed: false
    }
  } as McpServerRequestExecutorResult;
}
