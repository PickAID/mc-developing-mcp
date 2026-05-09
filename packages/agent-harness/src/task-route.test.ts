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

  it("routes explicit Hotai badiff patch requests through source and jar evidence first", () => {
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
            hasDatapack: true,
            hasResourcePack: true,
            hasGradle: true,
            hasModArchives: true
          }
        }),
        "Use Hotai badiff patches for com.example.content.Target before_mixin in this pack."
      )
    ).toEqual({
      intent: {
        id: "hotai_patch_workflow",
        confidence: "high",
        reasons: [
          "request text mentions Hotai, badiff, bytecode patch, class patch, or Hotai patch layout keywords",
          "workspace snapshot exposes patch target evidence routes"
        ]
      },
      reasons: [
        "Hotai patch planning should prove the target class and available data-driven alternatives before bytecode patching"
      ],
      steps: [
        "workspace_source",
        "mod_archive_content",
        "probejs_types",
        "datapack_files",
        "docs_lookup"
      ],
      preferredTools: ["context.query", "source.bundle", "workspace.analyze"]
    });
  });

  it("does not route generic avoid-mixin requests to the Hotai patch workflow", () => {
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
        "I want to customize this modpack while avoiding heavy mixins."
      )
    ).toMatchObject({
      intent: {
        id: "workspace_default",
        confidence: "low"
      }
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

  it("routes workspace preparation requests through acquisition planning before jar search", () => {
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
            hasKubeJS: true,
            hasProbeJS: true,
            hasModArchives: true,
            hasDatapack: true,
            hasResourcePack: true
          }
        }),
        "Prepare useful bundles so the agent can later inspect dependency source and external mod code."
      )
    ).toEqual({
      intent: {
        id: "workspace_preparation",
        confidence: "high",
        reasons: [
          "request text asks to prepare, initialize, cache, bundle, or index workspace evidence",
          "workspace snapshot exposes local evidence routes that can be prepared progressively"
        ]
      },
      reasons: [
        "workspace preparation should report available, missing, and confirm-required evidence routes before searching jar contents"
      ],
      steps: [
        "source_acquisition_plan",
        "probejs_types",
        "datapack_files",
        "mod_archive_content",
        "external_mod_resolution",
        "docs_lookup"
      ],
      preferredTools: ["source.bundle", "workspace.analyze", "context.query"]
    });
  });

  it("routes Chinese cache initialization requests through acquisition planning", () => {
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
        "初始化缓存，让 agent 后续查看依赖源码。"
      )
    ).toMatchObject({
      intent: {
        id: "workspace_preparation",
        confidence: "high"
      },
      steps: [
        "source_acquisition_plan",
        "workspace_source",
        "java_diagnostics",
        "docs_lookup"
      ],
      preferredTools: ["source.bundle", "workspace.analyze", "context.query"]
    });
  });

  it("does not treat docs lookup requests as workspace preparation just because they mention indexes", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot({
          workspaceKind: "kubejs-workspace",
          routePlan: {
            scenario: "kubejs-workspace",
            reasons: ["workspace descriptor reports a KubeJS workspace"],
            defaultRoutingScenario: "kubejs_script",
            steps: ["probejs_types", "docs_lookup"]
          },
          facts: {
            ...createTaskRouteFacts(),
            hasKubeJS: true
          }
        }),
        "Find sqlite index role docs for offline MDM package queries."
      )
    ).toMatchObject({
      intent: {
        id: "workspace_default",
        confidence: "low"
      },
      steps: ["probejs_types", "docs_lookup"]
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

  it("keeps mod archive inventory refresh on the inventory route instead of workspace preparation", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot({
          facts: {
            ...createTaskRouteFacts(),
            hasModArchives: true
          }
        }),
        "Refresh the mod archive inventory cache for this modpack."
      )
    ).toMatchObject({
      intent: {
        id: "workspace_default"
      },
      reasons: expect.arrayContaining([
        "request explicitly asks for mod archive inventory"
      ]),
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

  it("keeps project Java symbol questions on source-side evidence before resource files", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot({
          workspaceKind: "java-mod",
          routePlan: {
            scenario: "java-mod-workspace",
            reasons: ["workspace descriptor reports a Java mod workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "docs_lookup"]
          },
          facts: {
            ...createTaskRouteFacts(),
            hasGradle: true,
            hasJavaSource: true,
            hasDatapack: true,
            hasResourcePack: true,
            datapackRootCount: 3,
            resourcePackRootCount: 3
          }
        }),
        "Inspect dev.ftb.mods.ftbquests.item.QuestBookItem and explain where it is implemented in this Gradle workspace."
      )
    ).toEqual({
      intent: {
        id: "workspace_default",
        confidence: "low",
        reasons: ["request text does not match a specialized harness intent"]
      },
      reasons: [
        "request targets a Java project symbol and should stay on source-side evidence before docs",
        "fall back to the default workspace route when no specialized intent is detected"
      ],
      steps: ["workspace_source", "docs_lookup"],
      preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
    });
  });

  it("routes libs-heavy Java mod workspaces through local jar evidence before docs", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot({
          workspaceKind: "java-mod",
          routePlan: {
            scenario: "java-mod-workspace",
            reasons: [
              "workspace descriptor reports a Java mod workspace",
              "default project-symbol routing should inspect workspace source before docs",
              "Java mod routing should inspect discovered local mod jars before docs"
            ],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "mod_archive_content", "docs_lookup"]
          },
          facts: {
            ...createTaskRouteFacts(),
            hasGradle: true,
            hasJavaSource: true,
            hasModArchives: true,
            buildFileCount: 2,
            javaSourceRootCount: 1
          }
        }),
        "Inspect the L2 library integration points in this workspace."
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
      steps: ["workspace_source", "mod_archive_content", "docs_lookup"],
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
