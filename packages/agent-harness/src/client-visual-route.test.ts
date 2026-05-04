import { describe, expect, it } from "vitest";

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
});
