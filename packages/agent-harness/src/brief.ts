import type {
  AgentRuntimeAuthoringPolicy,
  AgentRuntimeHarnessBrief,
  AgentRuntimeHarnessSnapshot,
  AgentRuntimePromptFragment,
  AgentRuntimeToolName,
  WorkspaceBootstrapContext
} from "@mcpskill/shared-types";

import { buildHarnessSnapshot } from "./snapshot.js";

const AVAILABLE_HARNESS_TOOLS: AgentRuntimeToolName[] = [
  "workspace.analyze",
  "source.bundle",
  "context.query",
  "migration.analyze"
];

export function buildHarnessBrief(
  workspaceContext?: WorkspaceBootstrapContext
): AgentRuntimeHarnessBrief {
  return buildHarnessBriefFromSnapshot(buildHarnessSnapshot(workspaceContext));
}

export function buildHarnessBriefFromBootstrap(
  input: { workspaceContext?: WorkspaceBootstrapContext }
): AgentRuntimeHarnessBrief {
  return buildHarnessBrief(input.workspaceContext);
}

export function buildHarnessBriefFromSnapshot(
  snapshot: AgentRuntimeHarnessSnapshot
): AgentRuntimeHarnessBrief {
  const authoringPolicy = snapshot.authoringPolicy;
  const preferredTools = derivePreferredTools(snapshot, authoringPolicy);
  const promptFragments: AgentRuntimePromptFragment[] = [
    {
      id: "workspace_summary",
      text: buildWorkspaceSummary(snapshot)
    },
    {
      id: "route_policy",
      text: buildRoutePolicy(snapshot)
    },
    {
      id: "tool_policy",
      text: buildToolPolicy(preferredTools)
    }
  ];

  const authoringPolicyFragment = buildAuthoringPolicyFragment(authoringPolicy);
  if (authoringPolicyFragment) {
    promptFragments.push(authoringPolicyFragment);
  }

  return {
    snapshot,
    authoringPolicy,
    availableTools: [...AVAILABLE_HARNESS_TOOLS],
    preferredTools,
    promptFragments
  };
}

function derivePreferredTools(
  snapshot: AgentRuntimeHarnessSnapshot,
  authoringPolicy?: AgentRuntimeAuthoringPolicy
): AgentRuntimeToolName[] {
  if (
    snapshot.routePlan.scenario === "kubejs-workspace" &&
    authoringPolicy?.preferredSignalOrder[0] === "probejs_types"
  ) {
    return ["context.query", "source.bundle", "workspace.analyze"];
  }

  switch (snapshot.routePlan.scenario) {
    case "java-mod-workspace":
    case "modpack-workspace":
      return ["source.bundle", "context.query", "workspace.analyze"];
    case "datapack-workspace":
      return ["source.bundle", "context.query", "workspace.analyze"];
    case "kubejs-workspace":
    case "unknown-workspace":
      return ["workspace.analyze", "context.query"];
  }
}

function buildWorkspaceSummary(snapshot: AgentRuntimeHarnessSnapshot): string {
  if (!snapshot.workspaceRoot) {
    return "Workspace summary: kind=unknown; runtime unavailable; no workspace context was provided.";
  }

  const runtime = formatRuntime(snapshot);
  const facts = snapshot.facts;

  return [
    "Workspace summary:",
    `kind=${snapshot.workspaceKind};`,
    `runtime=${runtime};`,
    `gradle=${formatBool(facts.hasGradle)};`,
    `java=${formatBool(facts.hasJavaSource)};`,
    `kubejs=${formatBool(facts.hasKubeJS)};`,
    `probejs=${formatBool(facts.hasProbeJS)};`,
    `modArchives=${formatBool(facts.hasModArchives)};`,
    `datapack=${formatBool(facts.hasDatapack)}.`
  ].join(" ");
}

function buildRoutePolicy(snapshot: AgentRuntimeHarnessSnapshot): string {
  const routePlan = snapshot.routePlan;

  if (routePlan.scenario === "unknown-workspace") {
    return "Default route: unavailable until workspace facts are available.";
  }

  const routeSteps = routePlan.steps.join(" -> ");
  return `Default route: ${routePlan.defaultRoutingScenario} via ${routeSteps}.`;
}

function buildToolPolicy(preferredTools: AgentRuntimeToolName[]): string {
  const route = preferredTools.join(" -> ");
  return `Preferred tools: ${route}. Use migration.analyze only for explicit version migration requests.`;
}

function buildAuthoringPolicyFragment(
  authoringPolicy?: AgentRuntimeAuthoringPolicy
): AgentRuntimePromptFragment | undefined {
  if (authoringPolicy?.profile !== "kubejs_script") {
    return undefined;
  }

  return {
    id: "kubejs_authoring_policy",
    text: [
      "KubeJS authoring policy:",
      authoringPolicy.avoidGenericJavaScriptPatterns
        ? " treat KubeJS as Minecraft scripting infrastructure rather than generic JS,"
        : "",
      authoringPolicy.structureModel === "lifecycle_domain"
        ? " organize scripts by lifecycle and event domain,"
        : "",
      authoringPolicy.preferNamedFunctions
        ? " avoid arbitrary const sprawl when named functions or clear registrations read better,"
        : "",
      authoringPolicy.allowPersistentConsole
        ? ""
        : " avoid persistent console.* logging in committed scripts,",
      authoringPolicy.requireExplicitDebugGate
        ? " prefer explicit debug gating for temporary diagnostics,"
        : "",
      authoringPolicy.preferDocBackedAnswers
        ? " and rely on ProbeJS, workspace facts, and modding docs before generic JavaScript guesses."
        : ""
    ].join("")
  };
}

function formatRuntime(snapshot: AgentRuntimeHarnessSnapshot): string {
  const runtime = snapshot.currentRuntime;
  if (!runtime) {
    return "unavailable";
  }

  if (runtime.loader && runtime.minecraftVersion) {
    return `${runtime.loader} ${runtime.minecraftVersion}`;
  }

  if (runtime.minecraftVersion) {
    return runtime.minecraftVersion;
  }

  if (runtime.loader) {
    return runtime.loader;
  }

  return "unavailable";
}

function formatBool(value: boolean): string {
  return value ? "yes" : "no";
}
