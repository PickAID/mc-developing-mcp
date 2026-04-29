import type {
  AgentRuntimeDefaultRoutingScenario,
  McpServerBootstrap,
  McpServerRequestContext,
  McpServerRequestPlan,
  WorkspaceBootstrapContext
} from "@mcpskill/shared-types";

import { buildMcpServerPromptAssembly } from "./prompt-assembly.js";
import { buildMcpServerRequestContext } from "./request-context.js";

export function buildMcpServerRequestPlan(
  bootstrap: Pick<McpServerBootstrap, "workspaceContext">,
  requestText?: string
): McpServerRequestPlan {
  const requestContext = buildMcpServerRequestContext(bootstrap, requestText);

  return buildMcpServerRequestPlanFromContext(requestContext);
}

export function buildMcpServerRequestPlanFromContext(
  requestContext: McpServerRequestContext
): McpServerRequestPlan {
  const requestText = requestContext.requestText;

  return {
    appId: "mcp-server",
    requestText,
    requestContext,
    prompt: buildMcpServerPromptAssembly(requestContext),
    toolGuidance: {
      availableTools: [...requestContext.taskBrief.availableTools],
      preferredTools: [...requestContext.taskBrief.preferredTools],
      routeSteps: [...requestContext.taskBrief.taskRoute.steps]
    },
    trace: {
      workspaceKind: requestContext.harnessSnapshot.workspaceKind,
      defaultRouteScenario: deriveDefaultRouteScenario(requestContext),
      defaultRouteSteps: [...requestContext.harnessSnapshot.routePlan.steps],
      taskIntent: requestContext.taskBrief.intent,
      taskRouteReasons: [...requestContext.taskBrief.taskRoute.reasons],
      taskRouteSteps: [...requestContext.taskBrief.taskRoute.steps],
      selectedPromptFragmentIds: requestContext.taskBrief.promptFragments.map(
        (fragment) => fragment.id
      )
    }
  };
}

export function buildMcpServerRequestPlanFromBootstrap(
  input: { workspaceContext?: WorkspaceBootstrapContext; requestText?: string }
): McpServerRequestPlan {
  return buildMcpServerRequestPlan(input, input.requestText);
}

function deriveDefaultRouteScenario(
  requestContext: McpServerRequestContext
): AgentRuntimeDefaultRoutingScenario | undefined {
  const routePlan = requestContext.harnessSnapshot.routePlan;

  if ("defaultRoutingScenario" in routePlan) {
    return routePlan.defaultRoutingScenario;
  }

  return undefined;
}
