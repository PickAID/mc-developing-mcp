import { describe, expect, it } from "vitest";

import type {
  CurrentRuntime,
  WorkspaceBootstrapContext,
  WorkspaceDescriptor
} from "@mcpskill/shared-types";

import {
  buildHarnessTaskBrief,
  buildHarnessTaskBriefFromBootstrap
} from "./task-brief.js";

describe("buildHarnessTaskBrief", () => {
  it("builds a crash-triage task brief with log-first routing", () => {
    expect(
      buildHarnessTaskBrief(
        createWorkspaceContext({
          kind: "modpack",
          hasGradle: true,
          logPaths: ["/tmp/workspace/logs/latest.log"]
        }),
        "The server crashes on startup and latest.log shows an exception."
      )
    ).toMatchObject({
      intent: {
        id: "crash_triage",
        confidence: "high"
      },
      taskRoute: {
        steps: [
          "log_files",
          "external_mod_resolution",
          "workspace_source",
          "docs_lookup"
        ],
        preferredTools: [
          "workspace.analyze",
          "context.query",
          "source.bundle"
        ]
      },
      preferredTools: ["workspace.analyze", "context.query", "source.bundle"]
    });

    const brief = buildHarnessTaskBrief(
      createWorkspaceContext({
        kind: "modpack",
        hasGradle: true,
        logPaths: ["/tmp/workspace/logs/latest.log"]
      }),
      "The server crashes on startup and latest.log shows an exception."
    );

    expect(brief.promptFragments).toEqual(
      expect.arrayContaining([
        {
          id: "workspace_summary",
          text: "Workspace summary: kind=modpack; runtime=unavailable; gradle=yes; java=no; kubejs=no; probejs=no; modArchives=no; datapack=no."
        },
        {
          id: "route_policy",
          text: "Default route: project_symbol via workspace_source -> docs_lookup."
        },
        {
          id: "task_intent_summary",
          text: "Task intent: crash_triage; confidence=high."
        },
        {
          id: "task_route_policy",
          text:
            "Task route: crash_triage via log_files -> external_mod_resolution -> workspace_source -> docs_lookup."
        },
        {
          id: "task_tool_policy",
          text: "Task tools: workspace.analyze -> context.query -> source.bundle."
        },
        {
          id: "task_evidence_policy",
          text:
            "Evidence policy: follow log_files -> external_mod_resolution -> workspace_source -> docs_lookup in order; prefer local Gradle, LSP, ProbeJS, datapack/assets, logs, and JAR evidence before optional docs or remote lookup."
        }
      ])
    );
  });

  it("builds a KubeJS task brief with authoring policy and ProbeJS-first routing", () => {
    expect(
      buildHarnessTaskBriefFromBootstrap({
        workspaceContext: createWorkspaceContext({
          kind: "modpack",
          hasGradle: true,
          hasKubeJS: true,
          hasProbeJS: true
        }),
        requestText: "Add a KubeJS startup_scripts recipe for this modpack."
      })
    ).toMatchObject({
      authoringPolicy: {
        profile: "kubejs_script"
      },
      intent: {
        id: "kubejs_authoring",
        confidence: "high"
      },
      taskRoute: {
        steps: ["probejs_types", "docs_lookup"],
        preferredTools: ["context.query", "source.bundle", "workspace.analyze"]
      },
      preferredTools: ["context.query", "source.bundle", "workspace.analyze"]
    });

    const brief = buildHarnessTaskBriefFromBootstrap({
      workspaceContext: createWorkspaceContext({
        kind: "modpack",
        hasGradle: true,
        hasKubeJS: true,
        hasProbeJS: true
      }),
      requestText: "Add a KubeJS startup_scripts recipe for this modpack."
    });

    expect(brief.promptFragments).toEqual(
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
        },
        {
          id: "task_evidence_policy",
          text:
            "Evidence policy: follow probejs_types -> docs_lookup in order; prefer local Gradle, LSP, ProbeJS, datapack/assets, logs, and JAR evidence before optional docs or remote lookup."
        },
        {
          id: "task_kubejs_scripting_policy",
          text:
            "KubeJS policy: treat scripts as Minecraft lifecycle scripting, not a generic JS project; use ProbeJS/d.ts evidence and avoid persistent console.* debug output."
        }
      ])
    );
  });
});

function createWorkspaceContext(
  overrides: Partial<WorkspaceDescriptor>
): WorkspaceBootstrapContext {
  const descriptor: WorkspaceDescriptor = {
    root: "/tmp/workspace",
    kind: "unknown",
    hasGradle: false,
    hasKubeJS: false,
    hasProbeJS: false,
    hasModArchives: false,
    hasJavaSource: false,
    hasDatapack: false,
    buildFiles: [],
    javaSourceRoots: [],
    modArchivePaths: [],
    datapackRoots: [],
    logPaths: [],
    reasons: [],
    currentRuntime: createCurrentRuntime(),
    ...overrides
  };

  return {
    workspaceRoot: descriptor.root,
    detectorPackage: "@mcpskill/workspace-detector",
    descriptor
  };
}

function createCurrentRuntime(): CurrentRuntime {
  return {
    source: "unknown",
    confidence: "unknown",
    evidenceSources: [],
    candidates: [],
    evidence: []
  };
}
