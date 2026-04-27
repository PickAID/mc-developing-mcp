import { describe, expect, it } from "vitest";

import type {
  CurrentRuntime,
  WorkspaceBootstrapContext,
  WorkspaceDescriptor
} from "@mcpskill/shared-types";

import {
  buildHarnessDefaultRoute,
  buildHarnessDefaultRouteFromBootstrap
} from "./route.js";

describe("buildHarnessDefaultRoute", () => {
  it("returns an empty route when workspace context is unavailable", () => {
    expect(buildHarnessDefaultRoute()).toEqual({
      scenario: "unknown-workspace",
      reasons: ["workspace context is unavailable"],
      steps: []
    });
  });

  it("maps Java mod workspaces to project source then docs", () => {
    expect(
      buildHarnessDefaultRoute(
        createWorkspaceContext({
          kind: "java-mod",
          hasGradle: true,
          hasJavaSource: true
        })
      )
    ).toEqual({
      scenario: "java-mod-workspace",
      reasons: [
        "workspace descriptor reports a Java mod workspace",
        "default project-symbol routing should inspect workspace source before docs"
      ],
      defaultRoutingScenario: "project_symbol",
      steps: ["workspace_source", "docs_lookup"]
    });
  });

  it("maps KubeJS workspaces to ProbeJS or d.ts first", () => {
    expect(
      buildHarnessDefaultRoute(
        createWorkspaceContext({
          kind: "kubejs",
          hasKubeJS: true,
          hasProbeJS: true
        })
      )
    ).toEqual({
      scenario: "kubejs-workspace",
      reasons: [
        "workspace descriptor reports KubeJS or ProbeJS support",
        "default KubeJS routing should inspect ProbeJS or d.ts context before docs"
      ],
      defaultRoutingScenario: "kubejs_script",
      steps: ["probejs_types", "docs_lookup"]
    });
  });

  it("maps datapack workspaces to datapack files then docs", () => {
    expect(
      buildHarnessDefaultRoute(
        createWorkspaceContext({
          hasDatapack: true
        })
      )
    ).toEqual({
      scenario: "datapack-workspace",
      reasons: [
        "workspace descriptor reports datapack content",
        "default datapack routing should inspect datapack files before docs"
      ],
      defaultRoutingScenario: "datapack_lookup",
      steps: ["datapack_files", "docs_lookup"]
    });
  });

  it("adds mod archive content before docs for modpack default routing", () => {
    expect(
      buildHarnessDefaultRoute(
        createWorkspaceContext({
          kind: "modpack",
          hasGradle: true,
          hasKubeJS: true,
          hasProbeJS: true,
          hasModArchives: true,
          hasDatapack: true
        })
      )
    ).toEqual({
      scenario: "modpack-workspace",
      reasons: [
        "workspace descriptor reports a modpack workspace",
        "default project-symbol routing should inspect workspace source before docs",
        "modpack routing should inspect discovered mod jars before docs"
      ],
      defaultRoutingScenario: "project_symbol",
      steps: ["workspace_source", "mod_archive_content", "docs_lookup"]
    });
  });

  it("consumes bootstrap-shaped input through a route adapter helper", () => {
    expect(
      buildHarnessDefaultRouteFromBootstrap({
        workspaceContext: createWorkspaceContext({
          kind: "java-mod",
          hasGradle: true,
          hasJavaSource: true
        })
      })
    ).toEqual({
      scenario: "java-mod-workspace",
      reasons: [
        "workspace descriptor reports a Java mod workspace",
        "default project-symbol routing should inspect workspace source before docs"
      ],
      defaultRoutingScenario: "project_symbol",
      steps: ["workspace_source", "docs_lookup"]
    });
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
