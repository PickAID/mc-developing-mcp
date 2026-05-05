import { describe, expect, it } from "vitest";

import { toSmokeLine } from "./real-workspace-smoke.js";

describe("real workspace smoke output", () => {
  it("prints only compact payload metadata", () => {
    const line = toSmokeLine({
      requestText: "Query ProbeJS symbol ServerEvents.recipes",
      workspaceKind: "modpack-workspace",
      execution: {
        routeStep: "probejs_types",
        status: "selected",
        summary: "Resolved symbol.",
        payload: {
          source: "kubejs_language_service",
          mode: "symbol_query",
          content: "private user script content",
          references: [{ content: "nested private content" }]
        }
      }
    });

    expect(line).toEqual({
      requestText: "Query ProbeJS symbol ServerEvents.recipes",
      workspaceKind: "modpack-workspace",
      routeStep: "probejs_types",
      status: "selected",
      summary: "Resolved symbol.",
      source: "kubejs_language_service",
      mode: "symbol_query",
      payloadKeys: ["content", "mode", "references", "source"]
    });
    expect(JSON.stringify(line)).not.toContain("private user script content");
    expect(JSON.stringify(line)).not.toContain("nested private content");
  });
});
