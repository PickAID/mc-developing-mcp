import type {
  AgentRuntimeHarnessSnapshot,
  CurrentRuntime
} from "@mcpskill/shared-types";

export function createTaskRouteSnapshot(
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
    facts: createTaskRouteFacts(),
    ...overrides
  };
}

export function createTaskRouteFacts() {
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
