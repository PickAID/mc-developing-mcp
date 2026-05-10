import { describe, expect, it } from "vitest";

import { parseSmokeConfig, toSmokeLine } from "./real-workspace-smoke.js";

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

  it("accepts current environment variable names for workspace and runtime roots", () => {
    const config = parseSmokeConfig([], {
      MC_DEVELOPING_MCP_SMOKE_WORKSPACE_ROOT: "/tmp/current-smoke-workspace",
      MC_DEVELOPING_MCP_RUNTIME_ROOT: "/tmp/current-smoke-runtime"
    });

    expect(config).toEqual({
      workspaceRoot: "/tmp/current-smoke-workspace",
      runtimeRoot: "/tmp/current-smoke-runtime"
    });
  });

  it("points missing workspace guidance at current environment variable names", () => {
    expect(() => parseSmokeConfig([], {})).toThrow(
      "Missing workspaceRoot. Pass --workspaceRoot, positional argv, or MC_DEVELOPING_MCP_SMOKE_WORKSPACE_ROOT."
    );
  });
});
