import {
  planVanillaReleaseGenerationFromCatalog,
  type VanillaGeneratedTargetKind
} from "minecraft-developing-mcp-source-package-manager";

import type { MdmVanillaReleaseCatalogContext } from "../../docs/mdm-resource/vanilla-release-catalog.js";
import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "../../request/execution/request-handler.js";

export function executeMcpServerVanillaGenerationTargets(
  input: McpServerEvidenceExecutorInput,
  catalogContext?: MdmVanillaReleaseCatalogContext
): McpServerEvidenceExecutorResult | undefined {
  if (!isVanillaGenerationTargetRequest(input.requestPlan.requestText)) {
    return undefined;
  }

  if (catalogContext?.status !== "ready" || !catalogContext.catalog) {
    return {
      matched: true,
      summary:
        catalogContext?.message ??
        "minecraft-release-catalog is unavailable for vanilla generation target planning.",
      payload: {
        source: "vanilla_generation_targets",
        result: {
          status: "catalog_unavailable",
          catalog: compactCatalogContext(catalogContext),
          nextAction: catalogContext?.installSuggestion
        }
      }
    };
  }

  const minecraftVersion = resolveRequestedMinecraftVersion(input, catalogContext);
  if (!minecraftVersion) {
    return {
      matched: true,
      summary:
        "No official Minecraft version was resolved for vanilla generation target planning.",
      payload: {
        source: "vanilla_generation_targets",
        result: {
          status: "version_unresolved",
          catalog: compactCatalogContext(catalogContext),
          nextAction: catalogContext.installSuggestion
        }
      }
    };
  }

  try {
    const plan = planVanillaReleaseGenerationFromCatalog({
      catalog: catalogContext.catalog,
      minecraftVersion,
      include: resolveTargetKinds(input.requestPlan.requestText)
    });

    return {
      matched: true,
      summary: `Planned ${plan.targets.length} local vanilla generation target(s) for Minecraft ${minecraftVersion}.`,
      payload: {
        source: "vanilla_generation_targets",
        result: {
          status: "ready",
          catalog: compactCatalogContext(catalogContext),
          plan
        }
      }
    };
  } catch (error) {
    return {
      matched: true,
      summary: toErrorMessage(error),
      payload: {
        source: "vanilla_generation_targets",
        result: {
          status: "version_not_in_catalog",
          minecraftVersion,
          catalog: compactCatalogContext(catalogContext),
          error: toErrorMessage(error)
        }
      }
    };
  }
}

function isVanillaGenerationTargetRequest(requestText?: string): boolean {
  if (!requestText) {
    return false;
  }

  const normalized = requestText.toLowerCase();
  return (
    /\b(?:vanilla|official)\b|原版|官方/.test(normalized) &&
    /\b(?:local-generation|local generation|generate locally|generation target|generation targets|source-pack|source pack)\b|本地生成|生成目标/.test(
      normalized
    )
  );
}

function resolveRequestedMinecraftVersion(
  input: McpServerEvidenceExecutorInput,
  catalogContext: MdmVanillaReleaseCatalogContext
): string | undefined {
  const requestText = input.requestPlan.requestText ?? "";
  const requestedVersions = requestText.match(/\b\d+(?:\.\d+){1,2}\b/g) ?? [];
  const catalogIds = new Set(
    catalogContext.catalog?.releases.map((release) => release.id) ?? []
  );
  const explicitVersion = requestedVersions.find((version) =>
    catalogIds.has(version)
  );

  return (
    explicitVersion ??
    input.requestPlan.requestContext.workspaceContext?.descriptor.currentRuntime
      .minecraftVersion
  );
}

function resolveTargetKinds(
  requestText?: string
): VanillaGeneratedTargetKind[] | undefined {
  if (!requestText) {
    return undefined;
  }

  const normalized = requestText.toLowerCase();
  const kinds: VanillaGeneratedTargetKind[] = [];

  if (/source[- ]?pack|net\.minecraft|源码|源代码/.test(normalized)) {
    kinds.push("source-pack");
  }
  if (/datapack|data\/minecraft|数据包/.test(normalized)) {
    kinds.push("datapack");
  }
  if (/resource[- ]?pack|resourcepack|assets\/minecraft|资源包/.test(normalized)) {
    kinds.push("resource-pack");
  }
  if (/\bassets\b|assets\/minecraft|资产/.test(normalized)) {
    kinds.push("assets");
  }

  return kinds.length > 0 ? kinds : undefined;
}

function compactCatalogContext(
  catalogContext?: MdmVanillaReleaseCatalogContext
) {
  return catalogContext
    ? {
        status: catalogContext.status,
        packageId: catalogContext.packageId,
        artifactPath: catalogContext.artifactPath,
        installSuggestion: catalogContext.installSuggestion,
        message: catalogContext.message
      }
    : undefined;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
