import {
  analyzeDatapackVersionMigration,
  readDatapackFile,
  searchDatapackFiles,
  traceDatapackResourceReferences,
  type DataKind,
  type DatapackVersionMigrationAnalysis,
  type DatapackFileSummary,
  type DatapackResourceReference,
  type DatapackResourceReferenceTrace,
  type DatapackSearchMatch,
  type DatapackSkippedFile,
  type resolveDatapackVersionProfile
} from "@mcpskill/datapack-adapter";

import { findResourceLocationEntryMatches } from "../resource-pack/source-bundle-resource-location-matches.js";
import {
  parseRequestedDatapackRead,
  toLineRangeDatapackReadEvidence,
  type DatapackReadEvidence
} from "./source-bundle-datapack-read.js";
import {
  isTraceableAssetPath,
  mentionsResourceReferenceTrace
} from "./source-bundle-datapack-query.js";

const MAX_MATCHES = 16;
const MAX_REFERENCE_TRACE_ENTRIES = 24;

export const DATAPACK_BUDGET = {
  maxFiles: 512,
  maxBytesPerFile: 64 * 1024
} as const;

export function toCompactMigrationAnalysis(input: {
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

export function extractMigrationRequest(
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

export async function traceRequestedResourceReferences(input: {
  workspaceRoot: string;
  requestText: string;
  requestedPaths: string[];
}) {
  const startPaths = input.requestedPaths
    .map((path) => parseRequestedDatapackRead(path).path)
    .filter((path) => isTraceableAssetPath(path));

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

export function toCompactResourceSummary(summary: DatapackFileSummary) {
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

export function toCompactVersionProfile(
  profile: Awaited<ReturnType<typeof resolveDatapackVersionProfile>>
): Record<string, unknown> {
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

export async function readRequestedDatapackPaths(
  workspaceRoot: string,
  requestedPaths: string[]
): Promise<{ files: DatapackReadEvidence[]; skipped: DatapackSkippedFile[] }> {
  const files: DatapackReadEvidence[] = [];
  const skipped: DatapackSkippedFile[] = [];

  for (const relativePath of requestedPaths) {
    const request = parseRequestedDatapackRead(relativePath);
    const result = await readDatapackFile(workspaceRoot, request.path, {
      ...DATAPACK_BUDGET
    });

    if (result.file && result.content !== undefined) {
      if (request.line !== undefined) {
        files.push(
          toLineRangeDatapackReadEvidence(result.file, result.content, request)
        );
        continue;
      }

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

export async function searchRequestedResourceLocations(
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

function buildMatchKey(match: DatapackSearchMatch): string {
  return `${match.file.relativePath}:${match.line}:${match.column}`;
}
