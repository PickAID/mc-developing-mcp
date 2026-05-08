import { describe, expect, it } from "vitest";
import type {
  AgentRuntimeTaskIntentId,
  CurrentRuntime,
  DocsPackageManifest,
  McpServerRequestPlan,
  WorkspaceKind
} from "minecraft-developing-mcp-shared-types";
import { buildPackageRegistry } from "minecraft-developing-mcp-package-registry";

import {
  buildBuiltinDocsRegistry,
  CRYCHICDOC_KUBEJS_1201_PACKAGE,
  selectDocsPackages
} from "./index.js";

describe("selectDocsPackages", () => {
  it("selects the CrychicDoc KubeJS package for 1.20.1 KubeJS authoring docs lookup", () => {
    const result = selectDocsPackages({
      requestPlan: createRequestPlan({
        requestText:
          "How should I place this startup_scripts recipe and use ProbeJS in 1.20.1?",
        taskIntentId: "kubejs_authoring",
        workspaceKind: "modpack",
        runtime: {
          minecraftVersion: "1.20.1",
          source: "workspace-detect",
          confidence: "high",
          evidenceSources: ["build.gradle"],
          candidates: [],
          evidence: []
        },
        hasKubeJS: true,
        hasProbeJS: true
      }),
      routeStep: "docs_lookup"
    });

    expect(result.selections).toHaveLength(1);
    expect(result.selections[0]).toMatchObject({
      packageId: CRYCHICDOC_KUBEJS_1201_PACKAGE.packageId,
      score: expect.any(Number),
      matchedSignals: expect.arrayContaining(["startup_scripts", "probejs"]),
      reasons: expect.arrayContaining([
        "task intent is kubejs_authoring",
        "workspace runtime matches Minecraft 1.20.1",
        "route step is docs_lookup"
      ])
    });
    expect(result.trace.registryPackageIds).toEqual([
      CRYCHICDOC_KUBEJS_1201_PACKAGE.packageId
    ]);
  });

  it("rejects the CrychicDoc package when the workspace runtime is not 1.20.1", () => {
    const result = selectDocsPackages({
      requestPlan: createRequestPlan({
        requestText: "How do I use ProbeJS in this KubeJS pack?",
        taskIntentId: "kubejs_authoring",
        workspaceKind: "modpack",
        runtime: {
          minecraftVersion: "1.21",
          source: "workspace-detect",
          confidence: "high",
          evidenceSources: ["build.gradle"],
          candidates: [],
          evidence: []
        },
        hasKubeJS: true,
        hasProbeJS: true
      }),
      routeStep: "docs_lookup"
    });

    expect(result.selections).toEqual([]);
    expect(result.trace.rejectedPackages).toEqual([
      {
        packageId: CRYCHICDOC_KUBEJS_1201_PACKAGE.packageId,
        reason: "workspace runtime 1.21 is outside the package version fence"
      }
    ]);
  });

  it("rejects the CrychicDoc package for non-KubeJS crash triage requests", () => {
    const result = selectDocsPackages({
      requestPlan: createRequestPlan({
        requestText:
          "The server crashes on startup and latest.log shows an exception in a mod.",
        taskIntentId: "crash_triage",
        workspaceKind: "java-mod",
        runtime: {
          minecraftVersion: "1.20.1",
          source: "workspace-detect",
          confidence: "medium",
          evidenceSources: ["build.gradle"],
          candidates: [],
          evidence: []
        },
        hasKubeJS: false,
        hasProbeJS: false
      }),
      routeStep: "docs_lookup"
    });

    expect(result.selections).toEqual([]);
    expect(result.trace.rejectedPackages).toEqual([
      {
        packageId: CRYCHICDOC_KUBEJS_1201_PACKAGE.packageId,
        reason: "task intent crash_triage is outside the package intent scope"
      }
    ]);
  });

  it("returns the builtin registry with the CrychicDoc package manifest", () => {
    const registry = buildBuiltinDocsRegistry();

    expect(registry.packageIds).toEqual([
      CRYCHICDOC_KUBEJS_1201_PACKAGE.packageId
    ]);
    expect(registry.packages[0]).toMatchObject({
      packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn",
      origin: "crychicdoc",
      domain: "kubejs",
      language: "zh-CN",
      minecraftVersions: ["1.20.1"]
    });
  });

  it("matches client visual docs with asset, shader, API, and migration signals", () => {
    const shaderDocs: DocsPackageManifest = {
      packageId: "minecraft-26.1-docs-shader-client-visual",
      origin: "mdm",
      title: "Minecraft Client Visual Shader Notes",
      language: "en",
      domain: "shader",
      summary: "Client visual shader, UI, render pipeline, and migration evidence.",
      minecraftVersions: ["26.1"],
      preferredIntents: ["client_visual_resources"],
      kinds: ["shader-reference", "format-reference", "migration-map"],
      topics: ["shader", "post chain", "scalable ui", "render pipeline"],
      querySignals: {
        queryTerms: ["shader", "post chain"],
        addonNames: [],
        scriptScopes: [],
        eventNames: [],
        assetKinds: ["shaders", "post_effect", "nine_slice_metadata"],
        resourceFormats: ["scalable-ui", "shader-json"],
        shaderTerms: ["uniform", "sampler"],
        apiSymbols: ["draw-context-role"],
        migrationTerms: ["role-equivalent"]
      },
      versionFence: {
        minecraftVersions: ["26.1"],
        strict: true
      }
    };

    const result = selectDocsPackages({
      requestPlan: createRequestPlan({
        requestText:
          "Need shader post chain uniform sampler role-equivalent migration with scalable-ui asset evidence in 26.1.",
        taskIntentId: "client_visual_resources",
        workspaceKind: "java-mod",
        runtime: {
          minecraftVersion: "26.1",
          source: "workspace-detect",
          confidence: "high",
          evidenceSources: ["build.gradle"],
          candidates: [],
          evidence: []
        },
        hasKubeJS: false,
        hasProbeJS: false
      }),
      routeStep: "docs_lookup",
      registry: buildPackageRegistry([shaderDocs])
    });

    expect(result.selections[0]).toMatchObject({
      packageId: shaderDocs.packageId,
      matchedSignals: expect.arrayContaining([
        "shader",
        "post chain",
        "uniform",
        "sampler",
        "scalable-ui",
        "role-equivalent"
      ])
    });
  });
});

