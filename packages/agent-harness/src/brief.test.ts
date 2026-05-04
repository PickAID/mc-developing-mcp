import { describe, expect, it } from "vitest";

import type {
  CurrentRuntime,
  WorkspaceBootstrapContext,
  WorkspaceDescriptor
} from "@mcpskill/shared-types";

import {
  buildHarnessBrief,
  buildHarnessBriefFromBootstrap
} from "./brief.js";

describe("buildHarnessBrief", () => {
  it("builds an unknown-workspace brief when no workspace context is available", () => {
    expect(buildHarnessBrief()).toEqual({
      snapshot: {
        workspaceKind: "unknown",
        detectorReasons: [],
        routePlan: {
          scenario: "unknown-workspace",
          reasons: ["workspace context is unavailable"],
          steps: []
        },
        facts: {
          hasGradle: false,
          hasJavaSource: false,
          hasKubeJS: false,
          hasProbeJS: false,
          hasModArchives: false,
          hasDatapack: false,
          hasResourcePack: false,
          buildFileCount: 0,
          javaSourceRootCount: 0,
          datapackRootCount: 0,
          resourcePackRootCount: 0,
          logPathCount: 0
        }
      },
      authoringPolicy: undefined,
      availableTools: [
        "workspace.analyze",
        "source.bundle",
        "context.query",
        "migration.analyze"
      ],
      preferredTools: ["workspace.analyze", "context.query"],
      promptFragments: [
        {
          id: "workspace_summary",
          text: "Workspace summary: kind=unknown; runtime unavailable; no workspace context was provided."
        },
        {
          id: "route_policy",
          text: "Default route: unavailable until workspace facts are available."
        },
        {
          id: "tool_policy",
          text: "Preferred tools: workspace.analyze -> context.query. Use migration.analyze only for explicit version migration requests."
        }
      ]
    });
  });

  it("builds a Java-mod brief with source-first tool guidance", () => {
    expect(
      buildHarnessBrief(
        createWorkspaceContext({
          kind: "java-mod",
          hasGradle: true,
          hasJavaSource: true,
          buildFiles: ["/tmp/workspace/build.gradle"],
          javaSourceRoots: ["/tmp/workspace/src/main/java"],
          reasons: ["found Gradle build file", "found Java source roots"],
          currentRuntime: {
            ...createCurrentRuntime(),
            source: "workspace-detect",
            confidence: "high",
            minecraftVersion: "1.20.1",
            loader: "forge"
          }
        })
      )
    ).toMatchObject({
      snapshot: {
        workspaceRoot: "/tmp/workspace",
        workspaceKind: "java-mod",
        routePlan: {
          scenario: "java-mod-workspace",
          defaultRoutingScenario: "project_symbol",
          steps: ["workspace_source", "docs_lookup"]
        }
      },
      preferredTools: ["source.bundle", "context.query", "workspace.analyze"],
      promptFragments: [
        {
          id: "workspace_summary",
          text: "Workspace summary: kind=java-mod; runtime=forge 1.20.1; gradle=yes; java=yes; kubejs=no; probejs=no; modArchives=no; datapack=no."
        },
        {
          id: "route_policy",
          text: "Default route: project_symbol via workspace_source -> docs_lookup."
        },
        {
          id: "tool_policy",
          text: "Preferred tools: source.bundle -> context.query -> workspace.analyze. Use migration.analyze only for explicit version migration requests."
        }
      ]
    });
  });

  it("consumes bootstrap-shaped input through a brief adapter helper", () => {
    expect(
      buildHarnessBriefFromBootstrap({
        workspaceContext: createWorkspaceContext({
          kind: "kubejs",
          hasKubeJS: true,
          hasProbeJS: true
        })
      })
    ).toMatchObject({
      snapshot: {
        workspaceKind: "kubejs",
        routePlan: {
          scenario: "kubejs-workspace",
          defaultRoutingScenario: "kubejs_script",
          steps: ["probejs_types", "docs_lookup"]
        }
      },
      authoringPolicy: {
        profile: "kubejs_script",
        preferredSignalOrder: [
          "probejs_types",
          "workspace_facts",
          "modding_docs"
        ]
      },
      preferredTools: ["context.query", "source.bundle", "workspace.analyze"],
      promptFragments: [
        {
          id: "workspace_summary"
        },
        {
          id: "route_policy",
          text: "Default route: kubejs_script via probejs_types -> docs_lookup."
        },
        {
          id: "tool_policy",
          text: "Preferred tools: context.query -> source.bundle -> workspace.analyze. Use migration.analyze only for explicit version migration requests."
        },
        {
          id: "kubejs_authoring_policy",
          text: expect.stringContaining("KubeJS authoring policy:")
        }
      ]
    });

    const brief = buildHarnessBriefFromBootstrap({
      workspaceContext: createWorkspaceContext({
        kind: "kubejs",
        hasKubeJS: true,
        hasProbeJS: true
      })
    });

    const kubejsPolicy = brief.promptFragments.find(
      (fragment) => fragment.id === "kubejs_authoring_policy"
    );

    expect(kubejsPolicy?.text).toContain(
      "treat KubeJS as Minecraft scripting infrastructure rather than generic JS"
    );
    expect(kubejsPolicy?.text).toContain(
      "avoid persistent console.* logging in committed scripts"
    );
    expect(kubejsPolicy?.text).toContain(
      "rely on ProbeJS, workspace facts, and modding docs before generic JavaScript guesses"
    );
    expect(kubejsPolicy?.text).toContain(
      "core KubeJS 1.20.1 ForgeEvents is startup_scripts-only"
    );
    expect(kubejsPolicy?.text).toContain(
      "NativeEvents needs EventJS on 1.20.1 or core KubeJS 1.21.1+"
    );
    expect(kubejsPolicy?.text).toContain(
      "global/Global usage as shared KubeJS state"
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
