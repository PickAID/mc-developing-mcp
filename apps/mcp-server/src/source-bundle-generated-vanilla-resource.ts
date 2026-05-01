import {
  discoverDatapackContent,
  listDatapackFiles,
  readDatapackFile,
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
import {
  ensureSourcePackageInstalled,
  type SourcePackageRecipeExecutor,
  type SourcePackageRecipeProvider,
  type SourcePackageRecipeRegistry
} from "@mcpskill/source-package-manager";
import type {
  ManagedRuntimeLayout,
  SourcePackageCoordinate
} from "@mcpskill/shared-types";

import type { McpServerEvidenceExecutorResult } from "./request-handler.js";

const GENERATED_VANILLA_RESOURCE_BUDGET = {
  maxFiles: 512,
  maxBytesPerFile: 64 * 1024
} as const;
const MAX_GENERATED_VANILLA_MATCHES = 16;
const MAX_GENERATED_VANILLA_LISTED_FILES = 32;
const MAX_GENERATED_VANILLA_REFERENCE_TRACE_ENTRIES = 24;

export interface McpServerGeneratedVanillaResourcePackageOptions {
  runtimeLayout: ManagedRuntimeLayout;
  recipes?: SourcePackageRecipeRegistry;
  recipeProvider?: SourcePackageRecipeProvider;
  executeRecipe: SourcePackageRecipeExecutor;
}

export async function executeMcpServerGeneratedVanillaResourcePackage(input: {
  minecraftVersion: string;
  sourcePackage: SourcePackageCoordinate;
  payloadSource: "vanilla_datapack" | "vanilla_assets";
  evidenceLabel: string;
  requestText: string;
  queries: string[];
  requestedPaths: string[];
  options: McpServerGeneratedVanillaResourcePackageOptions;
}): Promise<McpServerEvidenceExecutorResult> {
  const ensureResult = await ensureSourcePackageInstalled({
    runtimeLayout: input.options.runtimeLayout,
    sourcePackage: input.sourcePackage,
    recipes: input.options.recipes ?? {},
    recipeProvider: input.options.recipeProvider,
    executeRecipe: input.options.executeRecipe
  });

  if (ensureResult.status !== "ready") {
    return toPackageStatusResult({
      payloadSource: input.payloadSource,
      status: ensureResult.status,
      minecraftVersion: input.minecraftVersion,
      packageId: input.sourcePackage.packageId,
      summary: ensureResult.summary,
      error: "error" in ensureResult ? ensureResult.error : undefined
    });
  }

  const installPath = ensureResult.installState.installPath;
  if (!installPath) {
    return toPackageStatusResult({
      payloadSource: input.payloadSource,
      status: "install_validation_failed",
      minecraftVersion: input.minecraftVersion,
      packageId: input.sourcePackage.packageId,
      summary: `${input.evidenceLabel} package ${input.sourcePackage.packageId} has no install path.`
    });
  }

  const result = await resolveInstalledGeneratedVanillaResourcePackage({
    installPath,
    minecraftVersion: input.minecraftVersion,
    packageId: input.sourcePackage.packageId,
    evidenceLabel: input.evidenceLabel,
    requestText: input.requestText,
    queries: input.queries,
    requestedPaths: input.requestedPaths
  });

  return {
    matched: true,
    summary: result.summary,
    payload: {
      source: input.payloadSource,
      request: {
        minecraftVersion: input.minecraftVersion,
        queries: input.queries,
        requestedPaths: input.requestedPaths
      },
      result
    }
  };
}

async function resolveInstalledGeneratedVanillaResourcePackage(input: {
  installPath: string;
  minecraftVersion: string;
  packageId: string;
  evidenceLabel: string;
  requestText: string;
  queries: string[];
  requestedPaths: string[];
}) {
  const discovery = await discoverDatapackContent(input.installPath);
  const reads = await readRequestedPaths(input.installPath, input.requestedPaths);
  const search = await searchRequestedQueries(input.installPath, input.queries);
  const resourceSummary = toCompactResourceSummary(
    await summarizeDatapackFiles(
      input.installPath,
      GENERATED_VANILLA_RESOURCE_BUDGET
    )
  );
  const resourceReferenceTrace = await traceRequestedResourceReferences({
    installPath: input.installPath,
    requestText: input.requestText,
    requestedPaths: input.requestedPaths
  });

  if (input.queries.length === 0 && input.requestedPaths.length === 0) {
    const listed = await listDatapackFiles(input.installPath, {
      ...GENERATED_VANILLA_RESOURCE_BUDGET,
      limit: MAX_GENERATED_VANILLA_LISTED_FILES
    });

    return {
      status: listed.entries.length > 0 ? "ready" : "installed_but_no_match",
      minecraftVersion: input.minecraftVersion,
      packageId: input.packageId,
      discovery,
      resourceSummary,
      files: listed.entries,
      skipped: listed.skipped,
      truncated: listed.truncated,
      summary: `Listed ${listed.entries.length} ${input.evidenceLabel} file(s).`
    };
  }

  const matchCount = reads.files.length + search.matches.length;
  return {
    status: matchCount > 0 ? "ready" : "installed_but_no_match",
    minecraftVersion: input.minecraftVersion,
    packageId: input.packageId,
    discovery,
    resourceSummary,
    reads: reads.files,
    matches: search.matches,
    ...(resourceReferenceTrace ? { resourceReferenceTrace } : {}),
    skipped: [...reads.skipped, ...search.skipped],
    truncated: search.truncated,
    summary: matchCount > 0
      ? `Resolved ${matchCount} ${input.evidenceLabel} evidence item(s).`
      : `${input.evidenceLabel} package ${input.packageId} is installed but no matching file was found.`
  };
}

async function traceRequestedResourceReferences(input: {
  installPath: string;
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

  const trace = await traceDatapackResourceReferences(input.installPath, {
    ...GENERATED_VANILLA_RESOURCE_BUDGET,
    paths: startPaths,
    maxReferences: MAX_GENERATED_VANILLA_REFERENCE_TRACE_ENTRIES
  });

  return toCompactResourceReferenceTrace(trace);
}

async function readRequestedPaths(
  root: string,
  requestedPaths: string[]
): Promise<{ files: VanillaResourceReadEvidence[]; skipped: DatapackSkippedFile[] }> {
  const files: VanillaResourceReadEvidence[] = [];
  const skipped: DatapackSkippedFile[] = [];

  for (const relativePath of requestedPaths) {
    const result = await readDatapackFile(root, relativePath, {
      ...GENERATED_VANILLA_RESOURCE_BUDGET
    });

    if (result.file && result.content !== undefined) {
      files.push({ file: result.file, content: result.content });
    } else if (result.skipped) {
      skipped.push(result.skipped);
    }
  }

  return { files, skipped };
}

async function searchRequestedQueries(
  root: string,
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
    const result = await searchDatapackFiles(root, query, {
      ...GENERATED_VANILLA_RESOURCE_BUDGET
    });

    for (const match of result.matches) {
      matches.set(`${match.file.relativePath}:${match.line}:${match.column}`, match);
      if (matches.size >= MAX_GENERATED_VANILLA_MATCHES) {
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

function isTraceableAssetPath(path: string): boolean {
  return (
    path.startsWith("assets/") &&
    (
      path.includes("/blockstates/") ||
      path.includes("/models/")
    ) &&
    path.endsWith(".json")
  );
}

function mentionsResourceReferenceTrace(requestText: string): boolean {
  return /\b(?:trace|reference|references|dependency|dependencies|missing|unresolved)\b|引用|依赖|追踪|缺失|丢失|找不到/i.test(
    requestText
  );
}

function toPackageStatusResult(input: {
  payloadSource: "vanilla_datapack" | "vanilla_assets";
  status: string;
  minecraftVersion?: string;
  packageId?: string;
  summary: string;
  error?: string;
}): McpServerEvidenceExecutorResult {
  return {
    matched: true,
    summary: input.summary,
    payload: {
      source: input.payloadSource,
      result: {
        status: input.status,
        minecraftVersion: input.minecraftVersion,
        packageId: input.packageId,
        summary: input.summary,
        error: input.error
      }
    }
  };
}

interface VanillaResourceReadEvidence {
  file: DatapackFileEntry;
  content: string;
}
