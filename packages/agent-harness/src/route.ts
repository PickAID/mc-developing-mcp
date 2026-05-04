import type {
  AgentRuntimeDefaultRoutePlan,
  AgentRuntimeRouteStep,
  WorkspaceBootstrapContext
} from "@mcpskill/shared-types";

import {
  detectHarnessScenario,
  type HarnessRoutingScenario,
  type HarnessScenarioDetection
} from "./scenario.js";

export type HarnessRouteStep = AgentRuntimeRouteStep;

export type HarnessDefaultRoutePlan = AgentRuntimeDefaultRoutePlan &
  HarnessScenarioDetection;

export function buildHarnessDefaultRoute(
  workspaceContext?: WorkspaceBootstrapContext
): HarnessDefaultRoutePlan {
  return appendRouteSteps(
    detectHarnessScenario(workspaceContext),
    workspaceContext?.descriptor.hasModArchives ?? false
  );
}

export function buildHarnessDefaultRouteFromBootstrap(
  input: { workspaceContext?: WorkspaceBootstrapContext }
): HarnessDefaultRoutePlan {
  return buildHarnessDefaultRoute(input.workspaceContext);
}

function appendRouteSteps(
  detection: HarnessScenarioDetection,
  hasModArchives: boolean
): HarnessDefaultRoutePlan {
  if (!("defaultRoutingScenario" in detection)) {
    return {
      ...detection,
      steps: []
    };
  }

  switch (detection.defaultRoutingScenario) {
    case "project_symbol":
      const shouldInspectLocalJars =
        hasModArchives &&
        (detection.scenario === "java-mod-workspace" ||
          detection.scenario === "modpack-workspace");

      return {
        ...detection,
        reasons: [
          ...detection.reasons,
          "default project-symbol routing should inspect workspace source before docs",
          ...(shouldInspectLocalJars
            ? [
                detection.scenario === "modpack-workspace"
                  ? "modpack routing should inspect discovered mod jars before docs"
                  : "Java mod routing should inspect discovered local mod jars before docs"
              ]
            : [])
        ],
        steps: shouldInspectLocalJars
          ? ["workspace_source", "mod_archive_content", "docs_lookup"]
          : ["workspace_source", "docs_lookup"]
      };
    case "kubejs_script":
      return {
        ...detection,
        reasons: [
          ...detection.reasons,
          "default KubeJS routing should inspect ProbeJS or d.ts context before docs",
          ...(hasModArchives
            ? ["KubeJS modpack routing should inspect discovered mod jars before docs"]
            : [])
        ],
        steps: hasModArchives
          ? ["probejs_types", "mod_archive_content", "docs_lookup"]
          : ["probejs_types", "docs_lookup"]
      };
    case "datapack_lookup":
      return {
        ...detection,
        reasons: [
          ...detection.reasons,
          "default datapack routing should inspect datapack files before docs",
          ...(hasModArchives
            ? ["datapack modpack routing should inspect discovered mod jars before docs"]
            : [])
        ],
        steps: hasModArchives
          ? ["datapack_files", "mod_archive_content", "docs_lookup"]
          : ["datapack_files", "docs_lookup"]
      };
  }
}

const _exhaustiveRoutingScenario: Record<HarnessRoutingScenario, true> = {
  project_symbol: true,
  kubejs_script: true,
  datapack_lookup: true
};

void _exhaustiveRoutingScenario;
