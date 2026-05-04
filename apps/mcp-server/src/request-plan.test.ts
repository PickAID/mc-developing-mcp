import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import {
  buildMcpServerRequestPlan,
  buildMcpServerRequestPlanFromBootstrap
} from "./request-plan.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("buildMcpServerRequestPlan", () => {
  it("assembles prompt sections and tool guidance for KubeJS authoring requests", async () => {
    const workspaceRoot = createKubejsWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot
      }
    });

    const plan = buildMcpServerRequestPlanFromBootstrap({
      workspaceContext: bootstrap.workspaceContext,
      requestText: "Add a KubeJS startup_scripts recipe for this modpack."
    });

    expect(plan).toMatchObject({
      appId: "mcp-server",
      requestText: "Add a KubeJS startup_scripts recipe for this modpack.",
      prompt: {
        sections: [
          {
            id: "request_text",
            role: "user",
            title: "User Request",
            text: "Add a KubeJS startup_scripts recipe for this modpack."
          },
          {
            id: "workspace_summary",
            role: "system",
            title: "Workspace Summary"
          },
          {
            id: "route_policy",
            role: "system",
            title: "Default Route Policy",
            text: "Default route: kubejs_script via probejs_types -> docs_lookup."
          },
          {
            id: "tool_policy",
            role: "system",
            title: "Tool Policy",
            text: "Preferred tools: context.query -> source.bundle -> workspace.analyze. Use migration.analyze only for explicit version migration requests."
          },
          {
            id: "kubejs_authoring_policy",
            role: "system",
            title: "KubeJS Authoring Policy"
          },
          {
            id: "task_intent_summary",
            role: "system",
            title: "Task Intent"
          },
          {
            id: "task_route_policy",
            role: "system",
            title: "Task Route Policy"
          },
          {
            id: "task_tool_policy",
            role: "system",
            title: "Task Tool Policy"
          },
          {
            id: "task_evidence_policy",
            role: "system",
            title: "Task Evidence Policy"
          },
          {
            id: "task_kubejs_scripting_policy",
            role: "system",
            title: "Task KubeJS Scripting Policy"
          }
        ],
        text: expect.stringContaining(
          "[KubeJS Authoring Policy]\nKubeJS authoring policy:"
        )
      },
      toolGuidance: {
        availableTools: [
          "workspace.analyze",
          "source.bundle",
          "context.query",
          "migration.analyze"
        ],
        preferredTools: ["context.query", "source.bundle", "workspace.analyze"],
        routeSteps: ["probejs_types", "docs_lookup"]
      },
      trace: {
        workspaceKind: "kubejs",
        defaultRouteScenario: "kubejs_script",
        defaultRouteSteps: ["probejs_types", "docs_lookup"],
        taskIntent: {
          id: "kubejs_authoring",
          confidence: "high"
        },
        taskRouteSteps: ["probejs_types", "docs_lookup"],
        selectedPromptFragmentIds: [
          "workspace_summary",
          "route_policy",
          "tool_policy",
          "kubejs_authoring_policy",
          "task_intent_summary",
          "task_route_policy",
          "task_tool_policy",
          "task_evidence_policy",
          "task_kubejs_scripting_policy"
        ]
      }
    });
    expect(plan.prompt.text).toContain(
      "[User Request]\nAdd a KubeJS startup_scripts recipe for this modpack."
    );
    expect(plan.trace.taskRouteReasons).toEqual([
      "KubeJS authoring should inspect ProbeJS or d.ts context before docs"
    ]);
  });

  it("preserves log-first crash routing in the assembled request plan", async () => {
    const workspaceRoot = createCrashWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot
      }
    });

    const plan = buildMcpServerRequestPlan(bootstrap, [
      "The server crashes on startup",
      "and latest.log shows an exception in a mod."
    ].join(" "));

    expect(plan.toolGuidance).toEqual({
      availableTools: [
        "workspace.analyze",
        "source.bundle",
        "context.query",
        "migration.analyze"
      ],
      preferredTools: ["workspace.analyze", "context.query", "source.bundle"],
      routeSteps: [
        "log_files",
        "external_mod_resolution",
        "workspace_source",
        "docs_lookup"
      ]
    });
    expect(plan.trace).toMatchObject({
      workspaceKind: "java-mod",
      defaultRouteScenario: "project_symbol",
      taskIntent: {
        id: "crash_triage",
        confidence: "high"
      },
      taskRouteSteps: [
        "log_files",
        "external_mod_resolution",
        "workspace_source",
        "docs_lookup"
      ]
    });
    expect(plan.prompt.sections.map((section) => section.id)).toEqual([
      "request_text",
      "workspace_summary",
      "route_policy",
      "tool_policy",
      "task_intent_summary",
      "task_route_policy",
      "task_tool_policy",
      "task_evidence_policy"
    ]);
    expect(plan.prompt.text).toContain(
      "[Task Route Policy]\nTask route: crash_triage via log_files -> external_mod_resolution -> workspace_source -> docs_lookup."
    );
    expect(plan.prompt.text).toContain(
      "[Task Evidence Policy]\nEvidence policy: follow log_files -> external_mod_resolution -> workspace_source -> docs_lookup in order;"
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
    JSON.stringify({ generatedAt: "2026-04-22T00:00:00Z" })
  );

  return workspaceRoot;
}

function createCrashWorkspace(): string {
  const workspaceRoot = mkdtempSync(
    join(tmpdir(), "mcpskill-mcp-server-crash-")
  );
  tempRoots.push(workspaceRoot);

  mkdirSync(join(workspaceRoot, "logs"), { recursive: true });
  writeFileSync(
    join(workspaceRoot, "build.gradle"),
    [
      'plugins { id "net.minecraftforge.gradle" }',
      "dependencies {",
      '  minecraft "net.minecraftforge:forge:1.20.1-47.2.0"',
      "}"
    ].join("\n")
  );
  writeFileSync(
    join(workspaceRoot, "logs", "latest.log"),
    [
      "[00:00:00] [main/ERROR]: Failed to start server",
      "java.lang.RuntimeException: example crash"
    ].join("\n")
  );

  return workspaceRoot;
}