function createRequestPlan(input: {
  requestText: string;
  taskIntentId: AgentRuntimeTaskIntentId;
  workspaceKind: WorkspaceKind;
  runtime: CurrentRuntime;
  hasKubeJS: boolean;
  hasProbeJS: boolean;
}): McpServerRequestPlan {
  return {
    appId: "mcp-server",
    requestText: input.requestText,
    requestContext: {
      appId: "mcp-server",
      requestText: input.requestText,
      workspaceContext: {
        workspaceRoot: "/tmp/workspace",
        detectorPackage: "minecraft-developing-mcp-workspace-detector",
        descriptor: {
          root: "/tmp/workspace",
          kind: input.workspaceKind,
          hasGradle: true,
          hasKubeJS: input.hasKubeJS,
          hasProbeJS: input.hasProbeJS,
          hasJavaSource: input.workspaceKind === "java-mod",
          hasDatapack: false,
          buildFiles: ["/tmp/workspace/build.gradle"],
          javaSourceRoots: input.workspaceKind === "java-mod" ? ["/tmp/workspace/src/main/java"] : [],
          datapackRoots: [],
          logPaths: [],
          reasons: [],
          currentRuntime: input.runtime
        }
      },
      harnessSnapshot: {
        workspaceRoot: "/tmp/workspace",
        workspaceKind: input.workspaceKind,
        detectorReasons: [],
        currentRuntime: input.runtime,
        routePlan: {
          scenario: input.workspaceKind === "java-mod" ? "java-mod-workspace" : "modpack-workspace",
          reasons: [],
          defaultRoutingScenario: "project_symbol",
          steps: ["workspace_source", "docs_lookup"]
        },
        facts: {
          hasGradle: true,
          hasJavaSource: input.workspaceKind === "java-mod",
          hasKubeJS: input.hasKubeJS,
          hasProbeJS: input.hasProbeJS,
          hasDatapack: false,
          buildFileCount: 1,
          javaSourceRootCount: input.workspaceKind === "java-mod" ? 1 : 0,
          datapackRootCount: 0,
          logPathCount: 0
        }
      },
      harnessBrief: {
        snapshot: {} as never,
        availableTools: ["workspace.analyze", "source.bundle", "context.query", "migration.analyze"],
        preferredTools: ["context.query"],
        promptFragments: []
      },
      taskBrief: {
        snapshot: {} as never,
        intent: {
          id: input.taskIntentId,
          confidence: "high",
          reasons: []
        },
        taskRoute: {
          intent: {
            id: input.taskIntentId,
            confidence: "high",
            reasons: []
          },
          reasons: [],
          steps: input.taskIntentId === "kubejs_authoring" ? ["probejs_types", "docs_lookup"] : ["log_files", "workspace_source", "docs_lookup"],
          preferredTools: ["context.query"]
        },
        availableTools: ["workspace.analyze", "source.bundle", "context.query", "migration.analyze"],
        preferredTools: ["context.query"],
        promptFragments: []
      }
    },
    prompt: {
      sections: [],
      text: input.requestText
    },
    toolGuidance: {
      availableTools: ["workspace.analyze", "source.bundle", "context.query", "migration.analyze"],
      preferredTools: ["context.query"],
      routeSteps: input.taskIntentId === "kubejs_authoring" ? ["probejs_types", "docs_lookup"] : ["log_files", "workspace_source", "docs_lookup"]
    },
    trace: {
      workspaceKind: input.workspaceKind,
      defaultRouteScenario: "project_symbol",
      defaultRouteSteps: ["workspace_source", "docs_lookup"],
      taskIntent: {
        id: input.taskIntentId,
        confidence: "high",
        reasons: []
      },
      taskRouteReasons: [],
      taskRouteSteps: input.taskIntentId === "kubejs_authoring" ? ["probejs_types", "docs_lookup"] : ["log_files", "workspace_source", "docs_lookup"],
      selectedPromptFragmentIds: []
    }
  };
}
