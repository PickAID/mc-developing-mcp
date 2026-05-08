import type {
  AgentRuntimeHarnessSnapshot,
  AgentRuntimePromptFragment,
  AgentRuntimeTaskBrief,
  WorkspaceBootstrapContext
} from "minecraft-developing-mcp-shared-types";

import { buildHarnessBriefFromSnapshot } from "./brief.js";
import { CLIENT_VISUAL_CAPABILITY_POLICY_TEXT } from "./client-visual-policy-text.js";
import { KUBEJS_SCRIPTING_POLICY_TEXT } from "./kubejs-policy-text.js";
import { buildHarnessSnapshot } from "./snapshot.js";
import { buildHarnessTaskRoute } from "./task-route.js";

export function buildHarnessTaskBrief(
  workspaceContext?: WorkspaceBootstrapContext,
  requestText?: string
): AgentRuntimeTaskBrief {
  return buildHarnessTaskBriefFromSnapshot(
    buildHarnessSnapshot(workspaceContext),
    requestText
  );
}

export function buildHarnessTaskBriefFromBootstrap(
  input: { workspaceContext?: WorkspaceBootstrapContext; requestText?: string }
): AgentRuntimeTaskBrief {
  return buildHarnessTaskBrief(input.workspaceContext, input.requestText);
}

export function buildHarnessTaskBriefFromSnapshot(
  snapshot: AgentRuntimeHarnessSnapshot,
  requestText?: string
): AgentRuntimeTaskBrief {
  const baseBrief = buildHarnessBriefFromSnapshot(snapshot);
  const taskRoute = buildHarnessTaskRoute(snapshot, requestText);

  return {
    snapshot,
    authoringPolicy: baseBrief.authoringPolicy,
    intent: taskRoute.intent,
    taskRoute,
    availableTools: [...baseBrief.availableTools],
    preferredTools: [...taskRoute.preferredTools],
    promptFragments: [
      ...baseBrief.promptFragments,
      buildTaskIntentSummary(taskRoute),
      buildTaskRoutePolicy(taskRoute),
      buildTaskToolPolicy(taskRoute),
      buildTaskEvidencePolicy(taskRoute),
      ...buildTaskDomainPolicies(taskRoute)
    ]
  };
}

function buildTaskIntentSummary(
  taskBriefRoute: AgentRuntimeTaskBrief["taskRoute"]
): AgentRuntimePromptFragment {
  const { intent } = taskBriefRoute;

  return {
    id: "task_intent_summary",
    text: `Task intent: ${intent.id}; confidence=${intent.confidence}.`
  };
}

function buildTaskRoutePolicy(
  taskBriefRoute: AgentRuntimeTaskBrief["taskRoute"]
): AgentRuntimePromptFragment {
  return {
    id: "task_route_policy",
    text: `Task route: ${taskBriefRoute.intent.id} via ${taskBriefRoute.steps.join(" -> ")}.`
  };
}

function buildTaskToolPolicy(
  taskBriefRoute: AgentRuntimeTaskBrief["taskRoute"]
): AgentRuntimePromptFragment {
  return {
    id: "task_tool_policy",
    text: `Task internal routes: ${taskBriefRoute.preferredTools.join(" -> ")}.`
  };
}

function buildTaskEvidencePolicy(
  taskBriefRoute: AgentRuntimeTaskBrief["taskRoute"]
): AgentRuntimePromptFragment {
  const clientPolicy =
    taskBriefRoute.intent.id === "client_visual_resources"
      ? " Check registry-to-asset links, client-only init, renderer/screen/model bindings, asset reference graphs, rendered state sync, and resource reload/cache boundaries before docs."
      : "";

  return {
    id: "task_evidence_policy",
    text:
      `Evidence policy: follow ${taskBriefRoute.steps.join(" -> ")} in order; ` +
      "prefer local Gradle, LSP, ProbeJS, datapack/assets, logs, and JAR evidence before optional docs or remote lookup." +
      clientPolicy
  };
}

function buildTaskDomainPolicies(
  taskBriefRoute: AgentRuntimeTaskBrief["taskRoute"]
): AgentRuntimePromptFragment[] {
  if (taskBriefRoute.intent.id === "client_visual_resources") {
    const kubeJsPolicy: AgentRuntimePromptFragment[] =
      taskBriefRoute.steps.includes("probejs_types")
        ? [
            {
              id: "task_kubejs_scripting_policy",
              text: KUBEJS_SCRIPTING_POLICY_TEXT
            }
          ]
        : [];

    return [
      {
        id: "task_client_visual_capability_policy",
        text: CLIENT_VISUAL_CAPABILITY_POLICY_TEXT
      },
      ...kubeJsPolicy
    ];
  }

  if (taskBriefRoute.intent.id === "kubejs_authoring") {
    return [
      {
        id: "task_kubejs_scripting_policy",
        text: KUBEJS_SCRIPTING_POLICY_TEXT
      }
    ];
  }

  return [];
}
