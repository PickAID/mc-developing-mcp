import {
  readModArchiveMetadata,
  traceModArchiveResourceReferences,
  traceNestedModArchiveResourceReferences,
  type ArchiveContentCache,
  type ModArchiveResourceReference,
  type ModArchiveResourceReferenceTrace
} from "@mcpskill/jar-source-adapter";

import type { McpServerEvidenceExecutorResult } from "./request-handler.js";

const MAX_REFERENCE_TRACE_ENTRIES = 24;

export async function traceSelectedModArchiveResourceReferences(input: {
  sourceArchive: string;
  requestText?: string;
  cache?: ArchiveContentCache;
}): Promise<McpServerEvidenceExecutorResult | undefined> {
  const startPaths = extractTraceableAssetPaths(input.requestText);
  if (
    startPaths.length === 0 ||
    !mentionsResourceReferenceTrace(input.requestText)
  ) {
    return undefined;
  }

  const trace = await traceModArchiveResourceReferences({
    sourceArchive: input.sourceArchive,
    startPaths,
    maxReferences: MAX_REFERENCE_TRACE_ENTRIES,
    cache: input.cache
  });

  return {
    matched: trace.references.length > 0,
    summary:
      trace.references.length > 0
        ? `Traced ${trace.references.length} mod archive resource reference(s).`
        : "No mod archive resource references were traced.",
    payload: {
      source: "mod_archive_content",
      mode: "resource_reference_trace",
      sourceArchive: input.sourceArchive,
      archiveMetadata: await readModArchiveMetadata(input.sourceArchive).catch(
        () => undefined
      ),
      resourceReferenceTrace: toCompactResourceReferenceTrace(trace)
    }
  };
}

export async function traceSelectedNestedModArchiveResourceReferences(input: {
  sourceArchive: string;
  embeddedArchivePath: string;
  requestText?: string;
}): Promise<McpServerEvidenceExecutorResult | undefined> {
  const startPaths = extractNestedTraceableAssetPaths(
    input.embeddedArchivePath,
    input.requestText
  );
  if (
    startPaths.length === 0 ||
    !mentionsResourceReferenceTrace(input.requestText)
  ) {
    return undefined;
  }

  const trace = await traceNestedModArchiveResourceReferences({
    sourceArchive: input.sourceArchive,
    embeddedArchivePath: input.embeddedArchivePath,
    startPaths,
    maxReferences: MAX_REFERENCE_TRACE_ENTRIES
  });

  return {
    matched: trace.references.length > 0,
    summary:
      trace.references.length > 0
        ? `Traced ${trace.references.length} nested mod archive resource reference(s).`
        : "No nested mod archive resource references were traced.",
    payload: {
      source: "mod_archive_content",
      mode: "resource_reference_trace_nested",
      sourceArchive: input.sourceArchive,
      embeddedArchivePath: trace.embeddedArchivePath,
      archiveMetadata: await readModArchiveMetadata(input.sourceArchive).catch(
        () => undefined
      ),
      resourceReferenceTrace: toCompactResourceReferenceTrace(trace)
    }
  };
}

function toCompactResourceReferenceTrace(
  trace: ModArchiveResourceReferenceTrace
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

function toCompactResourceReference(reference: ModArchiveResourceReference) {
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

function extractTraceableAssetPaths(requestText?: string): string[] {
  if (!requestText) {
    return [];
  }

  const matches = requestText.matchAll(
    /\bassets\/[A-Za-z0-9_.-]+\/(?:blockstates|items|models)\/[A-Za-z0-9_./+$-]+\.json\b/g
  );
  return unique([...matches].map((match) => match[0].replace(/[),.;:]+$/g, "")))
    .slice(0, 8);
}

function extractNestedTraceableAssetPaths(
  embeddedArchivePath: string,
  requestText?: string
): string[] {
  if (!requestText) {
    return [];
  }

  const escapedArchivePath = escapeRegExp(embeddedArchivePath);
  const matches = requestText.matchAll(
    new RegExp(
      `\\b${escapedArchivePath}!/(assets/[A-Za-z0-9_.-]+/(?:blockstates|items|models)/[A-Za-z0-9_./+$-]+\\.json)\\b`,
      "g"
    )
  );
  return unique([...matches].map((match) => match[1].replace(/[),.;:]+$/g, "")))
    .slice(0, 8);
}

function mentionsResourceReferenceTrace(requestText?: string): boolean {
  return requestText !== undefined &&
    /\b(?:trace|reference|references|dependency|dependencies|missing|unresolved)\b|引用|依赖|追踪|缺失|丢失|找不到/i.test(
      requestText
    );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
