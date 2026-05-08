import { describe, expect, it } from "vitest";

import type {
  AgentRuntimeHarnessSnapshot,
  CurrentRuntime
} from "minecraft-developing-mcp-shared-types";

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

  it("detects resource asset lookup requests from assets paths", () => {
    expect(
      detectHarnessTaskIntent(
        createSnapshot({
          workspaceKind: "datapack-workspace",
          facts: {
            ...createFacts(),
            hasDatapack: true,
            datapackRootCount: 1
          }
        }),
        "Trace references for assets/demo/blockstates/gear.json."
      )
    ).toEqual({
      id: "resource_pack_lookup",
      confidence: "high",
      reasons: [
        "request text mentions resource-pack asset keywords or assets path",
        "workspace snapshot exposes resource-pack asset content"
      ]
    });
  });

  it("detects generated vanilla asset requests as resource-pack lookups", () => {
    expect(
      detectHarnessTaskIntent(
        createSnapshot(),
        "Read the vanilla official asset assets/minecraft/models/item/stone.json"
      )
    ).toEqual({
      id: "resource_pack_lookup",
      confidence: "high",
      reasons: [
        "request text mentions vanilla resource-pack asset evidence",
        "vanilla assets content can be resolved from generated official packages"
      ]
    });
  });

  it("detects client visual resource requests from renderer and asset wiring wording", () => {
    expect(
      detectHarnessTaskIntent(
        createSnapshot({
          workspaceKind: "java-mod",
          facts: {
            ...createFacts(),
            hasGradle: true,
            hasJavaSource: true,
            hasDatapack: true,
            hasModArchives: true,
            javaSourceRootCount: 1,
            datapackRootCount: 1
          }
        }),
        "Wire the block entity renderer, blockstate, model registration, and client init for this visual block."
      )
    ).toEqual({
      id: "client_visual_resources",
      confidence: "high",
      reasons: [
        "request text mentions client visual, rendering, model, blockstate, asset, or registry wiring keywords",
        "workspace snapshot exposes source, asset/datapack, or mod archive evidence"
      ]
    });
  });

  it("detects connected texture client work as client visual resources", () => {
    expect(
      detectHarnessTaskIntent(
        createSnapshot({
          workspaceKind: "java-mod",
          facts: {
            ...createFacts(),
            hasGradle: true,
            hasJavaSource: true
          }
        }),
        "Fix connected textures and renderer bindings for the client screen."
      )
    ).toMatchObject({
      id: "client_visual_resources",
      confidence: "high"
    });
  });

  it("detects UI slicing, shader, and render pipeline requests as client visual resources", () => {
    for (const requestText of [
      "Fix the nine-slice GUI sprite scaling for this screen.",
      "Find the shader post chain and render pipeline state for this client effect.",
      "界面九宫格和着色器后处理在新版渲染 API 下怎么接起来。"
    ]) {
      expect(
        detectHarnessTaskIntent(
          createSnapshot({
            workspaceKind: "java-mod",
            facts: {
              ...createFacts(),
              hasGradle: true,
              hasJavaSource: true,
              hasResourcePack: true
            }
          }),
          requestText
        )
      ).toMatchObject({
        id: "client_visual_resources",
        confidence: "high"
      });
    }
  });

  it("prioritizes KubeJS client visual requests over generic KubeJS authoring", () => {
    expect(
      detectHarnessTaskIntent(
        createSnapshot({
          workspaceKind: "kubejs",
          facts: {
            ...createFacts(),
            hasKubeJS: true,
            hasProbeJS: true,
            hasResourcePack: true,
            resourcePackRootCount: 1
          }
        }),
        "Fix a KubeJS client_scripts screen renderer binding with model assets."
      )
    ).toMatchObject({
      id: "client_visual_resources",
      confidence: "high"
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

  it("detects external mod Maven coordinate requests", () => {
    expect(
      detectHarnessTaskIntent(
        createSnapshot(),
        "Find the Modrinth Maven modImplementation coordinate for Sodium fabric 1.20.1."
      )
    ).toEqual({
      id: "external_mod_resolution",
      confidence: "high",
      reasons: [
        "request text mentions external mod acquisition or Maven coordinate keywords"
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
    hasModArchives: false,
    hasDatapack: false,
    hasResourcePack: false,
    buildFileCount: 0,
    javaSourceRootCount: 0,
    datapackRootCount: 0,
    resourcePackRootCount: 0,
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
