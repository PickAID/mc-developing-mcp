import { describe, expect, it } from "vitest";

import type {
  CurrentRuntime,
  WorkspaceBootstrapContext,
  WorkspaceDescriptor
} from "@mcpskill/shared-types";

import {
  buildHarnessSnapshot,
  buildHarnessSnapshotFromBootstrap
} from "./snapshot.js";

describe("buildHarnessSnapshot", () => {
  it("returns an unknown snapshot when workspace context is unavailable", () => {
    expect(buildHarnessSnapshot()).toEqual({
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
    });
  });

  it("summarizes Java workspaces into a compact harness snapshot", () => {
    expect(
      buildHarnessSnapshot(
        createWorkspaceContext({
          kind: "java-mod",
          hasGradle: true,
          hasJavaSource: true,
          buildFiles: ["/tmp/workspace/build.gradle"],
          javaSourceRoots: ["/tmp/workspace/src/main/java"],
          reasons: ["found Gradle build file", "found Java source roots"]
        })
      )
    ).toMatchObject({
      workspaceRoot: "/tmp/workspace",
      workspaceKind: "java-mod",
      detectorReasons: ["found Gradle build file", "found Java source roots"],
      currentRuntime: {
        source: "unknown",
        confidence: "unknown"
      },
      routePlan: {
        scenario: "java-mod-workspace",
        defaultRoutingScenario: "project_symbol",
        steps: ["workspace_source", "docs_lookup"]
      },
      facts: {
        hasGradle: true,
        hasJavaSource: true,
        hasKubeJS: false,
        hasProbeJS: false,
        hasModArchives: false,
        hasDatapack: false,
        hasResourcePack: false,
        buildFileCount: 1,
        javaSourceRootCount: 1,
        datapackRootCount: 0,
        resourcePackRootCount: 0,
        logPathCount: 0
      }
    });
  });

  it("consumes bootstrap-shaped input through a snapshot adapter helper", () => {
    expect(
      buildHarnessSnapshotFromBootstrap({
        workspaceContext: createWorkspaceContext({
          kind: "kubejs",
          hasKubeJS: true,
          hasProbeJS: true
        })
      })
    ).toMatchObject({
      workspaceKind: "kubejs",
      routePlan: {
        scenario: "kubejs-workspace",
        defaultRoutingScenario: "kubejs_script",
        steps: ["probejs_types", "docs_lookup"]
      },
      authoringPolicy: {
        profile: "kubejs_script",
        preferredSignalOrder: [
          "probejs_types",
          "workspace_facts",
          "modding_docs"
        ],
        allowPersistentConsole: false
      },
      facts: {
        hasKubeJS: true,
        hasProbeJS: true
      }
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
