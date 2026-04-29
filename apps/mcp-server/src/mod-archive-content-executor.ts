import {
  createArchiveContentCache,
  discoverModArchives,
  extractJavaClassReferences,
  findArchiveSetClassOwners,
  findCachedModArchiveClassOwners,
  readModArchiveMetadata,
  searchArchiveSetContent,
  type ArchiveContentCache,
  type ArchiveContentSkippedEntry,
  type ArchiveContentDomain,
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
  traceSelectedModArchiveResourceReferences,
  traceSelectedNestedModArchiveResourceReferences
} from "./mod-archive-resource-references.js";

const DEFAULT_MAX_ARCHIVES = 64;
const DEFAULT_MAX_MATCHES = 12;
const DEFAULT_MAX_BYTES_PER_FILE = 65_536;
const DEFAULT_MAX_QUERIES = 4;
const CLASS_OWNER_IGNORED_PACKAGE_PREFIXES = ["java.", "javax.", "jdk.", "sun."];
const SEARCH_DOMAINS: ArchiveContentDomain[] = [
  "data",
  "assets",
  "java",
  "class"
];
const QUERY_STOP_WORDS = new Set([
  "crash",
  "crashes",
  "server",
  "modpack",
  "recipe",
  "recipes",
  "datapack",
  "kubejs",
  "startup",
  "startup_scripts",
  "content",
  "latest",
  "latest.log",
  "exception"
]);

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
    domains: SEARCH_DOMAINS,
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
    limit: DEFAULT_MAX_QUERIES
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
    domains: SEARCH_DOMAINS,
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
      domains: SEARCH_DOMAINS,
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

function extractModArchiveQueries(requestText?: string): string[] {
  if (!requestText) {
    return [];
  }

  const queries: string[] = [];
  const normalizedText = requestText.replace(/[`"'“”‘’]/g, " ");

  for (const resourceId of normalizedText.match(/#?[a-z0-9_.-]+:[a-z0-9_./-]+/gi) ?? []) {
    addQuery(queries, resourceId.replace(/^#/, ""));
  }
  for (const className of normalizedText.match(/\b(?:[a-z_][\w$]*\.){2,}[A-Z_$][\w$]*\b/g) ?? []) {
    addQuery(queries, className);
  }
  for (const word of normalizedText.match(/\b[A-Za-z0-9_$.-]{5,}\b/g) ?? []) {
    if (!isStopWord(word)) {
      addQuery(queries, word);
    }
  }

  return queries.slice(0, DEFAULT_MAX_QUERIES);
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

function extractListDomains(requestText?: string): ArchiveContentDomain[] | undefined {
  if (!requestText || !/\b(list|show|entries|列出|查看)\b/i.test(requestText)) {
    return undefined;
  }

  const normalizedText = requestText.toLowerCase();
  const domains = SEARCH_DOMAINS.filter((domain) =>
    normalizedText.includes(domain)
  );

  return domains.length > 0 ? domains : SEARCH_DOMAINS;
}

function addQuery(queries: string[], query: string): void {
  if (query.length > 0 && !queries.includes(query)) {
    queries.push(query);
  }
}

function isStopWord(word: string): boolean {
  return QUERY_STOP_WORDS.has(word.toLowerCase());
}
