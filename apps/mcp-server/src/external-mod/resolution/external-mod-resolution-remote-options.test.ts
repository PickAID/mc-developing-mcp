import { describe, expect, it } from "vitest";
import type { ExternalModResolverResult } from "@mcpskill/external-mod-resolver";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { executeMcpServerExternalModResolution } from "./external-mod-resolution-executor.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";

describe("executeMcpServerExternalModResolution remote options", () => {
  it("passes configured Modrinth fetch options into the resolver", async () => {
    const fetcher = async () => jsonResponse({});
    const input = await createExecutorInput(
      "Find the Modrinth mod sodium fabric 1.20.1."
    );

    const result = await executeMcpServerExternalModResolution(input, {
      modrinthFetch: fetcher,
      modrinthApiBaseUrl: "https://modrinth.fixture",
      modrinthResolver: async (request) => {
        expect(request.fetch).toBe(fetcher);
        expect(request.apiBaseUrl).toBe("https://modrinth.fixture");
        return emptyResult("modrinth", request.query);
      }
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "external_mod_resolution",
        request: {
          platform: "modrinth",
          query: "sodium"
        },
        result: {
          source: "modrinth",
          query: "sodium"
        }
      }
    });
  });

  it("passes configured Maven metadata fetch into the resolver", async () => {
    const fetcher = async () => jsonResponse({});
    const input = await createExecutorInput(
      'Use modImplementation "com.example:demo-mod" from https://maven.example/releases.'
    );

    await executeMcpServerExternalModResolution(input, {
      mavenFetch: fetcher,
      mavenResolver: async (request) => {
        expect(request.fetch).toBe(fetcher);
        expect(request.coordinate).toBe("com.example:demo-mod");
        return emptyResult("maven", request.coordinate);
      }
    });
  });
});

async function createExecutorInput(requestText: string) {
  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot: "/tmp/mcpskill-runtime"
  });
  const requestPlan = buildMcpServerRequestPlan(bootstrap, requestText);
  const evidencePlan = buildMcpServerEvidencePlan(requestPlan);

  return {
    candidate: evidencePlan.candidates[0],
    evidencePlan,
    requestPlan
  };
}

function emptyResult(
  source: "maven" | "modrinth",
  query: string
): ExternalModResolverResult {
  return {
    source,
    query,
    candidates: [],
    warnings: []
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}
