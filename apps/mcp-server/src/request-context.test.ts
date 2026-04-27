import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import {
  buildMcpServerRequestContext,
  buildMcpServerRequestContextFromBootstrap
} from "./request-context.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("buildMcpServerRequestContext", () => {
  it("builds a workspace-default request context when no workspace context exists", () => {
    const bootstrap = buildMcpServerBootstrap("/tmp/mcpskill-runtime");

    expect(
      buildMcpServerRequestContext(bootstrap, "Help me inspect this workspace.")
    ).toMatchObject({
      appId: "mcp-server",
      requestText: "Help me inspect this workspace.",
      harnessSnapshot: {
        workspaceKind: "unknown"
      },
      taskBrief: {
        intent: {
          id: "workspace_default",
          confidence: "low"
        },
        taskRoute: {
          steps: [],
          preferredTools: ["workspace.analyze", "context.query"]
        }
      }
    });
  });

  it("builds a KubeJS-aware request context from bootstrap workspace data", async () => {
    const workspaceRoot = createKubejsWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot
      }
    });

    expect(
      buildMcpServerRequestContextFromBootstrap({
        workspaceContext: bootstrap.workspaceContext,
        requestText: "Add a KubeJS startup_scripts recipe for this modpack."
      })
    ).toMatchObject({
      appId: "mcp-server",
      workspaceContext: {
        workspaceRoot
      },
      harnessSnapshot: {
        workspaceKind: "kubejs",
        routePlan: {
          scenario: "kubejs-workspace",
          defaultRoutingScenario: "kubejs_script",
          steps: ["probejs_types", "docs_lookup"]
        }
      },
      harnessBrief: {
        authoringPolicy: {
          profile: "kubejs_script"
        }
      },
      taskBrief: {
        intent: {
          id: "kubejs_authoring",
          confidence: "high"
        },
        taskRoute: {
          steps: ["probejs_types", "docs_lookup"],
          preferredTools: ["context.query", "source.bundle", "workspace.analyze"]
        }
      }
    });

    const requestContext = buildMcpServerRequestContextFromBootstrap({
      workspaceContext: bootstrap.workspaceContext,
      requestText: "Add a KubeJS startup_scripts recipe for this modpack."
    });

    expect(requestContext.taskBrief.promptFragments).toEqual(
      expect.arrayContaining([
        {
          id: "kubejs_authoring_policy",
          text: expect.stringContaining("KubeJS authoring policy:")
        },
        {
          id: "task_intent_summary",
          text: "Task intent: kubejs_authoring; confidence=high."
        },
        {
          id: "task_route_policy",
          text: "Task route: kubejs_authoring via probejs_types -> docs_lookup."
        },
        {
          id: "task_tool_policy",
          text: "Task tools: context.query -> source.bundle -> workspace.analyze."
        }
      ])
    );
  });
});

function createKubejsWorkspace(): string {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "mcpskill-mcp-server-kjs-"));
  tempRoots.push(workspaceRoot);

  mkdirSync(join(workspaceRoot, "kubejs", "startup_scripts"), {
    recursive: true
  });
  mkdirSync(join(workspaceRoot, ".probejs"), { recursive: true });
  writeFileSync(
    join(workspaceRoot, "kubejs", "startup_scripts", "main.js"),
    "ServerEvents.recipes(event => {})\n"
  );
  writeFileSync(
    join(workspaceRoot, ".probejs", "manifest.json"),
    JSON.stringify({ generatedAt: "2026-04-21T00:00:00Z" })
  );

  return workspaceRoot;
}
