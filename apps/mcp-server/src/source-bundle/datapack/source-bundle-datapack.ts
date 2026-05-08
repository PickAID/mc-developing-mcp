import {
  discoverDatapackContent,
  listDatapackFiles,
  resolveDatapackVersionProfile,
  summarizeDatapackFiles
} from "minecraft-developing-mcp-datapack-adapter";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "../../request/execution/request-handler.js";
import {
  executeMcpServerVanillaDatapackPackage,
  type McpServerVanillaDatapackPackageOptions
} from "./source-bundle-vanilla-datapack.js";
import {
  executeMcpServerVanillaAssetsPackage,
  type McpServerVanillaAssetsPackageOptions
} from "../vanilla/source-bundle-vanilla-assets.js";
import { resolveMcpServerResourcePackEvidence } from "../resource-pack/source-bundle-resource-pack.js";
import { buildClientVisualEvidencePacket } from "../../client-visual/evidence/client-visual-evidence-packet.js";
import { scanClientVisualSourceEvidence } from "../../client-visual/source-scan/client-visual-source-scanner.js";
import {
  resolveClientVisualExternalShaderReference,
  type ClientVisualExternalShaderReferenceOptions
} from "../../client-visual/shader/client-visual-shader-reference.js";
import {
  extractDatapackPathQueries,
  extractResourceLocationQueries
} from "./source-bundle-datapack-query.js";
import {
  DATAPACK_BUDGET,
  extractMigrationRequest,
  readRequestedDatapackPaths,
  searchRequestedResourceLocations,
  toCompactMigrationAnalysis,
  toCompactResourceSummary,
  toCompactVersionProfile,
  traceRequestedResourceReferences
} from "./source-bundle-datapack-evidence.js";

const MAX_LISTED_FILES = 32;

