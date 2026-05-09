import type { MdmPackageRecommendations } from "../../docs/mdm-resource/mdm-package-recommendations.js";

export interface McpResourceActionBudget {
  maxArrayItems: number;
  maxStringLength: number;
  maxDepth: number;
}

export interface McpResourceActionCompactPayload {
  (value: unknown, budget: McpResourceActionBudget): { value: unknown };
}

export function buildMcpResourceActions(
  recommendations: MdmPackageRecommendations | undefined,
  budget: McpResourceActionBudget,
  compactPayload: McpResourceActionCompactPayload
) {
  if (!recommendations || recommendations.suggestions.length === 0) {
    return undefined;
  }

  const actions = recommendations.suggestions
    .filter((suggestion) => suggestion.mdmReleaseInstall)
    .map((suggestion) => ({
      id: `install_mdm_${suggestion.packageId}`,
      kind: "mdm_release_install",
      safety: "requires_user_confirmation",
      packageId: suggestion.packageId,
      priority: suggestion.priority,
      reason: suggestion.reason,
      inputPatch: {
        mdmReleaseInstall: suggestion.mdmReleaseInstall
      }
    }));

  if (actions.length === 0) {
    return undefined;
  }

  return compactPayload(
    {
      policy: "recommend_before_download",
      executeWithDownloadOnlyAfterUserConfirmation: true,
      actions
    },
    budget
  ).value;
}
