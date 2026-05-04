import {
  createArchiveContentCache,
  discoverModArchives,
  extractJavaClassReferences,
  findArchiveSetClassOwners,
  findCachedModArchiveClassOwners,
  findModArchiveInventoryMetadataOwners,
  readModArchiveMetadata,
  searchArchiveSetContent,
  type ArchiveContentCache,
  type ArchiveContentSkippedEntry,
  type ArchiveSetContentSearchMatch,
  type ModArchiveMetadata
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
  MOD_ARCHIVE_QUERY_LIMIT,
  MOD_ARCHIVE_SEARCH_DOMAINS,
  extractListDomains,
  extractModArchiveQueries
} from "./mod-archive-content-query.js";
import { extractCrashLoaderDependency } from "./external-mod-loader-dependency.js";

const DEFAULT_MAX_ARCHIVES = 64;
const DEFAULT_MAX_MATCHES = 12;
const DEFAULT_MAX_BYTES_PER_FILE = 65_536;
const CLASS_OWNER_IGNORED_PACKAGE_PREFIXES = ["java.", "javax.", "jdk.", "sun."];

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

async function lookupLoaderDependencyOwner(input: {
  workspaceRoot: string;
  requestText?: string;
  cache?: ArchiveContentCache;
}): Promise<McpServerEvidenceExecutorResult | undefined> {
  if (!input.requestText) {
    return undefined;
  }

  const dependency = extractCrashLoaderDependency(input.requestText);
  if (!dependency?.requestedBy) {
    return undefined;
  }

  const ownerResult = await findModArchiveInventoryMetadataOwners({
    workspaceRoot: input.workspaceRoot,
    modIds: [dependency.requestedBy],
    maxArchives: DEFAULT_MAX_ARCHIVES,
    cache: input.cache
  });
  const owner = ownerResult.matches[0];
  if (!owner) {
    return undefined;
  }

  return {
    matched: false,
    summary: `Located loader dependency requester ${dependency.requestedBy} in mod archive metadata.`,
    payload: {
      source: "mod_archive_content",
      mode: "loader_dependency_owner",
      missingDependencyModId: dependency.modId,
      requestedBy: dependency.requestedBy,
      kind: dependency.kind,
      expectedRange: dependency.expectedRange,
      actualVersion: dependency.actualVersion,
      owner,
      requestedModIds: ownerResult.requestedModIds,
      searchedArchives: ownerResult.searchedArchives,
      truncated: ownerResult.truncated
    }
  };
}

async function lookupClassOwners(input: {
  workspaceRoot: string;
  archivePaths: string[];
  requestText?: string;
  cache?: ArchiveContentCache;
  databasePath?: string;
  refresh?: boolean;
}): Promise<McpServerEvidenceExecutorResult | undefined> {
  const requestedClasses = extractJavaClassReferences(input.requestText, {
    ignoredPackagePrefixes: CLASS_OWNER_IGNORED_PACKAGE_PREFIXES,
    limit: MOD_ARCHIVE_QUERY_LIMIT
  });

  if (requestedClasses.length === 0) {
    return undefined;
  }

  const result = input.databasePath
    ? await findCachedModArchiveClassOwners({
        workspaceRoot: input.workspaceRoot,
        databasePath: input.databasePath,
        classNames: requestedClasses,
        maxArchives: DEFAULT_MAX_ARCHIVES,
        maxMatches: DEFAULT_MAX_MATCHES,
        refresh: input.refresh
      })
    : await findArchiveSetClassOwners({
        sourceArchives: input.archivePaths,
        classNames: requestedClasses,
        maxArchives: DEFAULT_MAX_ARCHIVES,
        maxMatches: DEFAULT_MAX_MATCHES,
        cache: input.cache
      });

  const resolvedResult = result.matches.length > 0
    ? result
    : await findArchiveSetClassOwners({
        sourceArchives: input.archivePaths,
        classNames: requestedClasses,
        maxArchives: DEFAULT_MAX_ARCHIVES,
        maxMatches: DEFAULT_MAX_MATCHES,
        cache: input.cache
      });

  if (resolvedResult.matches.length === 0) {
    return undefined;
  }
  const matches = await attachArchiveMetadata(resolvedResult.matches);

  return {
    matched: true,
    summary: `Located ${resolvedResult.matches.length} class owner match(es) in mod archives.`,
    payload: {
      source: "mod_archive_content",
      mode: "class_owner",
      requestedClasses,
      matches,
      searchedArchives: resolvedResult.searchedArchives,
      cache: resolvedResult.cache,
      truncated: resolvedResult.truncated
    }
  };
}

