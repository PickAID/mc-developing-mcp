import { describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { executeMcpServerRequest } from "./request-executor.js";

describe("executeMcpServerRequest external mod routing", () => {
  it("selects external mod resolution through the context.query evidence chain", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime"
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText:
        "Find the Modrinth Maven modImplementation coordinate for Sodium fabric 1.20.1.",
      contextQuery: {
        externalModResolutionExecutor: ({ candidate }) => ({
          matched: true,
          summary: "Resolved maven.modrinth:sodium:OihdIimA.",
          payload: {
            source: "external_mod_resolution",
            candidateId: candidate.id,
            coordinate: "maven.modrinth:sodium:OihdIimA"
          }
        })
      }
    });

    expect(result.selectedEvidence).toMatchObject({
      candidateId: "candidate-1-external_mod_resolution",
      routeStep: "external_mod_resolution",
      preferredTool: "context.query",
      status: "selected",
      payload: {
        source: "external_mod_resolution",
        coordinate: "maven.modrinth:sodium:OihdIimA"
      }
    });
    expect(result.executions).toHaveLength(1);
    expect(result.trace).toMatchObject({
      selectedCandidateId: "candidate-1-external_mod_resolution",
      routeSteps: ["external_mod_resolution", "docs_lookup"],
      failedCandidateIds: []
    });
  });
});
