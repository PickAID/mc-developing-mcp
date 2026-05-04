import {
  analyzeDatapackVersionMigration,
  discoverDatapackContent,
  listDatapackFiles,
  readDatapackFile,
  resolveDatapackVersionProfile,
  searchDatapackFiles,
  summarizeDatapackFiles,
  traceDatapackResourceReferences,
  type DataKind,
  type DatapackVersionMigrationAnalysis,
  type DatapackFileEntry,
  type DatapackFileSummary,
  type DatapackResourceReference,
  type DatapackResourceReferenceTrace,
  type DatapackSearchMatch,
  type DatapackSkippedFile
} from "@mcpskill/datapack-adapter";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";
import {
  executeMcpServerVanillaDatapackPackage,
  type McpServerVanillaDatapackPackageOptions
} from "./source-bundle-vanilla-datapack.js";
import {
  executeMcpServerVanillaAssetsPackage,
  type McpServerVanillaAssetsPackageOptions
} from "./source-bundle-vanilla-assets.js";
import { resolveMcpServerResourcePackEvidence } from "./source-bundle-resource-pack.js";
import { buildClientVisualEvidencePacket } from "./client-visual-evidence-packet.js";
import { scanClientVisualSourceEvidence } from "./client-visual-source-scanner.js";
import { findResourceLocationEntryMatches } from "./source-bundle-resource-location-matches.js";
import {
  resolveClientVisualExternalShaderReference,
  type ClientVisualExternalShaderReferenceOptions
} from "./client-visual-shader-reference.js";
import {
  extractDatapackPathQueries,
  extractResourceLocationQueries,
  isTraceableAssetPath,
  mentionsResourceReferenceTrace
} from "./source-bundle-datapack-query.js";

const MAX_MATCHES = 16;
const MAX_LISTED_FILES = 32;
const MAX_REFERENCE_TRACE_ENTRIES = 24;
const DATAPACK_BUDGET = {
  maxFiles: 512,
  maxBytesPerFile: 64 * 1024
} as const;

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

function toCompactMigrationAnalysis(input: {
  fromMinecraftVersion: string;
  toMinecraftVersion: string;
} | undefined, observedDataKinds: DataKind[]) {
  if (!input) {
    return undefined;
  }

  const analysis = analyzeDatapackVersionMigration({
    ...input,
    observedDataKinds
  });
  return {
    tokenPolicy: "compact_migration" as const,
    status: analysis.status,
    direction: analysis.direction,
    compatibility: analysis.compatibility,
    from: analysis.from,
    to: analysis.to,
    packFormatChange: analysis.packFormatChange,
    requiredActions: analysis.requiredActions,
    riskHints: analysis.riskHints,
    notes: analysis.notes
  } satisfies DatapackVersionMigrationAnalysis & {
    tokenPolicy: "compact_migration";
  };
}

function extractMigrationRequest(
  requestText: string
): { fromMinecraftVersion: string; toMinecraftVersion: string } | undefined {
  const normalized = requestText.trim();
  const english = normalized.match(
    /\bfrom\s+(?<from>\d+\.\d+(?:\.\d+)?)\s+(?:to|->)\s+(?<to>\d+\.\d+(?:\.\d+)?)/i
  );
  const chinese = normalized.match(
    /从\s*(?<from>\d+\.\d+(?:\.\d+)?)\s*(?:到|至|->)\s*(?<to>\d+\.\d+(?:\.\d+)?)/
  );
  const generic = normalized.match(
    /(?<from>\d+\.\d+(?:\.\d+)?)\s*(?:->|=>|到|至)\s*(?<to>\d+\.\d+(?:\.\d+)?)/
  );
  const groups = english?.groups ?? chinese?.groups ?? generic?.groups;

  if (!groups?.from || !groups.to) {
    return undefined;
  }

  return {
    fromMinecraftVersion: groups.from,
    toMinecraftVersion: groups.to
  };
}

async function traceRequestedResourceReferences(input: {
  workspaceRoot: string;
  requestText: string;
  requestedPaths: string[];
}) {
  const startPaths = input.requestedPaths.filter((path) =>
    isTraceableAssetPath(path)
  );

  if (
    startPaths.length === 0 ||
    !mentionsResourceReferenceTrace(input.requestText)
  ) {
    return undefined;
  }

  const trace = await traceDatapackResourceReferences(input.workspaceRoot, {
    ...DATAPACK_BUDGET,
    paths: startPaths,
    maxReferences: MAX_REFERENCE_TRACE_ENTRIES
  });

  return toCompactResourceReferenceTrace(trace);
}