function buildEmptyPayload(queries: string[], archiveCount: number) {
  return {
    source: "mod_archive_content",
    domains: MOD_ARCHIVE_SEARCH_DOMAINS,
    queries,
    archiveCount,
    searchedArchives: 0,
    matches: [],
    skipped: [],
    truncated: false
  };
}

async function searchQueries(input: {
  archivePaths: string[];
  queries: string[];
  cache?: ArchiveContentCache;
}) {
  const matches: ArchiveSetContentSearchMatch[] = [];
  const skipped: Array<ArchiveContentSkippedEntry & { sourceArchive: string }> = [];
  let searchedArchives = 0;
  let truncated = false;

  for (const query of input.queries) {
    const remainingMatches = DEFAULT_MAX_MATCHES - matches.length;
    if (remainingMatches <= 0) {
      truncated = true;
      break;
    }

    const result = await searchArchiveSetContent({
      sourceArchives: input.archivePaths,
      domains: MOD_ARCHIVE_SEARCH_DOMAINS,
      query,
      maxArchives: DEFAULT_MAX_ARCHIVES,
      maxMatches: remainingMatches,
      maxBytesPerFile: DEFAULT_MAX_BYTES_PER_FILE,
      cache: input.cache
    });

    matches.push(...result.matches);
    skipped.push(...result.skipped);
    searchedArchives = Math.max(searchedArchives, result.searchedArchives);
    truncated = truncated || result.truncated;

    if (matches.length > 0) {
      break;
    }
  }

  return { matches, skipped, searchedArchives, truncated };
}

async function attachArchiveMetadata<T extends { sourceArchive: string }>(
  matches: T[]
): Promise<Array<T & { archiveMetadata?: ModArchiveMetadata }>> {
  const cache = new Map<string, Promise<ModArchiveMetadata | undefined>>();

  return Promise.all(
    matches.map(async (match) => {
      const archiveMetadata = await readArchiveMetadataCached(
        match.sourceArchive,
        cache
      );

      return archiveMetadata ? { ...match, archiveMetadata } : match;
    })
  );
}

function readArchiveMetadataCached(
  sourceArchive: string,
  cache: Map<string, Promise<ModArchiveMetadata | undefined>>
): Promise<ModArchiveMetadata | undefined> {
  const existing = cache.get(sourceArchive);
  if (existing) {
    return existing;
  }

  const loaded = readArchiveMetadata(sourceArchive);
  cache.set(sourceArchive, loaded);
  return loaded;
}

async function readArchiveMetadata(
  sourceArchive: string
): Promise<ModArchiveMetadata | undefined> {
  return readModArchiveMetadata(sourceArchive).catch(() => undefined);
}

function selectArchive(
  archives: Array<{ archivePath: string; relativePath: string }>,
  requestText?: string
): { archivePath: string; relativePath: string } | undefined {
  if (archives.length === 1) {
    return archives[0];
  }
  if (!requestText) {
    return undefined;
  }

  const normalizedText = requestText.toLowerCase();
  return archives.find((archive) => {
    const archivePath = archive.archivePath.toLowerCase();
    const relativePath = archive.relativePath.toLowerCase();
    const archiveName = relativePath.split("/").at(-1) ?? relativePath;
    return (
      normalizedText.includes(archivePath) ||
      normalizedText.includes(relativePath) ||
      normalizedText.includes(archiveName)
    );
  });
}
