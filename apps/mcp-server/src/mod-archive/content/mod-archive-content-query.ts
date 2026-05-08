import type { ArchiveContentDomain } from "minecraft-developing-mcp-jar-source-adapter";

export const MOD_ARCHIVE_QUERY_LIMIT = 4;
export const MOD_ARCHIVE_SEARCH_DOMAINS: ArchiveContentDomain[] = [
  "data",
  "assets",
  "java",
  "class",
  "metadata"
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
  "exception",
  "metadata",
  "resource",
  "paths"
]);

export function extractModArchiveQueries(requestText?: string): string[] {
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
  for (const path of normalizedText.match(/\b(?:(?:data|assets)\/[A-Za-z0-9_./+$-]+\.(?:json|mcmeta|txt|toml|lang|png)|[A-Za-z0-9_.-]+\.mixins?\.json|(?:fabric|quilt)\.mod\.json|pack\.mcmeta|META-INF\/(?:mods|neoforge\.mods)\.toml)\b/g) ?? []) {
    addQuery(queries, path);
  }
  for (const word of normalizedText.match(/\b[A-Za-z0-9_$.-]{5,}\b/g) ?? []) {
    if (!isStopWord(word)) {
      addQuery(queries, word);
    }
  }

  return queries.slice(0, MOD_ARCHIVE_QUERY_LIMIT);
}

export function extractListDomains(
  requestText?: string
): ArchiveContentDomain[] | undefined {
  if (!requestText || !/\b(list|show|entries|列出|查看)\b/i.test(requestText)) {
    return undefined;
  }

  const normalizedText = requestText.toLowerCase();
  const domains = MOD_ARCHIVE_SEARCH_DOMAINS.filter((domain) =>
    normalizedText.includes(domain)
  );

  return domains.length > 0 ? domains : MOD_ARCHIVE_SEARCH_DOMAINS;
}

export function isModArchivePreDecompileAnalysisRequest(
  requestText?: string
): boolean {
  return Boolean(
    requestText &&
      /\b(?:analy[sz]e|inspect|summari[sz]e|check)\b/i.test(requestText) &&
      /\b(?:pre-?decompile|before\s+decompil(?:e|ing|ation)|decompil(?:e|ing|ation))\b/i.test(
        requestText
      )
  );
}

function addQuery(queries: string[], query: string): void {
  if (query.length > 0 && !queries.includes(query)) {
    queries.push(query);
  }
}

function isStopWord(word: string): boolean {
  return QUERY_STOP_WORDS.has(word.toLowerCase());
}
