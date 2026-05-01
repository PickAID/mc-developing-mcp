import { buildVanillaAssetsCoordinate } from "@mcpskill/source-package-manager";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";
import {
  executeMcpServerGeneratedVanillaResourcePackage,
  type McpServerGeneratedVanillaResourcePackageOptions
} from "./source-bundle-generated-vanilla-resource.js";

export type McpServerVanillaAssetsPackageOptions =
  McpServerGeneratedVanillaResourcePackageOptions;

export async function executeMcpServerVanillaAssetsPackage(input: {
  executorInput: McpServerEvidenceExecutorInput;
  requestText: string;
  queries: string[];
  requestedPaths: string[];
  options?: McpServerVanillaAssetsPackageOptions;
}): Promise<McpServerEvidenceExecutorResult | undefined> {
  if (!input.options || !shouldUseVanillaAssetsPackage(input)) {
    return undefined;
  }

  const minecraftVersion =
    input.executorInput.requestPlan.requestContext.workspaceContext?.descriptor
      .currentRuntime.minecraftVersion;

  if (!minecraftVersion) {
    return {
      matched: true,
      summary: "No Minecraft runtime version available for vanilla assets package resolution.",
      payload: {
        source: "vanilla_assets",
        result: {
          status: "version_unresolved",
          summary:
            "No Minecraft runtime version available for vanilla assets package resolution."
        }
      }
    };
  }

  return executeMcpServerGeneratedVanillaResourcePackage({
    minecraftVersion,
    sourcePackage: buildVanillaAssetsCoordinate(minecraftVersion),
    payloadSource: "vanilla_assets",
    evidenceLabel: "generated vanilla assets",
    requestText: input.requestText,
    queries: input.queries,
    requestedPaths: input.requestedPaths,
    options: input.options
  });
}

function shouldUseVanillaAssetsPackage(input: {
  requestText: string;
  requestedPaths: string[];
}): boolean {
  const requestText = input.requestText.toLowerCase();
  const mentionsVanilla = /\b(?:vanilla|official)\b|原版|官方/.test(requestText);
  const mentionsMinecraftAssets =
    input.requestedPaths.some((path) => path.startsWith("assets/minecraft/")) ||
    /assets\/minecraft\//.test(requestText);

  return mentionsVanilla && mentionsMinecraftAssets;
}