export async function executeMcpServerDatapackFiles(
  input: McpServerEvidenceExecutorInput,
  options: {
    vanillaDatapackPackage?: McpServerVanillaDatapackPackageOptions;
    vanillaAssetsPackage?: McpServerVanillaAssetsPackageOptions;
    externalShaderReference?: ClientVisualExternalShaderReferenceOptions;
  } = {}
): Promise<McpServerEvidenceExecutorResult> {
  if (input.candidate.routeStep !== "datapack_files") {
    return {
      matched: false,
      summary: `datapack_files executor cannot handle ${input.candidate.routeStep}.`
    };
  }

  const workspaceRoot =
    input.requestPlan.requestContext.workspaceContext?.workspaceRoot;

  if (!workspaceRoot) {
    return {
      matched: false,
      summary: "No workspace root available for datapack lookup."
    };
  }

  const requestText = input.requestPlan.requestText ?? "";
  const isClientVisualRequest =
    input.requestPlan.trace.taskIntent.id === "client_visual_resources";
  const isResourcePackRequest =
    input.requestPlan.trace.taskIntent.id === "resource_pack_lookup" ||
    isClientVisualRequest;
  const queries = extractResourceLocationQueries(requestText);
  const requestedPaths = extractDatapackPathQueries(requestText);
  const discovery = await discoverDatapackContent(workspaceRoot);

  if (discovery.roots.length === 0) {
    const vanillaDatapackResult = await executeMcpServerVanillaDatapackPackage({
      executorInput: input,
      requestText,
      queries,
      requestedPaths,
      options: options.vanillaDatapackPackage
    });

    if (vanillaDatapackResult) {
      return vanillaDatapackResult;
    }

    const vanillaAssetsResult = await executeMcpServerVanillaAssetsPackage({
      executorInput: input,
      requestText,
      queries,
      requestedPaths,
      options: options.vanillaAssetsPackage
    });

    if (vanillaAssetsResult) {
      return vanillaAssetsResult;
    }

    return {
      matched: false,
      summary: "No local datapack or asset roots were discovered."
    };
  }

  const reads = await readRequestedDatapackPaths(workspaceRoot, requestedPaths);
  const search = await searchRequestedResourceLocations(workspaceRoot, queries);
  const resourceSummary = await summarizeDatapackFiles(workspaceRoot, {
    ...DATAPACK_BUDGET
  });
  const compactResourceSummary = toCompactResourceSummary(resourceSummary);
  const resourceRootSummary = isResourcePackRequest
    ? compactResourceSummary
    : undefined;
  const hasDatapackEvidence =
    discovery.dataKinds.length > 0 || discovery.roots.some((root) => root.hasData);
  const hasResourcePackEvidence =
    discovery.assetKinds.length > 0 || discovery.roots.some((root) => root.hasAssets);
  const datapackVersionProfile = hasDatapackEvidence
    ? toCompactVersionProfile(
        await resolveDatapackVersionProfile(workspaceRoot, {
          minecraftVersion:
            input.requestPlan.requestContext.workspaceContext?.descriptor.currentRuntime
              .minecraftVersion,
          runtimeConfidence:
            input.requestPlan.requestContext.workspaceContext?.descriptor.currentRuntime
              .confidence
        })
      )
    : undefined;
  const resourcePackEvidence = hasResourcePackEvidence
    ? await resolveMcpServerResourcePackEvidence({
        workspaceRoot,
        assetKinds: discovery.assetKinds,
        minecraftVersion:
          input.requestPlan.requestContext.workspaceContext?.descriptor.currentRuntime
            .minecraftVersion,
        runtimeConfidence:
          input.requestPlan.requestContext.workspaceContext?.descriptor.currentRuntime
            .confidence,
        migrationRequest: extractMigrationRequest(requestText)
      })
    : undefined;
  const resourcePackVersionProfile =
    resourcePackEvidence?.resourcePackVersionProfile;
  const resourcePackMigrationAnalysis =
    resourcePackEvidence?.resourcePackMigrationAnalysis;
  const datapackMigrationAnalysis = toCompactMigrationAnalysis(
    datapackVersionProfile ? extractMigrationRequest(requestText) : undefined,
    discovery.dataKinds
  );
  const resourceReferenceTrace = await traceRequestedResourceReferences({
    workspaceRoot,
    requestText,
    requestedPaths
  });
  const clientVisualSourceScan = isClientVisualRequest
    ? await scanClientVisualSourceEvidence({
        workspaceRoot
      })
    : undefined;
  const externalShaderReference = isClientVisualRequest
    ? await resolveClientVisualExternalShaderReference({
        requestText,
        options: options.externalShaderReference
      })
    : undefined;
  const clientVisualEvidence = isClientVisualRequest
    ? buildClientVisualEvidencePacket({
        descriptor: input.requestPlan.requestContext.workspaceContext?.descriptor,
        discovery,
        resourceSummary: compactResourceSummary,
        queries,
        requestedPaths,
        matches: search.matches,
        sourceScan: clientVisualSourceScan,
        externalShaderReference,
        resourceReferenceTrace
      })
    : undefined;

  if (queries.length === 0 && requestedPaths.length === 0) {
    const listed = isResourcePackRequest
      ? { entries: [], skipped: [], truncated: false }
      : await listDatapackFiles(workspaceRoot, {
          ...DATAPACK_BUDGET,
          limit: MAX_LISTED_FILES
        });

    return {
      matched: isResourcePackRequest
        ? compactResourceSummary.entryCount > 0
        : listed.entries.length > 0,
      summary: isResourcePackRequest
        ? `Summarized ${compactResourceSummary.entryCount} local resource asset file(s).`
        : `Listed ${listed.entries.length} local datapack or asset file(s).`,
      payload: {
        source: "datapack_files",
        workspaceRoot,
        queries,
        requestedPaths,
        discovery,
        ...(datapackVersionProfile ? { datapackVersionProfile } : {}),
        ...(resourcePackVersionProfile ? { resourcePackVersionProfile } : {}),
        ...(datapackMigrationAnalysis ? { datapackMigrationAnalysis } : {}),
        ...(resourcePackMigrationAnalysis ? { resourcePackMigrationAnalysis } : {}),
        resourceSummary: compactResourceSummary,
        ...(resourceRootSummary ? { resourceRootSummary } : {}),
        ...(clientVisualEvidence ? { clientVisualEvidence } : {}),
        ...(isResourcePackRequest ? {} : { files: listed.entries }),
        skipped: listed.skipped,
        truncated: listed.truncated
      }
    };
  }

  const matched = reads.files.length > 0 || search.matches.length > 0;

  return {
    matched,
    summary: matched
      ? `Resolved ${reads.files.length + search.matches.length} local datapack evidence item(s).`
      : "No local datapack files matched the requested paths or resource locations.",
    payload: {
      source: "datapack_files",
      workspaceRoot,
      queries,
      requestedPaths,
      discovery,
      ...(datapackVersionProfile ? { datapackVersionProfile } : {}),
      ...(resourcePackVersionProfile ? { resourcePackVersionProfile } : {}),
      ...(datapackMigrationAnalysis ? { datapackMigrationAnalysis } : {}),
      ...(resourcePackMigrationAnalysis ? { resourcePackMigrationAnalysis } : {}),
      resourceSummary: compactResourceSummary,
      reads: reads.files,
      matches: search.matches,
      ...(clientVisualEvidence ? { clientVisualEvidence } : {}),
      ...(resourceReferenceTrace ? { resourceReferenceTrace } : {}),
      skipped: [...reads.skipped, ...search.skipped],
      truncated: search.truncated
    }
  };
}
