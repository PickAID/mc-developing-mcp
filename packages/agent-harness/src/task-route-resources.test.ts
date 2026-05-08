import { describe, expect, it } from "vitest";

import { buildHarnessTaskRoute } from "./task-route.js";
import {
  createTaskRouteFacts,
  createTaskRouteSnapshot
} from "./task-route-test-fixtures.js";

describe("buildHarnessTaskRoute resource routes", () => {
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

  it("routes vanilla asset lookups as resource-pack lookups using shared resource files evidence", () => {
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
        id: "resource_pack_lookup",
        confidence: "high"
      },
      reasons: [
        "resource-pack lookup should inspect assets evidence before docs"
      ],
      steps: ["datapack_files", "docs_lookup"],
      preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
    });
  });

  it("routes client visual resources through source, assets, mod archives, then docs", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot({
          workspaceKind: "java-mod",
          routePlan: {
            scenario: "java-mod-workspace",
            reasons: ["workspace descriptor reports a java mod workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "mod_archive_content", "docs_lookup"]
          },
          facts: {
            ...createTaskRouteFacts(),
            hasGradle: true,
            hasJavaSource: true,
            hasDatapack: true,
            hasModArchives: true,
            buildFileCount: 1,
            javaSourceRootCount: 1,
            datapackRootCount: 1
          }
        }),
        "Wire a block entity renderer, model registration, blockstate, and client init for this visual block."
      )
    ).toEqual({
      intent: {
        id: "client_visual_resources",
        confidence: "high",
        reasons: [
          "request text mentions client visual, rendering, model, blockstate, asset, or registry wiring keywords",
          "workspace snapshot exposes source, asset/datapack, or mod archive evidence"
        ]
      },
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
    });
  });

  it("routes source-backed client visual resources through assets before docs without archives", () => {
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
        "Fix the client UI screen renderer binding and model/blockstate registry wiring."
      )
    ).toMatchObject({
      intent: {
        id: "client_visual_resources",
        confidence: "high"
      },
      steps: ["workspace_source", "datapack_files", "docs_lookup"],
      preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
    });
  });
});
