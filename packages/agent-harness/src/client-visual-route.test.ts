import { describe, expect, it } from "vitest";

import { buildHarnessTaskBriefFromSnapshot } from "./task-brief.js";
import { buildHarnessTaskRoute } from "./task-route.js";
import {
  createTaskRouteFacts,
  createTaskRouteSnapshot
} from "./task-route-test-fixtures.js";

describe("client visual task routes", () => {
  it("uses ProbeJS and assets evidence for KubeJS client visual requests", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot({
          workspaceKind: "kubejs",
          routePlan: {
            scenario: "kubejs-workspace",
            reasons: ["workspace descriptor reports a kubejs workspace"],
            defaultRoutingScenario: "kubejs_script",
            steps: ["probejs_types", "docs_lookup"]
          },
          facts: {
            ...createTaskRouteFacts(),
            hasKubeJS: true,
            hasProbeJS: true,
            hasResourcePack: true,
            resourcePackRootCount: 1
          }
        }),
        "Fix a KubeJS client_scripts screen renderer binding with model assets."
      )
    ).toMatchObject({
      intent: {
        id: "client_visual_resources",
        confidence: "high"
      },
      steps: ["probejs_types", "datapack_files", "docs_lookup"],
      preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
    });
  });

  it("uses asset evidence for assets-only client visual requests", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot({
          workspaceKind: "unknown",
          facts: {
            ...createTaskRouteFacts(),
            hasResourcePack: true,
            resourcePackRootCount: 1
          }
        }),
        "Trace connected texture metadata for assets/demo/ctm/block/gear.properties."
      )
    ).toMatchObject({
      intent: {
        id: "client_visual_resources",
        confidence: "high"
      },
      steps: ["datapack_files", "docs_lookup"]
    });
  });

  it("adds strong client visual capability guidance for KubeJS visual work", () => {
    const brief = buildHarnessTaskBriefFromSnapshot(
      createTaskRouteSnapshot({
        workspaceKind: "kubejs",
        routePlan: {
          scenario: "kubejs-workspace",
          reasons: ["workspace descriptor reports a kubejs workspace"],
          defaultRoutingScenario: "kubejs_script",
          steps: ["probejs_types", "docs_lookup"]
        },
        facts: {
          ...createTaskRouteFacts(),
          hasKubeJS: true,
          hasProbeJS: true,
          hasResourcePack: true,
          resourcePackRootCount: 1
        }
      }),
      "KubeJS client_scripts 里做动态材质和机器视觉，模型显示不出来。"
    );

    expect(brief.intent).toMatchObject({
      id: "client_visual_resources",
      confidence: "high"
    });
    expect(brief.promptFragments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task_client_visual_capability_policy",
          text: expect.stringContaining("dynamic textures")
        }),
        expect.objectContaining({
          id: "task_client_visual_capability_policy",
          text: expect.stringContaining("client_scripts")
        }),
        expect.objectContaining({
          id: "task_client_visual_capability_policy",
          text: expect.stringContaining("clientVisualEvidence.apiProof")
        }),
        expect.objectContaining({
          id: "task_client_visual_capability_policy",
          text: expect.stringContaining("clientVisualEvidence.visualVerifier")
        }),
        expect.objectContaining({
          id: "task_client_visual_capability_policy",
          text: expect.stringContaining("shader or post-processing chain")
        }),
        expect.objectContaining({
          id: "task_client_visual_capability_policy",
          text: expect.stringContaining("source, asset, archive, docs")
        }),
        expect.objectContaining({
          id: "task_client_visual_capability_policy",
          text: expect.stringContaining("scalable UI asset semantics")
        }),
        expect.objectContaining({
          id: "task_client_visual_capability_policy",
          text: expect.stringContaining("role-equivalent evidence")
        }),
        expect.objectContaining({
          id: "task_kubejs_scripting_policy"
        })
      ])
    );
  });
});
