import { describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../bootstrap/bootstrap.js";
import { buildMcpServerContextQueryExecutor } from "./context-query-executor.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";

describe("buildMcpServerContextQueryExecutor external mod credentials", () => {
  it("passes CurseForge resolver options through the default external mod route", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime"
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Find the CurseForge mod jei forge 1.20.1."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "external_mod_resolution"
    );
    const requestHeaders: string[] = [];
    const executor = buildMcpServerContextQueryExecutor({
      externalModCurseForgeApiKey: "test-key",
      externalModCurseForgeFetch: async (url, init) => {
        const headers = init?.headers as Record<string, string>;
        requestHeaders.push(headers["x-api-key"]);

        if (url.toString().includes("/v1/mods/search")) {
          return jsonResponse({
            data: [
              {
                id: 238222,
                name: "Just Enough Items (JEI)",
                slug: "jei"
              }
            ]
          });
        }

        return jsonResponse({
          data: [
            {
              id: 7920915,
              displayName: "15.20.0.130 for Forge 1.20.1",
              fileName: "jei-1.20.1-forge-15.20.0.130.jar",
              downloadUrl: "https://mediafilez.forgecdn.net/files/7920/915/jei.jar",
              gameVersions: ["1.20.1", "Forge"],
              hashes: []
            }
          ]
        });
      }
    });

    if (!candidate) {
      throw new Error("Expected external_mod_resolution candidate.");
    }

    const result = await executor({ candidate, evidencePlan, requestPlan });

    expect(requestHeaders).toEqual(["test-key", "test-key"]);
    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "external_mod_resolution",
        result: {
          source: "curseforge",
          candidates: [
            {
              projectId: "238222",
              mavenArtifacts: [
                {
                  coordinates: "curse.maven:jei-238222:7920915"
                }
              ]
            }
          ]
        }
      }
    });
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}
