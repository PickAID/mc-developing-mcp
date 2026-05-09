import { describe, expect, it } from "vitest";

import type { McpServerRequestPlan } from "minecraft-developing-mcp-shared-types";

import { buildMcpServerEvidencePlan } from "./evidence-plan.js";

describe("buildMcpServerEvidencePlan source acquisition", () => {
  it("adds source acquisition planning before remote mod lookup", () => {
    const requestText =
      "Find source for a NeoForge mod from Modrinth without a workspace";
    const result = buildMcpServerEvidencePlan(
      requestPlanFixture({
        requestText,
        routeSteps: ["external_mod_resolution", "docs_lookup"]
      })
    );

    expect(result.candidates.map((candidate) => candidate.routeStep)).toEqual([
      "source_acquisition_plan",
      "external_mod_resolution",
      "docs_lookup"
    ]);
    expect(result.candidates[0]).toMatchObject({
      routeStep: "source_acquisition_plan",
      provenance: "source_acquisition",
      preferredTool: "context.query",
      queryHint: requestText
    });
  });

  it("adds source acquisition planning for bundle and index wording", () => {
    const requestText =
      "Bundle and index this external mod source so it can be used offline later.";
    const result = buildMcpServerEvidencePlan(
      requestPlanFixture({
        requestText,
        routeSteps: ["external_mod_resolution", "docs_lookup"]
      })
    );

    expect(result.candidates.map((candidate) => candidate.routeStep)).toEqual([
      "source_acquisition_plan",
      "external_mod_resolution",
      "docs_lookup"
    ]);
  });
});

function requestPlanFixture(input: {
  requestText: string;
  routeSteps: McpServerRequestPlan["toolGuidance"]["routeSteps"];
}): McpServerRequestPlan {
  return {
    appId: "mcp-server",
    requestText: input.requestText,
    requestContext: {},
    toolGuidance: {
      availableTools: ["context.query", "source.bundle", "workspace.analyze"],
      preferredTools: ["context.query", "source.bundle", "workspace.analyze"],
      routeSteps: input.routeSteps
    },
    trace: {
      bootstrapKind: "mcp-server",
      harnessSnapshot: {
        workspaceKind: "unknown",
        detectorReasons: [],
        routePlan: {
          scenario: "unknown-workspace",
          reasons: [],
          steps: ["docs_lookup"]
        },
        facts: {
          hasGradle: false,
          hasJavaSource: false,
          hasKubeJS: false,
          hasProbeJS: false,
          hasModArchives: false,
          hasDatapack: false,
          hasResourcePack: false,
          buildFileCount: 0,
          javaSourceRootCount: 0,
          datapackRootCount: 0,
          resourcePackRootCount: 0,
          logPathCount: 0
        }
      },
      taskIntent: {
        id: "external_mod_resolution",
        confidence: "high",
        reasons: []
      },
      taskBrief: {
        snapshot: {
          workspaceKind: "unknown",
          detectorReasons: [],
          routePlan: {
            scenario: "unknown-workspace",
            reasons: [],
            steps: ["docs_lookup"]
          },
          facts: {
            hasGradle: false,
            hasJavaSource: false,
            hasKubeJS: false,
            hasProbeJS: false,
            hasModArchives: false,
            hasDatapack: false,
            hasResourcePack: false,
            buildFileCount: 0,
            javaSourceRootCount: 0,
            datapackRootCount: 0,
            resourcePackRootCount: 0,
            logPathCount: 0
          }
        },
        intent: {
          id: "external_mod_resolution",
          confidence: "high",
          reasons: []
        },
        taskRoute: {
          intent: {
            id: "external_mod_resolution",
            confidence: "high",
            reasons: []
          },
          reasons: [],
          steps: input.routeSteps,
          preferredTools: ["context.query", "source.bundle", "workspace.analyze"]
        },
        availableTools: ["context.query", "source.bundle", "workspace.analyze"],
        preferredTools: ["context.query", "source.bundle", "workspace.analyze"],
        promptFragments: []
      }
    }
  };
}
