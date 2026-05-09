import { describe, expect, it } from "vitest";

import type {
  CurrentRuntime,
  WorkspaceBootstrapContext,
  WorkspaceDescriptor
} from "minecraft-developing-mcp-shared-types";

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
          text: "Task internal routes: workspace.analyze -> context.query -> source.bundle."
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
          text: "Task internal routes: context.query -> source.bundle -> workspace.analyze."
        },
        {
          id: "task_evidence_policy",
          text:
            "Evidence policy: follow probejs_types -> docs_lookup in order; prefer local Gradle, LSP, ProbeJS, datapack/assets, logs, and JAR evidence before optional docs or remote lookup."
        },
        {
          id: "task_kubejs_scripting_policy",
          text: expect.stringContaining(
            "keep startup_scripts, server_scripts, client_scripts, and config responsibilities separate"
          )
        }
      ])
    );

    const kubejsTaskPolicy = brief.promptFragments.find(
      (fragment) => fragment.id === "task_kubejs_scripting_policy"
    );

    expect(kubejsTaskPolicy?.text).toContain(
      "prefer ProbeJS/d.ts quick info, snippets, item/fluid/tag/registry/recipe summaries"
    );
    expect(kubejsTaskPolicy?.text).toContain(
      "connect scripts to datapack and resource-pack evidence"
    );
    expect(kubejsTaskPolicy?.text).toContain(
      "avoid persistent console.* output in committed scripts"
    );
  });

  it("builds a libs-heavy Java mod task brief with local jar evidence before docs", () => {
    const brief = buildHarnessTaskBriefFromBootstrap({
      workspaceContext: createWorkspaceContext({
        kind: "java-mod",
        hasGradle: true,
        hasJavaSource: true,
        hasModArchives: true,
        buildFiles: ["/tmp/workspace/settings.gradle", "/tmp/workspace/build.gradle"],
        javaSourceRoots: ["/tmp/workspace/src/main/java"],
        modArchivePaths: ["/tmp/workspace/libs/l2library-3.0.4.jar"]
      }),
      requestText: "Inspect the L2 library integration points in this workspace."
    });

    expect(brief).toMatchObject({
      intent: {
        id: "workspace_default",
        confidence: "low",
        reasons: ["request text does not match a specialized harness intent"]
      },
      taskRoute: {
        reasons: [
          "fall back to the default workspace route when no specialized intent is detected"
        ],
        steps: ["workspace_source", "mod_archive_content", "docs_lookup"],
        preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
      },
      preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
    });

    expect(brief.promptFragments).toEqual(
      expect.arrayContaining([
        {
          id: "task_route_policy",
          text:
            "Task route: workspace_default via workspace_source -> mod_archive_content -> docs_lookup."
        },
        {
          id: "task_evidence_policy",
          text:
            "Evidence policy: follow workspace_source -> mod_archive_content -> docs_lookup in order; prefer local Gradle, LSP, ProbeJS, datapack/assets, logs, and JAR evidence before optional docs or remote lookup."
        }
      ])
    );
  });

  it("builds a client visual resource task brief with source and asset guidance before docs", () => {
    const brief = buildHarnessTaskBriefFromBootstrap({
      workspaceContext: createWorkspaceContext({
        kind: "java-mod",
        hasGradle: true,
        hasJavaSource: true,
        hasDatapack: true,
        hasModArchives: true,
        buildFiles: ["/tmp/workspace/build.gradle"],
        javaSourceRoots: ["/tmp/workspace/src/main/java"],
        datapackRoots: ["/tmp/workspace/src/main/resources"],
        modArchivePaths: ["/tmp/workspace/mods/visual-helper.jar"]
      }),
      requestText:
        "Wire the block entity renderer, model registration, blockstate, and client init for this visual block."
    });

    expect(brief).toMatchObject({
      intent: {
        id: "client_visual_resources",
        confidence: "high"
      },
      taskRoute: {
        reasons: [
          "client visual and resource tasks should inspect workspace source, assets, renderer bindings, and local mod archive content before docs"
        ],
        steps: [
          "workspace_source",
          "datapack_files",
          "mod_archive_content",
          "docs_lookup"
        ],
        preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
      },
      preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
    });

    expect(brief.promptFragments).toEqual(
      expect.arrayContaining([
        {
          id: "task_route_policy",
          text:
            "Task route: client_visual_resources via workspace_source -> datapack_files -> mod_archive_content -> docs_lookup."
        },
        expect.objectContaining({
          id: "task_evidence_policy",
          text: expect.stringContaining(
            "Check registry-to-asset links, client-only init, renderer/screen/model bindings, asset reference graphs, rendered state sync, and resource reload/cache boundaries before docs."
          )
        }),
        expect.objectContaining({
          id: "task_client_visual_capability_policy",
          text: expect.stringContaining(
            "translate low-knowledge visual requests into concrete Minecraft implementation chains"
          )
        })
      ])
    );
  });

  it("builds a Hotai patch workflow task brief without using mixin-last wording as the trigger", () => {
    const brief = buildHarnessTaskBriefFromBootstrap({
      workspaceContext: createWorkspaceContext({
        kind: "modpack",
        hasKubeJS: true,
        hasProbeJS: true,
        hasDatapack: true,
        hasModArchives: true,
        datapackRoots: ["/tmp/workspace/kubejs/data"],
        modArchivePaths: ["/tmp/workspace/mods/content.jar"]
      }),
      requestText:
        "Use Hotai badiff patches for com.example.content.Target in hotai/before_mixin."
    });

    expect(brief).toMatchObject({
      intent: {
        id: "hotai_patch_workflow",
        confidence: "high"
      },
      taskRoute: {
        steps: [
          "mod_archive_content",
          "probejs_types",
          "datapack_files",
          "docs_lookup"
        ],
        preferredTools: ["context.query", "source.bundle", "workspace.analyze"]
      }
    });

    expect(brief.promptFragments).toEqual(
      expect.arrayContaining([
        {
          id: "task_hotai_patch_workflow_policy",
          text: expect.stringContaining("Hotai/badiff/class patches")
        },
        {
          id: "task_hotai_patch_workflow_policy",
          text: expect.stringContaining("Do not use Hotai to replace resources or other coremods")
        },
        {
          id: "task_hotai_patch_workflow_policy",
          text: expect.stringContaining("Use Mixin-last guidance only after the Hotai workflow is already selected")
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
    detectorPackage: "minecraft-developing-mcp-workspace-detector",
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
