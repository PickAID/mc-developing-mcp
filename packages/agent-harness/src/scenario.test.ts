import { describe, expect, it } from "vitest";

import type {
  AgentRuntimeBootstrap,
  CurrentRuntime,
  WorkspaceBootstrapContext,
  WorkspaceDescriptor
} from "@mcpskill/shared-types";

import {
  detectHarnessScenario,
  detectHarnessScenarioFromBootstrap
} from "./scenario.js";

describe("detectHarnessScenario", () => {
  it("returns unknown workspace when no workspace context is available", () => {
    expect(detectHarnessScenario()).toEqual({
      scenario: "unknown-workspace",
      reasons: ["workspace context is unavailable"]
    });
  });

  it("classifies a Gradle Java workspace as java-mod-workspace", () => {
    const detected = detectHarnessScenario(
      createWorkspaceContext({
        kind: "java-mod",
        hasGradle: true,
        hasJavaSource: true
      })
    );

    expect(detected).toMatchObject({
      scenario: "java-mod-workspace",
      defaultRoutingScenario: "project_symbol"
    });
    expect(detected.reasons).toContain("workspace descriptor reports a Java mod workspace");
  });

  it("classifies a KubeJS workspace ahead of generic project routing", () => {
    const detected = detectHarnessScenario(
      createWorkspaceContext({
        kind: "kubejs",
        hasKubeJS: true,
        hasProbeJS: true
      })
    );

    expect(detected).toMatchObject({
      scenario: "kubejs-workspace",
      defaultRoutingScenario: "kubejs_script"
    });
    expect(detected.reasons).toContain("workspace descriptor reports KubeJS or ProbeJS support");
  });

  it("classifies KubeJS from ProbeJS facts even when the descriptor kind is unknown", () => {
    const detected = detectHarnessScenario(
      createWorkspaceContext({
        kind: "unknown",
        hasProbeJS: true
      })
    );

    expect(detected).toMatchObject({
      scenario: "kubejs-workspace",
      defaultRoutingScenario: "kubejs_script"
    });
  });

  it("classifies datapack-focused workspaces from datapack facts", () => {
    const detected = detectHarnessScenario(
      createWorkspaceContext({
        hasDatapack: true
      })
    );

    expect(detected).toMatchObject({
      scenario: "datapack-workspace",
      defaultRoutingScenario: "datapack_lookup"
    });
    expect(detected.reasons).toContain("workspace descriptor reports datapack content");
  });

  it("prefers KubeJS facts ahead of datapack and Java project signals", () => {
    const detected = detectHarnessScenario(
      createWorkspaceContext({
        kind: "unknown",
        hasKubeJS: true,
        hasDatapack: true,
        hasGradle: true,
        hasJavaSource: true
      })
    );

    expect(detected).toMatchObject({
      scenario: "kubejs-workspace",
      defaultRoutingScenario: "kubejs_script"
    });
  });

  it("prefers datapack facts ahead of generic Java project signals", () => {
    const detected = detectHarnessScenario(
      createWorkspaceContext({
        kind: "unknown",
        hasDatapack: true,
        hasGradle: true,
        hasJavaSource: true
      })
    );

    expect(detected).toMatchObject({
      scenario: "datapack-workspace",
      defaultRoutingScenario: "datapack_lookup"
    });
  });

  it("classifies Java mod workspaces from Gradle and Java facts when kind is unknown", () => {
    const detected = detectHarnessScenario(
      createWorkspaceContext({
        kind: "unknown",
        hasGradle: true,
        hasJavaSource: true
      })
    );

    expect(detected).toMatchObject({
      scenario: "java-mod-workspace",
      defaultRoutingScenario: "project_symbol"
    });
  });

  it("prefers modpack classification when the descriptor says modpack", () => {
    const detected = detectHarnessScenario(
      createWorkspaceContext({
        kind: "modpack",
        hasGradle: true,
        hasKubeJS: true,
        hasProbeJS: true,
        hasDatapack: true
      })
    );

    expect(detected).toMatchObject({
      scenario: "modpack-workspace",
      defaultRoutingScenario: "project_symbol"
    });
    expect(detected.reasons).toContain("workspace descriptor reports a modpack workspace");
  });

  it("returns unknown when a descriptor exists but no known workspace facts are present", () => {
    expect(
      detectHarnessScenario(
        createWorkspaceContext({
          kind: "unknown"
        })
      )
    ).toEqual({
      scenario: "unknown-workspace",
      reasons: ["workspace descriptor does not match a known harness scenario"]
    });
  });

  it("consumes bootstrap-shaped input through a small adapter helper", () => {
    const bootstrap: Pick<AgentRuntimeBootstrap, "workspaceContext"> = {
      workspaceContext: createWorkspaceContext({
        kind: "java-mod",
        hasGradle: true,
        hasJavaSource: true
      })
    };

    expect(detectHarnessScenarioFromBootstrap(bootstrap)).toMatchObject({
      scenario: "java-mod-workspace",
      defaultRoutingScenario: "project_symbol"
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
