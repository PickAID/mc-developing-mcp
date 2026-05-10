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

  const actions = recommendations.suggestions.flatMap((suggestion) => [
    ...localVanillaSourceActions(suggestion.packageId, suggestion.reason),
    ...(suggestion.mdmReleaseInstall
      ? [{
      id: `install_mdm_${suggestion.packageId}`,
      kind: "mdm_release_install",
      safety: "requires_user_confirmation",
      packageId: suggestion.packageId,
      evidenceRole: sourceDerivedSchemaEvidenceRole(suggestion),
      priority: suggestion.priority,
      reason: suggestion.reason,
      inputPatch: {
        mdmReleaseInstall: suggestion.mdmReleaseInstall
      }
    }]
      : [])
  ]);

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

function sourceDerivedSchemaEvidenceRole(
  suggestion: MdmPackageRecommendations["suggestions"][number]
): "source_derived_schema_evidence" | undefined {
  return suggestion.packageId === "vanilla-schema-docs" ||
    suggestion.matchedSignals.includes("schema-docs")
    ? "source_derived_schema_evidence"
    : undefined;
}

function localVanillaSourceActions(packageId: string, reason: string) {
  const match = packageId.match(
    /^minecraft-(?<version>.+)-vanilla-source-profile$/u
  );
  if (!match?.groups?.version) {
    return [];
  }

  const minecraftVersion = match.groups.version;
  return [{
    id: `generate_local_minecraft_${minecraftVersion}_source_pack`,
    kind: "local_vanilla_source_generation",
    safety: "requires_user_confirmation",
    packageId: `minecraft-${minecraftVersion}-source-pack-named`,
    minecraftVersion,
    reason,
    inputPatch: {
      preparationRoutes: ["official"]
    }
  }];
}
