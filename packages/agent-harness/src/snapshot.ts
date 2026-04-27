import type {
  AgentRuntimeHarnessFacts,
  AgentRuntimeHarnessSnapshot,
  WorkspaceBootstrapContext
} from "@mcpskill/shared-types";

import { buildHarnessAuthoringPolicy } from "./policy.js";
import { buildHarnessDefaultRoute } from "./route.js";

export function buildHarnessSnapshot(
  workspaceContext?: WorkspaceBootstrapContext
): AgentRuntimeHarnessSnapshot {
  if (!workspaceContext) {
    return {
      workspaceKind: "unknown",
      detectorReasons: [],
      routePlan: buildHarnessDefaultRoute(),
      facts: createEmptyFacts()
    };
  }

  const descriptor = workspaceContext.descriptor;

  return {
    workspaceRoot: workspaceContext.workspaceRoot,
    workspaceKind: descriptor.kind,
    detectorReasons: [...descriptor.reasons],
    currentRuntime: descriptor.currentRuntime,
    routePlan: buildHarnessDefaultRoute(workspaceContext),
    authoringPolicy: buildHarnessAuthoringPolicy(workspaceContext),
    facts: {
      hasGradle: descriptor.hasGradle,
      hasJavaSource: descriptor.hasJavaSource,
      hasKubeJS: descriptor.hasKubeJS,
      hasProbeJS: descriptor.hasProbeJS,
      hasModArchives: descriptor.hasModArchives,
      hasDatapack: descriptor.hasDatapack,
      buildFileCount: descriptor.buildFiles.length,
      javaSourceRootCount: descriptor.javaSourceRoots.length,
      datapackRootCount: descriptor.datapackRoots.length,
      logPathCount: descriptor.logPaths.length
    }
  };
}

export function buildHarnessSnapshotFromBootstrap(
  input: { workspaceContext?: WorkspaceBootstrapContext }
): AgentRuntimeHarnessSnapshot {
  return buildHarnessSnapshot(input.workspaceContext);
}

function createEmptyFacts(): AgentRuntimeHarnessFacts {
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
