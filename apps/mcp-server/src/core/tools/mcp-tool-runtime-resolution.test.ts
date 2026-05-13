import { describe, expect, it } from "vitest";

import { resolveMcpRuntimeEnvironment } from "./mcp-tool-runtime-resolution.js";

describe("resolveMcpRuntimeEnvironment", () => {
  it("lets tool input override instance and process environment roots", () => {
    const runtimeEnvironment = resolveMcpRuntimeEnvironment(
      {
        requestText: "Check docs.",
        runtimeRoot: "/input/runtime",
        workspaceRoot: "/input/workspace",
        mdmSourcesRoot: "/input/mdm-sources",
        prismRoot: "/input/prism"
      },
      {
        env: {
          MC_DEVELOPING_MCP_RUNTIME_ROOT: "/env/runtime",
          MC_DEVELOPING_MCP_WORKSPACE_ROOT: "/env/workspace",
          MDM_SOURCES_ROOT: "/env/mdm-sources",
          MC_DEVELOPING_MCP_PRISM_ROOT: "/env/prism"
        },
        cwd: "/cwd/workspace"
      }
    );

    expect(runtimeEnvironment.values).toEqual({
      runtimeRoot: "/input/runtime",
      workspaceRoot: "/input/workspace",
      mdmSourcesRoot: "/input/mdm-sources",
      prismRoot: "/input/prism"
    });
    expect(runtimeEnvironment.sources).toEqual({
      runtimeRoot: "input",
      workspaceRoot: "input",
      mdmSourcesRoot: "input",
      prismRoot: "input"
    });
    expect(runtimeEnvironment.envPatch).toMatchObject({
      MC_DEVELOPING_MCP_RUNTIME_ROOT: "/input/runtime",
      MC_DEVELOPING_MCP_WORKSPACE_ROOT: "/input/workspace",
      MDM_SOURCES_ROOT: "/input/mdm-sources",
      MC_DEVELOPING_MCP_PRISM_ROOT: "/input/prism"
    });
  });

  it("lets instance defaults override inherited process MDM source roots", () => {
    const previousRoot = process.env.MDM_SOURCES_ROOT;

    process.env.MDM_SOURCES_ROOT = "/process/mdm-sources";
    try {
      const runtimeEnvironment = resolveMcpRuntimeEnvironment(
        {
          requestText: "Check docs."
        },
        {
          env: {
            MDM_SOURCES_DEFAULT_ROOT: "/instance/default-mdm-sources"
          },
          cwd: "/cwd/workspace"
        }
      );

      expect(runtimeEnvironment.values.mdmSourcesRoot).toBe(
        "/instance/default-mdm-sources"
      );
      expect(runtimeEnvironment.sources.mdmSourcesRoot).toBe(
        "instance_default"
      );
      expect(runtimeEnvironment.inputPatch).toMatchObject({
        mdmSourcesRoot: "/instance/default-mdm-sources"
      });
    } finally {
      if (previousRoot === undefined) {
        delete process.env.MDM_SOURCES_ROOT;
      } else {
        process.env.MDM_SOURCES_ROOT = previousRoot;
      }
    }
  });
});
