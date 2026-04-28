import { describe, expect, it } from "vitest";

import type {
  AgentRuntimeHarnessSnapshot,
  CurrentRuntime
} from "@mcpskill/shared-types";

import {
  detectHarnessTaskIntent,
  detectHarnessTaskIntentFromSnapshot
} from "./intent.js";

describe("detectHarnessTaskIntent", () => {
  it("returns workspace-default intent when request text is unavailable", () => {
    expect(detectHarnessTaskIntent(createSnapshot())).toEqual({
      id: "workspace_default",
      confidence: "low",
      reasons: ["request text is unavailable"]
    });
  });

  it("detects crash triage from crash-log wording in mixed modpack workspaces", () => {
    expect(
      detectHarnessTaskIntent(
        createSnapshot({
          workspaceKind: "modpack",
          facts: {
            ...createFacts(),
            hasGradle: true,
            hasKubeJS: true,
            hasProbeJS: true,
            logPathCount: 2
          }
        }),
        "The server crashes on startup and latest.log shows an exception in a mod."
      )
    ).toEqual({
      id: "crash_triage",
      confidence: "high",
      reasons: [
        "request text mentions crash or log-triage keywords",
        "workspace snapshot exposes log files for crash triage"
      ]
    });
  });

  it("detects KubeJS authoring requests from script and recipe wording", () => {
    expect(
      detectHarnessTaskIntentFromSnapshot(
        createSnapshot({
          workspaceKind: "modpack",
          facts: {
            ...createFacts(),
            hasGradle: true,
            hasKubeJS: true,
            hasProbeJS: true
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
          }
        }),
        "Add a KubeJS server_scripts recipe for the modpack."
      )
    ).toEqual({
      id: "kubejs_authoring",
      confidence: "high",
      reasons: [
        "request text mentions KubeJS scripting keywords",
        "workspace snapshot exposes KubeJS or ProbeJS signals"
      ]
    });
  });

  it("detects datapack lookup requests from worldgen and pack keywords", () => {
    expect(
      detectHarnessTaskIntent(
        createSnapshot({
          workspaceKind: "modpack",
          facts: {
            ...createFacts(),
            hasGradle: true,
            hasDatapack: true,
            datapackRootCount: 1
          }
        }),
        "Why does this datapack worldgen biome json fail to load from pack.mcmeta?"
      )
    ).toEqual({
      id: "datapack_lookup",
      confidence: "high",
      reasons: [
        "request text mentions datapack or worldgen keywords",
        "workspace snapshot exposes datapack content"
      ]
    });
  });

  it("detects Java diagnostics requests when the workspace has Java sources", () => {
    expect(
      detectHarnessTaskIntent(
        createSnapshot({
          workspaceKind: "java-mod",
          facts: {
            ...createFacts(),
            hasGradle: true,
            hasJavaSource: true,
            javaSourceRootCount: 1
          }
        }),
        "Fix the compile error: cannot resolve symbol RegistryObject in this class."
      )
    ).toEqual({
      id: "java_diagnostics",
      confidence: "high",
      reasons: [
        "request text mentions Java compile or diagnostic keywords",
        "workspace snapshot exposes Java source or Gradle signals"
      ]
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
