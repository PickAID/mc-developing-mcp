import type {
  AgentRuntimePromptFragmentId,
  McpServerRequestPlan
} from "minecraft-developing-mcp-shared-types";

export interface McpPromptGuidanceBudget {
  maxArrayItems: number;
  maxStringLength: number;
  maxDepth: number;
}

export interface McpPromptGuidanceCompactPayload {
  (value: unknown, budget: McpPromptGuidanceBudget): { value: unknown };
}

const EXPOSED_PROMPT_GUIDANCE_IDS = new Set<AgentRuntimePromptFragmentId>([
  "kubejs_authoring_policy",
  "service_profile",
  "task_evidence_policy",
  "task_workspace_preparation_policy",
  "task_client_visual_capability_policy",
  "task_hotai_patch_workflow_policy",
  "task_kubejs_scripting_policy"
]);

export function buildMcpPromptGuidance(
  requestPlan: McpServerRequestPlan,
  budget: McpPromptGuidanceBudget,
  compactPayload: McpPromptGuidanceCompactPayload
) {
  const activeFragmentIds = requestPlan.trace.selectedPromptFragmentIds;
  const exposedFragments = requestPlan.requestContext.taskBrief.promptFragments
    .filter((fragment) => EXPOSED_PROMPT_GUIDANCE_IDS.has(fragment.id))
    .map((fragment) => ({
      id: fragment.id,
      text: fragment.text
    }));

  return {
    policy: "bounded_active_prompt_fragments",
    activeFragmentIds,
    exposedFragments: compactPayload(exposedFragments, budget).value
  };
}
