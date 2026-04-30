import {
  discoverDatapackContent,
  listDatapackFiles,
  readDatapackFile,
  resolveDatapackVersionProfile,
  searchDatapackFiles,
  summarizeDatapackFiles,
  traceDatapackResourceReferences,
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

const MAX_QUERIES = 8;
const MAX_MATCHES = 16;
const MAX_LISTED_FILES = 32;
const MAX_REFERENCE_TRACE_ENTRIES = 24;
const DATAPACK_BUDGET = {
  maxFiles: 512,
  maxBytesPerFile: 64 * 1024
} as const;

export async function executeMcpServerDatapackFiles(
  input: McpServerEvidenceExecutorInput
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
  const queries = extractResourceLocationQueries(requestText);
  const requestedPaths = extractDatapackPathQueries(requestText);
  const discovery = await discoverDatapackContent(workspaceRoot);

  if (discovery.roots.length === 0) {
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
  const datapackVersionProfile = toCompactVersionProfile(
    await resolveDatapackVersionProfile(workspaceRoot, {
      minecraftVersion:
        input.requestPlan.requestContext.workspaceContext?.descriptor.currentRuntime
          .minecraftVersion,
      runtimeConfidence:
        input.requestPlan.requestContext.workspaceContext?.descriptor.currentRuntime
          .confidence
    })
  );
  const resourceReferenceTrace = await traceRequestedResourceReferences({
    workspaceRoot,
    requestText,
    requestedPaths
  });

  if (queries.length === 0 && requestedPaths.length === 0) {
    const listed = await listDatapackFiles(workspaceRoot, {
      ...DATAPACK_BUDGET,
      limit: MAX_LISTED_FILES
    });

    return {
      matched: listed.entries.length > 0,
      summary: `Listed ${listed.entries.length} local datapack or asset file(s).`,
      payload: {
        source: "datapack_files",
        workspaceRoot,
        queries,
        requestedPaths,
        discovery,
        datapackVersionProfile,
        resourceSummary: compactResourceSummary,
        files: listed.entries,
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
      datapackVersionProfile,
      resourceSummary: compactResourceSummary,
      reads: reads.files,
      matches: search.matches,
      ...(resourceReferenceTrace ? { resourceReferenceTrace } : {}),
      skipped: [...reads.skipped, ...search.skipped],
      truncated: search.truncated
    }
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

function extractResourceLocationQueries(requestText: string): string[] {
  const matches = requestText.matchAll(
    /\b[a-z0-9_.-]+:[a-z0-9_.\-\/]+\b/gi
  );

  return unique([...matches].map((match) => match[0].toLowerCase())).slice(
    0,
    MAX_QUERIES
  );
}

function extractDatapackPathQueries(requestText: string): string[] {
  const matches = requestText.matchAll(
    /\b(?:data|assets)\/[A-Za-z0-9_.-]+\/[^\s'"`<>]+/g
  );

  return unique([...matches].map((match) => trimTrailingPunctuation(match[0])))
    .slice(0, MAX_QUERIES);
}

function mentionsResourceReferenceTrace(requestText: string): boolean {
  return /\b(?:trace|reference|references|dependency|dependencies|missing|unresolved)\b|引用|依赖|追踪|缺失|丢失|找不到/i.test(
    requestText
  );
}

function isTraceableAssetPath(path: string): boolean {
  return /^assets\/[^/]+\/(?:blockstates|models)\//.test(path);
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

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[),.;:]+$/g, "");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
