import {
  analyzeModArchiveBeforeDecompile,
  createArchiveContentCache,
  discoverModArchives,
  type ArchiveContentCache
} from "minecraft-developing-mcp-jar-source-adapter";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "../../request/execution/request-handler.js";
import {
  extractNestedArchiveEntryPathRequest,
  readSelectedNestedEntries,
  readSelectedNestedEntry
} from "../nested/mod-archive-nested-read.js";
import {
  extractNestedArchiveListPath,
  listSelectedNestedEntries
} from "../nested/mod-archive-nested-list.js";
import {
  isModArchiveInventoryRequest,
  listModArchiveInventory,
  resolveModArchiveInventoryDatabasePath,
  shouldRefreshModArchiveInventory
} from "./mod-archive-inventory.js";
import {
  extractArchiveEntryPathRequest,
  listSelectedEntries,
  readSelectedEntries,
  readSelectedEntry
} from "../read/mod-archive-entry-operations.js";
import {
  traceFirstMatchingModArchiveResourceReferences,
  traceSelectedModArchiveResourceReferences,
  traceSelectedNestedModArchiveResourceReferences
} from "./mod-archive-resource-references.js";
import {
  MOD_ARCHIVE_SEARCH_DOMAINS,
  extractListDomains,
  extractModArchiveQueries,
  isModArchivePreDecompileAnalysisRequest
} from "./mod-archive-content-query.js";
import {
  DEFAULT_MAX_ARCHIVES,
  DEFAULT_MAX_CLASS_OWNER_ARCHIVES
} from "./mod-archive-content-constants.js";
import {
  buildEmptyPayload,
  selectArchive
} from "./mod-archive-content-selection.js";
import { searchQueries } from "./mod-archive-content-search.js";
import { attachArchiveMetadata } from "./mod-archive-content-metadata.js";
import {
  lookupCrashMentionedModOwner,
  lookupClassOwners,
  lookupLoaderDependencyOwner,
  lookupMixinTargetVerification
} from "./mod-archive-content-owners.js";
import { lookupHotaiPatchProof } from "../hotai/hotai-patch-proof.js";

export interface McpServerModArchiveContentExecutorOptions {
  cache?: ArchiveContentCache;
  inventoryDatabasePath?: string;
  runtimeRoot?: string;
  sourceIndexDatabasePaths?: string[];
}

export function createMcpServerModArchiveContentExecutor(
  options: McpServerModArchiveContentExecutorOptions = {}
) {
  const cache = options.cache ?? createArchiveContentCache();
  const inventoryDatabasePath =
    options.inventoryDatabasePath ??
    (options.runtimeRoot
      ? resolveModArchiveInventoryDatabasePath(options.runtimeRoot)
      : undefined);

  return (input: McpServerEvidenceExecutorInput) =>
    executeMcpServerModArchiveContent(input, {
      cache,
      inventoryDatabasePath,
      runtimeRoot: options.runtimeRoot,
      sourceIndexDatabasePaths: options.sourceIndexDatabasePaths
    });
}

