import {
  createArchiveContentCache,
  discoverModArchives,
  extractJavaClassReferences,
  findArchiveSetClassOwners,
  listArchiveContent,
  readArchiveContentFile,
  searchArchiveSetContent,
  type ArchiveContentCache,
  type ArchiveContentSkippedEntry,
  type ArchiveContentDomain,
  type ArchiveSetContentSearchMatch
} from "@mcpskill/jar-source-adapter";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";

const DEFAULT_MAX_ARCHIVES = 64;
const DEFAULT_MAX_LIST_ENTRIES = 64;
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
}

export function createMcpServerModArchiveContentExecutor(
  options: McpServerModArchiveContentExecutorOptions = {}
) {
  const cache = options.cache ?? createArchiveContentCache();

  return (input: McpServerEvidenceExecutorInput) =>
    executeMcpServerModArchiveContent(input, { cache });
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

  if (archives.archives.length === 0) {
    return {
      matched: false,
      summary: "No mod archives were discovered in this workspace.",
      payload: buildEmptyPayload(queries, 0)
    };
  }

  const selectedArchive = selectArchive(archives.archives, requestText);
  const entryPath = extractArchiveEntryPath(requestText);
  if (entryPath && selectedArchive) {
    return readSelectedEntry({
      sourceArchive: selectedArchive.archivePath,
      relativePath: entryPath,
      cache: options.cache
    });
  }

  const listDomains = extractListDomains(requestText);
  if (listDomains && selectedArchive) {
    return listSelectedEntries({
      sourceArchive: selectedArchive.archivePath,
      domains: listDomains,
      cache: options.cache
    });
  }

  const classOwnerResult = await lookupClassOwners({
    archivePaths: archives.archives.map((archive) => archive.archivePath),
    requestText,
    cache: options.cache
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
    matches: result.matches,
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
  archivePaths: string[];
  requestText?: string;
  cache?: ArchiveContentCache;
}): Promise<McpServerEvidenceExecutorResult | undefined> {
  const requestedClasses = extractJavaClassReferences(input.requestText, {
    ignoredPackagePrefixes: CLASS_OWNER_IGNORED_PACKAGE_PREFIXES,
    limit: DEFAULT_MAX_QUERIES
  });

  if (requestedClasses.length === 0) {
    return undefined;
  }

  const result = await findArchiveSetClassOwners({
    sourceArchives: input.archivePaths,
    classNames: requestedClasses,
    maxArchives: DEFAULT_MAX_ARCHIVES,
    maxMatches: DEFAULT_MAX_MATCHES,
    cache: input.cache
  });

  if (result.matches.length === 0) {
    return undefined;
  }

  return {
    matched: true,
    summary: `Located ${result.matches.length} class owner match(es) in mod archives.`,
    payload: {
      source: "mod_archive_content",
      mode: "class_owner",
      requestedClasses,
      matches: result.matches,
      searchedArchives: result.searchedArchives,
      cache: result.cache,
      truncated: result.truncated
    }
  };
}

async function readSelectedEntry(input: {
  sourceArchive: string;
  relativePath: string;
  cache?: ArchiveContentCache;
}): Promise<McpServerEvidenceExecutorResult> {
  const result = await readArchiveContentFile({
    sourceArchive: input.sourceArchive,
    relativePath: input.relativePath,
    maxBytes: DEFAULT_MAX_BYTES_PER_FILE,
    cache: input.cache
  });
  const payload = {
    source: "mod_archive_content",
    mode: "read",
    sourceArchive: input.sourceArchive,
    requestedPath: input.relativePath,
    ...result
  };

  if (!result.content) {
    return {
      matched: false,
      summary: `Could not read ${input.relativePath} from selected mod archive.`,
      payload
    };
  }

  return {
    matched: true,
    summary: `Read ${input.relativePath} from selected mod archive.`,
    payload
  };
}

async function listSelectedEntries(input: {
  sourceArchive: string;
  domains: ArchiveContentDomain[];
  cache?: ArchiveContentCache;
}): Promise<McpServerEvidenceExecutorResult> {
  const result = await listArchiveContent({
    sourceArchive: input.sourceArchive,
    domains: input.domains,
    limit: DEFAULT_MAX_LIST_ENTRIES,
    cache: input.cache
  });

  return {
    matched: true,
    summary: `Listed ${result.entries.length} mod archive entrie(s).`,
    payload: {
      source: "mod_archive_content",
      mode: "list",
      sourceArchive: input.sourceArchive,
      domains: input.domains,
      entries: result.entries,
      cache: result.cache,
      truncated: result.truncated
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

function extractArchiveEntryPath(requestText?: string): string | undefined {
  if (!requestText) {
    return undefined;
  }

  const text = requestText.replace(/[`"'“”‘’]/g, " ");
  const patterns = [
    /\b(?:data|assets)\/[A-Za-z0-9_./+$-]+\.(?:json|mcmeta|txt|toml|lang|png)\b/,
    /\b(?:[A-Za-z_$][\w$]*\/){2,}[A-Za-z_$][\w$]*\.(?:java|class)\b/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) {
      return match[0].replace(/[),.;:]+$/g, "");
    }
  }

  return undefined;
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
