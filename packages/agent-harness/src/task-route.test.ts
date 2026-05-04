import { describe, expect, it } from "vitest";

import {
  buildHarnessTaskRoute,
  buildHarnessTaskRouteFromSnapshot
} from "./task-route.js";
import {
  createTaskRouteFacts,
  createTaskRouteSnapshot
} from "./task-route-test-fixtures.js";

describe("buildHarnessTaskRoute", () => {
  it("routes KubeJS authoring requests to ProbeJS before docs", () => {
    expect(
      buildHarnessTaskRouteFromSnapshot(
        createTaskRouteSnapshot({
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
            ...createTaskRouteFacts(),
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
        createTaskRouteSnapshot({
          workspaceKind: "modpack",
          routePlan: {
            scenario: "modpack-workspace",
            reasons: ["workspace descriptor reports a modpack workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "mod_archive_content", "docs_lookup"]
          },
          facts: {
            ...createTaskRouteFacts(),
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
        createTaskRouteSnapshot({
          workspaceKind: "modpack",
          routePlan: {
            scenario: "modpack-workspace",
            reasons: ["workspace descriptor reports a modpack workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "docs_lookup"]
          },
          facts: {
            ...createTaskRouteFacts(),
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
        createTaskRouteSnapshot({
          workspaceKind: "modpack",
          routePlan: {
            scenario: "modpack-workspace",
            reasons: ["workspace descriptor reports a modpack workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "mod_archive_content", "docs_lookup"]
          },
          facts: {
            ...createTaskRouteFacts(),
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

  it("routes vanilla datapack lookups to datapack files even without local datapack roots", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot({
          workspaceKind: "java-mod",
          routePlan: {
            scenario: "java-mod-workspace",
            reasons: ["workspace descriptor reports a java mod workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "docs_lookup"]
          },
          currentRuntime: {
            minecraftVersion: "1.20.1",
            source: "workspace-detect",
            confidence: "high",
            evidenceSources: ["workspace-detect"],
            candidates: [],
            evidence: []
          },
          facts: {
            ...createTaskRouteFacts(),
            hasGradle: true,
            hasJavaSource: true
          }
        }),
        "Find the vanilla datapack recipe for minecraft:stone."
      )
    ).toMatchObject({
      intent: {
        id: "datapack_lookup",
        confidence: "high"
      },
      steps: ["datapack_files", "docs_lookup"],
      preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
    });
  });

  it("routes vanilla asset lookups to datapack files even without local resource roots", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot({
          workspaceKind: "java-mod",
          routePlan: {
            scenario: "java-mod-workspace",
            reasons: ["workspace descriptor reports a java mod workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "docs_lookup"]
          },
          currentRuntime: {
            minecraftVersion: "1.20.1",
            source: "workspace-detect",
            confidence: "high",
            evidenceSources: ["workspace-detect"],
            candidates: [],
            evidence: []
          },
          facts: {
            ...createTaskRouteFacts(),
            hasGradle: true,
            hasJavaSource: true
          }
        }),
        "Read the vanilla official asset assets/minecraft/models/item/stone.json"
      )
    ).toMatchObject({
      intent: {
        id: "datapack_lookup",
        confidence: "high"
      },
      steps: ["datapack_files", "docs_lookup"],
      preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
    });
  });

  it("falls back to the workspace default route when no strong intent is present", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot({
          workspaceKind: "modpack",
          routePlan: {
            scenario: "modpack-workspace",
            reasons: ["workspace descriptor reports a modpack workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "docs_lookup"]
          },
          facts: {
            ...createTaskRouteFacts(),
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

  it("routes external mod coordinate requests to API-backed resolution before docs", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot(),
        "Find the CurseMaven coordinate for JEI forge 1.20.1."
      )
    ).toEqual({
      intent: {
        id: "external_mod_resolution",
        confidence: "high",
        reasons: [
          "request text mentions external mod acquisition or Maven coordinate keywords"
        ]
      },
      reasons: [
        "external mod acquisition should resolve API-backed candidates before docs"
      ],
      steps: ["external_mod_resolution", "docs_lookup"],
      preferredTools: ["context.query", "source.bundle", "workspace.analyze"]
    });
  });

  it("routes explicit mod archive inventory requests even before archives exist", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot(),
        "List mod archive inventory and JarJar nested jars for this modpack."
      )
    ).toMatchObject({
      intent: {
        id: "workspace_default",
        confidence: "low"
      },
      reasons: [
        "request explicitly asks for mod archive inventory",
        "fall back to the default workspace route when no specialized intent is detected"
      ],
      steps: ["mod_archive_content", "docs_lookup"],
      preferredTools: ["context.query", "workspace.analyze"]
    });
  });

  it("keeps vanilla source questions on source-side evidence before docs", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot({
          workspaceKind: "java-mod",
          routePlan: {
            scenario: "java-mod-workspace",
            reasons: ["workspace descriptor reports a java mod workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "docs_lookup"]
          },
          facts: {
            ...createTaskRouteFacts(),
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

  it("routes Java diagnostics requests through LSP diagnostics before source and docs", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot({
          workspaceKind: "java-mod",
          routePlan: {
            scenario: "java-mod-workspace",
            reasons: ["workspace descriptor reports a java mod workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "docs_lookup"]
          },
          facts: {
            ...createTaskRouteFacts(),
            hasGradle: true,
            hasJavaSource: true,
            javaSourceRootCount: 1
          }
        }),
        "Fix the compile error: cannot resolve symbol RegistryObject."
      )
    ).toEqual({
      intent: {
        id: "java_diagnostics",
        confidence: "high",
        reasons: [
          "request text mentions Java compile or diagnostic keywords",
          "workspace snapshot exposes Java source or Gradle signals"
        ]
      },
      reasons: [
        "Java diagnostics should inspect LSP diagnostics before source or docs"
      ],
      steps: ["java_diagnostics", "workspace_source", "docs_lookup"],
      preferredTools: ["workspace.analyze", "source.bundle", "context.query"]
    });
  });
});