export async function executeMcpServerModArchiveContent(
  input: McpServerEvidenceExecutorInput,
  options: McpServerModArchiveContentExecutorOptions = {}
): Promise<McpServerEvidenceExecutorResult> {
  if (input.candidate.routeStep !== "mod_archive_content") {
    return {
      matched: false,
      summary: "No mod archive content request detected."
    };
  }

  const workspaceRoot = input.requestPlan.requestContext.workspaceContext?.workspaceRoot;
  if (!workspaceRoot) {
    return {
      matched: false,
      summary: "No workspace root available for mod archive search."
    };
  }

  const archives = await discoverModArchives({
    workspaceRoot,
    maxArchives: DEFAULT_MAX_CLASS_OWNER_ARCHIVES
  });
  const requestText = input.candidate.queryHint ?? input.requestPlan.requestText;
  const originalRequestText = input.requestPlan.requestText;
  const queries = extractModArchiveQueries(requestText);

  if (isModArchiveInventoryRequest(requestText)) {
    return listModArchiveInventory({
      executorInput: input,
      cache: options.cache,
      databasePath: options.inventoryDatabasePath,
      refresh: shouldRefreshModArchiveInventory(requestText)
    });
  }

  if (archives.archives.length === 0) {
    return {
      matched: false,
      summary: "No mod archives were discovered in this workspace.",
      payload: buildEmptyPayload(queries, 0)
    };
  }

  const loaderDependencyOwnerResult = await lookupLoaderDependencyOwner({
    workspaceRoot,
    requestText,
    cache: options.cache
  });
  if (loaderDependencyOwnerResult) {
    return loaderDependencyOwnerResult;
  }

  const crashMentionedModOwnerResult = await lookupCrashMentionedModOwner({
    workspaceRoot,
    requestText,
    cache: options.cache
  });
  if (crashMentionedModOwnerResult) {
    return crashMentionedModOwnerResult;
  }

  const selectedArchive = selectArchive(archives.archives, requestText);
  if (selectedArchive && isModArchivePreDecompileAnalysisRequest(requestText)) {
    const [analyzed] = await attachArchiveMetadata([
      await analyzeModArchiveBeforeDecompile({
        sourceArchive: selectedArchive.archivePath
      })
    ]);

    return {
      matched: true,
      summary: "Analyzed selected mod archive before decompile.",
      payload: {
        source: "mod_archive_content",
        mode: "pre_decompile_analysis",
        sourceArchive: selectedArchive.archivePath,
        archiveRelativePath: selectedArchive.relativePath,
        analysis: analyzed
      }
    };
  }

  const nestedEntryPathRequest = extractNestedArchiveEntryPathRequest(requestText);
  if (nestedEntryPathRequest.requests.length > 1 && selectedArchive) {
    return readSelectedNestedEntries({
      sourceArchive: selectedArchive.archivePath,
      requests: nestedEntryPathRequest.requests,
      truncated: nestedEntryPathRequest.truncated,
      requestText
    });
  }

  const nestedEntryPath = nestedEntryPathRequest.requests[0];
  if (nestedEntryPath && selectedArchive) {
    const nestedResourceTrace = await traceSelectedNestedModArchiveResourceReferences({
      sourceArchive: selectedArchive.archivePath,
      embeddedArchivePath: nestedEntryPath.embeddedArchivePath,
      requestText
    });
    if (nestedResourceTrace) {
      return nestedResourceTrace;
    }

    return readSelectedNestedEntry({
      sourceArchive: selectedArchive.archivePath,
      request: nestedEntryPath,
      requestText
    });
  }

  const entryPathRequest = extractArchiveEntryPathRequest(requestText);
  if (selectedArchive) {
    const resourceTrace = await traceSelectedModArchiveResourceReferences({
      sourceArchive: selectedArchive.archivePath,
      requestText,
      cache: options.cache
    });
    if (resourceTrace) {
      return resourceTrace;
    }
  }
  if (!selectedArchive) {
    const resourceTrace = await traceFirstMatchingModArchiveResourceReferences({
      sourceArchives: archives.archives.map((archive) => archive.archivePath),
      requestText,
      cache: options.cache
    });
    if (resourceTrace) {
      return resourceTrace;
    }
  }

  if (entryPathRequest.paths.length > 1 && selectedArchive) {
    return readSelectedEntries({
      sourceArchive: selectedArchive.archivePath,
      relativePaths: entryPathRequest.paths,
      truncated: entryPathRequest.truncated,
      requestText,
      cache: options.cache
    });
  }

  const entryPath = entryPathRequest.paths[0];
  if (entryPath && selectedArchive) {
    return readSelectedEntry({
      sourceArchive: selectedArchive.archivePath,
      relativePath: entryPath,
      requestText,
      cache: options.cache
    });
  }

  const listDomains = extractListDomains(requestText);
  const nestedListPath = extractNestedArchiveListPath(requestText);
  if (listDomains && nestedListPath && selectedArchive) {
    return listSelectedNestedEntries({
      sourceArchive: selectedArchive.archivePath,
      embeddedArchivePath: nestedListPath,
      domains: listDomains
    });
  }

  if (listDomains && selectedArchive) {
    return listSelectedEntries({
      sourceArchive: selectedArchive.archivePath,
      domains: listDomains,
      cache: options.cache
    });
  }

  const hotaiPatchProofResult = await lookupHotaiPatchProof({
    workspaceRoot,
    archivePaths: archives.archives.map((archive) => archive.archivePath),
    requestText: joinRequestTexts(requestText, originalRequestText),
    cache: options.cache
  });
  if (hotaiPatchProofResult) {
    return hotaiPatchProofResult;
  }

  const mixinTargetVerificationResult = await lookupMixinTargetVerification({
    workspaceRoot,
    archivePaths: archives.archives.map((archive) => archive.archivePath),
    requestText,
    cache: options.cache,
      databasePath: options.inventoryDatabasePath,
      runtimeRoot: options.runtimeRoot,
      sourceIndexDatabasePaths: options.sourceIndexDatabasePaths,
      refresh: shouldRefreshModArchiveInventory(requestText)
    });
  if (mixinTargetVerificationResult) {
    return mixinTargetVerificationResult;
  }

  const classOwnerResult = await lookupClassOwners({
    workspaceRoot,
    archivePaths: archives.archives.map((archive) => archive.archivePath),
    requestText,
    cache: options.cache,
    databasePath: options.inventoryDatabasePath,
    refresh: shouldRefreshModArchiveInventory(requestText)
  });
  if (classOwnerResult) {
    return classOwnerResult;
  }

  if (queries.length === 0) {
    return {
      matched: false,
      summary: "No token-efficient mod archive query could be extracted.",
      payload: buildEmptyPayload(queries, archives.archives.length)
    };
  }

  const result = await searchQueries({
    archivePaths: archives.archives.map((archive) => archive.archivePath),
    queries,
    cache: options.cache
  });
  const payload = {
    source: "mod_archive_content",
    domains: MOD_ARCHIVE_SEARCH_DOMAINS,
    queries,
    archiveCount: archives.archives.length,
    searchedArchives: result.searchedArchives,
    matches: await attachArchiveMetadata(result.matches),
    skipped: result.skipped,
    truncated: archives.truncated || result.truncated
  };

  if (result.matches.length === 0) {
    return {
      matched: false,
      summary: `No mod archive content matched ${queries.join(", ")}.`,
      payload
    };
  }

  return {
    matched: true,
    summary: `Found ${result.matches.length} mod archive content match(es).`,
    payload
  };
}

function joinRequestTexts(
  primary: string | undefined,
  secondary: string | undefined
): string | undefined {
  if (!primary) {
    return secondary;
  }
  if (!secondary || primary.includes(secondary)) {
    return primary;
  }

  return `${primary}\n${secondary}`;
}
