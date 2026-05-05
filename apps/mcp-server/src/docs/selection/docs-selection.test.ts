import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";
import { buildMcpServerDocsSelection } from "./docs-selection.js";

describe("buildMcpServerDocsSelection", () => {
  it("selects the CrychicDoc KubeJS package for 1.20.1 docs lookup requests", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot: resolveScenarioPath("modpack_kubejs")
      }
    });

    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "How should I place this startup_scripts recipe and use ProbeJS in 1.20.1?"
    );

    expect(
      buildMcpServerDocsSelection(requestPlan, { routeStep: "docs_lookup" })
    ).toMatchObject({
      selections: [
        {
          packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn",
          matchedSignals: expect.arrayContaining([
            "probejs",
            "startup_scripts",
            "recipe"
          ])
        }
      ],
      trace: {
        taskIntentId: "kubejs_authoring",
        routeStep: "docs_lookup",
        rejectedPackages: []
      }
    });
  });

  it("returns docs lookup rejection trace when the query is outside the package scope", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot: resolveScenarioPath("modpack_external_crash")
      }
    });

    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "The server crashes on startup and latest.log shows an exception in a mod."
    );

    expect(
      buildMcpServerDocsSelection(requestPlan, { routeStep: "docs_lookup" })
    ).toMatchObject({
      selections: [],
      trace: {
        taskIntentId: "crash_triage",
        routeStep: "docs_lookup",
        rejectedPackages: [
          {
            packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn",
            reason:
              "task intent crash_triage is outside the package intent scope"
          }
        ]
      }
    });
  });
});

function resolveScenarioPath(name: string): string {
  return fileURLToPath(
    new URL(`../../../../../testdata/scenarios/${name}`, import.meta.url)
  );
}
