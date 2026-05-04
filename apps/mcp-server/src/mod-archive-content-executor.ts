import {
  createArchiveContentCache,
  discoverModArchives,
  type ArchiveContentCache
} from "@mcpskill/jar-source-adapter";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";
import {
  extractNestedArchiveEntryPathRequest,
  readSelectedNestedEntries,
  readSelectedNestedEntry
} from "./mod-archive-nested-read.js";
import {
  extractNestedArchiveListPath,
  listSelectedNestedEntries
} from "./mod-archive-nested-list.js";
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
} from "./mod-archive-entry-operations.js";
import {
  traceFirstMatchingModArchiveResourceReferences,
  traceSelectedModArchiveResourceReferences,
  traceSelectedNestedModArchiveResourceReferences
} from "./mod-archive-resource-references.js";
import {
  MOD_ARCHIVE_SEARCH_DOMAINS,
  extractListDomains,
  extractModArchiveQueries
} from "./mod-archive-content-query.js";
import {
  DEFAULT_MAX_ARCHIVES
} from "./mod-archive-content-constants.js";
import {
  buildEmptyPayload,
  selectArchive
} from "./mod-archive-content-selection.js";
import { searchQueries } from "./mod-archive-content-search.js";
import { attachArchiveMetadata } from "./mod-archive-content-metadata.js";
import {
  lookupClassOwners,
  lookupLoaderDependencyOwner
} from "./mod-archive-content-owners.js";

export interface McpServerModArchiveContentExecutorOptions {
  cache?: ArchiveContentCache;
  inventoryDatabasePath?: string;
  runtimeRoot?: string;
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
    executeMcpServerModArchiveContent(input, { cache, inventoryDatabasePath });
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
    maxArchives: DEFAULT_MAX_ARCHIVES
  });
  const requestText = input.candidate.queryHint ?? input.requestPlan.requestText;
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

  const selectedArchive = selectArchive(archives.archives, requestText);
  const nestedEntryPathRequest = extractNestedArchiveEntryPathRequest(requestText);
  if (nestedEntryPathRequest.requests.length > 1 && selectedArchive) {
    return readSelectedNestedEntries({
      sourceArchive: selectedArchive.archivePath,
      requests: nestedEntryPathRequest.requests,
      truncated: nestedEntryPathRequest.truncated
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
      request: nestedEntryPath
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
      cache: options.cache
    });
  }

  const entryPath = entryPathRequest.paths[0];
  if (entryPath && selectedArchive) {
    return readSelectedEntry({
      sourceArchive: selectedArchive.archivePath,
      relativePath: entryPath,
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
