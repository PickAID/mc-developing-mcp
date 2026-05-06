import { describe, expect, it } from "vitest";

import { executeMcpServerRequest } from "./request-executor.js";

describe("executeMcpServerRequest source acquisition planning", () => {
  it("uses source acquisition as context before selecting external mod evidence", async () => {
    const result = await executeMcpServerRequest({
      bootstrap: {
        runtimePolicy: { runtimeRoot: "/tmp/mcpskill-runtime" },
        workspaceContext: undefined
      },
      requestText: "Find source for a NeoForge mod from Modrinth without a workspace.",
      contextQuery: {
        externalModResolutionExecutor: ({ candidate }) => ({
          matched: candidate.routeStep === "external_mod_resolution",
          summary: "Resolved external mod candidate.",
          payload: {
            source: "external_mod_resolution",
            candidateId: candidate.id
          }
        })
      }
    });

    expect(result.executions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          status: "context",
          payload: expect.objectContaining({
            source: "source_acquisition_plan"
          })
        }),
        expect.objectContaining({
          routeStep: "external_mod_resolution",
          status: "selected",
          payload: expect.objectContaining({
            source: "external_mod_resolution"
          })
        })
      ])
    );
    expect(result.trace).toMatchObject({
      contextCandidateIds: ["candidate-1-source_acquisition_plan"],
      selectedCandidateId: "candidate-2-external_mod_resolution"
    });
  });
});
