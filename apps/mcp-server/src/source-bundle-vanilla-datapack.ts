import { buildVanillaDataPackCoordinate } from "@mcpskill/source-package-manager";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";
import {
  executeMcpServerGeneratedVanillaResourcePackage,
  type McpServerGeneratedVanillaResourcePackageOptions
} from "./source-bundle-generated-vanilla-resource.js";

export type McpServerVanillaDatapackPackageOptions =
  McpServerGeneratedVanillaResourcePackageOptions;

export async function executeMcpServerVanillaDatapackPackage(input: {
  executorInput: McpServerEvidenceExecutorInput;
  requestText: string;
  queries: string[];
  requestedPaths: string[];
  options?: McpServerVanillaDatapackPackageOptions;
}): Promise<McpServerEvidenceExecutorResult | undefined> {
  if (!input.options || !shouldUseVanillaDatapackPackage(input)) {
    return undefined;
  }

  const minecraftVersion =
    input.executorInput.requestPlan.requestContext.workspaceContext?.descriptor
      .currentRuntime.minecraftVersion;

  if (!minecraftVersion) {
    return {
      matched: true,
      summary: "No Minecraft runtime version available for vanilla datapack package resolution.",
      payload: {
        source: "vanilla_datapack",
        result: {
          status: "version_unresolved",
          summary:
            "No Minecraft runtime version available for vanilla datapack package resolution."
        }
      }
    };
  }

  return executeMcpServerGeneratedVanillaResourcePackage({
    minecraftVersion,
    sourcePackage: buildVanillaDataPackCoordinate(minecraftVersion),
    payloadSource: "vanilla_datapack",
    evidenceLabel: "generated vanilla datapack",
    requestText: input.requestText,
    queries: input.queries,
    requestedPaths: input.requestedPaths,
    options: input.options
  });
}

function shouldUseVanillaDatapackPackage(input: {
  requestText: string;
  queries: string[];
  requestedPaths: string[];
}): boolean {
  const requestText = input.requestText.toLowerCase();
  const mentionsVanilla = /\b(?:vanilla|official)\b|原版|官方/.test(requestText);
  const mentionsMinecraftData =
    input.queries.some((query) => query.startsWith("minecraft:")) ||
    input.requestedPaths.some((path) => path.startsWith("data/minecraft/")) ||
    /\bminecraft:[a-z0-9_.\/-]+\b|data\/minecraft\//.test(requestText);

  return mentionsVanilla && mentionsMinecraftData;
}
