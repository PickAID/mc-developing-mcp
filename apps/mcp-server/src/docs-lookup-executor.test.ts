import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { buildMcpServerDocsSelection } from "./docs-selection.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";
import { executeMcpServerDocsLookup } from "./docs-lookup-executor.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";

describe("executeMcpServerDocsLookup", () => {
  it("returns structured docs hits for a KubeJS docs lookup request", async () => {
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
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates[1];
    const docsSelection = buildMcpServerDocsSelection(requestPlan, candidate);

    const result = executeMcpServerDocsLookup({
      candidate,
      evidencePlan,
      requestPlan,
      docsSelection
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "docs_lookup",
        selectedPackageIds: ["crychicdoc-kubejs-1.20.1-course-zh-cn"],
        hits: expect.arrayContaining([
          expect.objectContaining({
            entryId: "crychicdoc-kubejs-1.20.1-file-structure"
          }),
          expect.objectContaining({
            entryId: "crychicdoc-kubejs-1.20.1-probejs-workflow"
          })
        ])
      }
    });
  });

  it("returns an unmatched result when no docs packages were selected", async () => {
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
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates[2];
    const docsSelection = buildMcpServerDocsSelection(requestPlan, candidate);

    const result = executeMcpServerDocsLookup({
      candidate,
      evidencePlan,
      requestPlan,
      docsSelection
    });

    expect(result).toEqual({
      matched: false,
      summary: "No docs packages were selected for docs lookup.",
      payload: {
        source: "docs_lookup",
        queryText:
          "The server crashes on startup and latest.log shows an exception in a mod.",
        selectedPackageIds: [],
        hits: []
      }
    });
  });
});

function resolveScenarioPath(name: string): string {
  return fileURLToPath(
    new URL(`../../../testdata/scenarios/${name}`, import.meta.url)
  );
}
