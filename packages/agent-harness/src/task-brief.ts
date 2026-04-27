import type {
  AgentRuntimeHarnessSnapshot,
  AgentRuntimePromptFragment,
  AgentRuntimeTaskBrief,
  WorkspaceBootstrapContext
} from "@mcpskill/shared-types";

import { buildHarnessBriefFromSnapshot } from "./brief.js";
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
      buildTaskToolPolicy(taskRoute)
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
    text: `Task tools: ${taskBriefRoute.preferredTools.join(" -> ")}.`
  };
}