function toCompactResourceSummary(summary: DatapackFileSummary) {
  return {
    tokenPolicy: "counts_only" as const,
    rootCount: summary.rootCount,
    entryCount: summary.entryCount,
    byRootKind: summary.byRootKind,
    byDomain: summary.byDomain,
    byKind: summary.byKind,
    byNamespace: summary.byNamespace,
    skippedCount: summary.skipped.length,
    truncated: summary.truncated
  };
}

function toCompactVersionProfile(
  profile: Awaited<ReturnType<typeof resolveDatapackVersionProfile>>
) {
  return {
    tokenPolicy: "compact_profile" as const,
    source: profile.source,
    confidence: profile.confidence,
    supportLevel: profile.supportLevel,
    packFormatStatus: profile.packFormatStatus,
    minecraftVersion: profile.minecraftVersion,
    packFormat: profile.packFormat,
    packFormatId: profile.packFormatId,
    packFormatVersion: profile.packFormatVersion,
    supportedFormats: profile.supportedFormats,
    compatibleMinecraftVersions: profile.compatibleMinecraftVersions,
    knownDataKinds: profile.knownDataKinds,
    semanticValidation: profile.semanticValidation,
    migrationAnalysis: profile.migrationAnalysis,
    notes: profile.notes
  };
}

function toCompactResourceReferenceTrace(
  trace: DatapackResourceReferenceTrace
) {
  return {
    tokenPolicy: "explicit_trace" as const,
    startPaths: trace.startPaths,
    referenceCount: trace.references.length,
    unresolvedCount: trace.unresolved.length,
    references: trace.references.map(toCompactResourceReference),
    unresolved: trace.unresolved.map(toCompactResourceReference),
    skippedCount: trace.skipped.length,
    truncated: trace.truncated
  };
}

function toCompactResourceReference(reference: DatapackResourceReference) {
  return {
    fromPath: reference.fromPath,
    fromKind: reference.fromKind,
    relation: reference.relation,
    value: reference.value,
    toPath: reference.toPath,
    toKind: reference.toKind,
    status: reference.status
  };
}

async function readRequestedDatapackPaths(
  workspaceRoot: string,
  requestedPaths: string[]
): Promise<{ files: DatapackReadEvidence[]; skipped: DatapackSkippedFile[] }> {
  const files: DatapackReadEvidence[] = [];
  const skipped: DatapackSkippedFile[] = [];

  for (const relativePath of requestedPaths) {
    const result = await readDatapackFile(workspaceRoot, relativePath, {
      ...DATAPACK_BUDGET
    });

    if (result.file && result.content !== undefined) {
      files.push({
        file: result.file,
        content: result.content
      });
    } else if (result.skipped) {
      skipped.push(result.skipped);
    }
  }

  return { files, skipped };
}

async function searchRequestedResourceLocations(
  workspaceRoot: string,
  queries: string[]
): Promise<{
  matches: DatapackSearchMatch[];
  skipped: DatapackSkippedFile[];
  truncated: boolean;
}> {
  const matches = new Map<string, DatapackSearchMatch>();
  const skipped: DatapackSkippedFile[] = [];
  let truncated = false;

  for (const query of queries) {
    for (const match of await findResourceLocationEntryMatches(workspaceRoot, query)) {
      matches.set(buildMatchKey(match), match);
      if (matches.size >= MAX_MATCHES) {
        truncated = true;
        break;
      }
    }
    if (truncated || matches.size > 0) {
      continue;
    }

    const result = await searchDatapackFiles(workspaceRoot, query, {
      ...DATAPACK_BUDGET
    });

    for (const match of result.matches) {
      matches.set(buildMatchKey(match), match);
      if (matches.size >= MAX_MATCHES) {
        truncated = true;
        break;
      }
    }

    skipped.push(...result.skipped);
    truncated ||= result.truncated;

    if (truncated) {
      break;
    }
  }

  return {
    matches: [...matches.values()],
    skipped,
    truncated
  };
}

interface DatapackReadEvidence {
  file: DatapackFileEntry;
  content: string;
}

function buildMatchKey(match: DatapackSearchMatch): string {
  return `${match.file.relativePath}:${match.line}:${match.column}`;
}
