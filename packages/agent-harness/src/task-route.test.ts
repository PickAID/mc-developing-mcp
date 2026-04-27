import { describe, expect, it } from "vitest";

import type {
  AgentRuntimeHarnessSnapshot,
  CurrentRuntime
} from "@mcpskill/shared-types";

import {
  buildHarnessTaskRoute,
  buildHarnessTaskRouteFromSnapshot
} from "./task-route.js";

describe("buildHarnessTaskRoute", () => {
  it("routes crash triage requests to logs before source and docs", () => {
    expect(
      buildHarnessTaskRoute(
        createSnapshot({
          workspaceKind: "modpack",
          routePlan: {
            scenario: "modpack-workspace",
            reasons: ["workspace descriptor reports a modpack workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "docs_lookup"]
          },
          facts: {
            ...createFacts(),
            hasGradle: true,
            hasKubeJS: true,
            hasProbeJS: true,
            logPathCount: 2
          }
        }),
        "The pack crashes and latest.log shows a mixin exception."
      )
    ).toEqual({
      intent: {
        id: "crash_triage",
        confidence: "high",
        reasons: [
          "request text mentions crash or log-triage keywords",
          "workspace snapshot exposes log files for crash triage"
        ]
      },
      reasons: [
        "crash triage should inspect log files before source or docs"
      ],
      steps: ["log_files", "workspace_source", "docs_lookup"],
      preferredTools: ["workspace.analyze", "source.bundle", "context.query"]
    });
  });

  it("adds mod archive content before docs for crash triage in modpacks", () => {
    expect(
      buildHarnessTaskRoute(
        createSnapshot({
          workspaceKind: "modpack",
          routePlan: {
            scenario: "modpack-workspace",
            reasons: ["workspace descriptor reports a modpack workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "mod_archive_content", "docs_lookup"]
          },
          facts: {
            ...createFacts(),
            hasModArchives: true,
            logPathCount: 1
          }
        }),
        "The server crashes in com.example.problem.CrashHandler."
      )
    ).toMatchObject({
      reasons: [
        "crash triage should inspect log files before source, mod jars, or docs"
      ],
      steps: [
        "log_files",
        "mod_archive_content",
        "workspace_source",
        "docs_lookup"
      ],
      preferredTools: ["workspace.analyze", "context.query", "source.bundle"]
    });
  });

  it("routes KubeJS authoring requests to ProbeJS before docs", () => {
    expect(
      buildHarnessTaskRouteFromSnapshot(
        createSnapshot({
          workspaceKind: "modpack",
          routePlan: {
            scenario: "modpack-workspace",
            reasons: ["workspace descriptor reports a modpack workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "docs_lookup"]
          },
          authoringPolicy: {
            profile: "kubejs_script",
            runtimeModel: "minecraft_scripting",
            structureModel: "lifecycle_domain",
            preferredSignalOrder: [
              "probejs_types",
              "workspace_facts",
              "modding_docs"
            ],
            preferNamedFunctions: true,
            avoidGenericJavaScriptPatterns: true,
            allowPersistentConsole: false,
            requireExplicitDebugGate: true,
            preferDocBackedAnswers: true
          },
          facts: {
            ...createFacts(),
            hasGradle: true,
            hasKubeJS: true,
            hasProbeJS: true
          }
        }),
        "Write a KubeJS startup_scripts recipe for this modpack."
      )
    ).toEqual({
      intent: {
        id: "kubejs_authoring",
        confidence: "high",
        reasons: [
          "request text mentions KubeJS scripting keywords",
          "workspace snapshot exposes KubeJS or ProbeJS signals"
        ]
      },
      reasons: [
        "KubeJS authoring should inspect ProbeJS or d.ts context before docs"
      ],
      steps: ["probejs_types", "docs_lookup"],
      preferredTools: ["context.query", "source.bundle", "workspace.analyze"]
    });
  });

  it("adds mod archive content after ProbeJS for KubeJS modpack authoring", () => {
    expect(
      buildHarnessTaskRouteFromSnapshot(
        createSnapshot({
          workspaceKind: "modpack",
          routePlan: {
            scenario: "modpack-workspace",
            reasons: ["workspace descriptor reports a modpack workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "mod_archive_content", "docs_lookup"]
          },
          facts: {
            ...createFacts(),
            hasKubeJS: true,
            hasProbeJS: true,
            hasModArchives: true
          }
        }),
        "Write a KubeJS recipe using demo:gear from a content mod."
      )
    ).toMatchObject({
      steps: ["probejs_types", "mod_archive_content", "docs_lookup"],
      preferredTools: ["context.query", "source.bundle", "workspace.analyze"]
    });
  });

  it("routes datapack lookup requests to datapack files before docs", () => {
    expect(
      buildHarnessTaskRoute(
        createSnapshot({
          workspaceKind: "modpack",
          routePlan: {
            scenario: "modpack-workspace",
            reasons: ["workspace descriptor reports a modpack workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "docs_lookup"]
          },
          facts: {
            ...createFacts(),
            hasGradle: true,
            hasDatapack: true,
            datapackRootCount: 1
          }
        }),
        "Check why this datapack worldgen biome json does not load."
      )
    ).toEqual({
      intent: {
        id: "datapack_lookup",
        confidence: "high",
        reasons: [
          "request text mentions datapack or worldgen keywords",
          "workspace snapshot exposes datapack content"
        ]
      },
      reasons: [
        "datapack lookup should inspect datapack files before docs"
      ],
      steps: ["datapack_files", "docs_lookup"],
      preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
    });
  });

  it("adds mod archive content after datapack files for modpack data lookups", () => {
    expect(
      buildHarnessTaskRoute(
        createSnapshot({
          workspaceKind: "modpack",
          routePlan: {
            scenario: "modpack-workspace",
            reasons: ["workspace descriptor reports a modpack workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "mod_archive_content", "docs_lookup"]
          },
          facts: {
            ...createFacts(),
            hasDatapack: true,
            hasModArchives: true,
            datapackRootCount: 1
          }
        }),
        "Find the datapack recipe for demo:gear."
      )
    ).toMatchObject({
      steps: ["datapack_files", "mod_archive_content", "docs_lookup"],
      preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
    });
  });

  it("falls back to the workspace default route when no strong intent is present", () => {
    expect(
      buildHarnessTaskRoute(
        createSnapshot({
          workspaceKind: "modpack",
          routePlan: {
            scenario: "modpack-workspace",
            reasons: ["workspace descriptor reports a modpack workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "docs_lookup"]
          },
          facts: {
            ...createFacts(),
            hasGradle: true,
            hasKubeJS: true,
            hasProbeJS: true
          }
        }),
        "Help me inspect this workspace."
      )
    ).toEqual({
      intent: {
        id: "workspace_default",
        confidence: "low",
        reasons: ["request text does not match a specialized harness intent"]
      },
      reasons: [
        "fall back to the default workspace route when no specialized intent is detected"
      ],
      steps: ["workspace_source", "docs_lookup"],
      preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
    });
  });

  it("keeps vanilla source questions on source-side evidence before docs", () => {
    expect(
      buildHarnessTaskRoute(
        createSnapshot({
          workspaceKind: "java-mod",
          routePlan: {
            scenario: "java-mod-workspace",
            reasons: ["workspace descriptor reports a java mod workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "docs_lookup"]
          },
          facts: {
            ...createFacts(),
            hasGradle: true,
            hasJavaSource: true
          }
        }),
        "Inspect net.minecraft.world.item.ItemStack in this workspace."
      )
    ).toEqual({
      intent: {
        id: "workspace_default",
        confidence: "low",
        reasons: ["request text does not match a specialized harness intent"]
      },
      reasons: [
        "request targets net.minecraft vanilla source and should stay on source-side evidence before docs",
        "fall back to the default workspace route when no specialized intent is detected"
      ],
      steps: ["workspace_source", "docs_lookup"],
      preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
    });
  });
});

function createSnapshot(
  overrides: Partial<AgentRuntimeHarnessSnapshot> = {}
): AgentRuntimeHarnessSnapshot {
  return {
    workspaceRoot: "/tmp/workspace",
    workspaceKind: "unknown",
    detectorReasons: [],
    currentRuntime: createCurrentRuntime(),
    routePlan: {
      scenario: "unknown-workspace",
      reasons: ["workspace context is unavailable"],
      steps: []
    },
    facts: createFacts(),
    ...overrides
  };
}

function createFacts() {
  return {
    hasGradle: false,
    hasJavaSource: false,
    hasKubeJS: false,
    hasProbeJS: false,
    hasModArchives: false,
    hasDatapack: false,
    buildFileCount: 0,
    javaSourceRootCount: 0,
    datapackRootCount: 0,
    logPathCount: 0
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
