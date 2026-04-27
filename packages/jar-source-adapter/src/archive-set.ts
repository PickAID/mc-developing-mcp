import {
  searchArchiveContent,
  type ArchiveContentDomain,
  type ArchiveContentCache,
  type ArchiveContentSearchMatch,
  type ArchiveContentSkippedEntry
} from "./archive-content.js";

export interface ArchiveSetContentSearchMatch extends ArchiveContentSearchMatch {
  sourceArchive: string;
}

export interface SearchArchiveSetContentResult {
  matches: ArchiveSetContentSearchMatch[];
  skipped: Array<ArchiveContentSkippedEntry & { sourceArchive: string }>;
  searchedArchives: number;
  truncated: boolean;
}

export async function searchArchiveSetContent(input: {
  sourceArchives: string[];
  domains: ArchiveContentDomain[];
  query: string;
  maxArchives?: number;
  maxMatches?: number;
  maxBytesPerFile?: number;
  cache?: ArchiveContentCache;
}): Promise<SearchArchiveSetContentResult> {
  const maxArchives = normalizeLimit(input.maxArchives);
  const maxMatches = normalizeLimit(input.maxMatches);
  const matches: ArchiveSetContentSearchMatch[] = [];
  const skipped: SearchArchiveSetContentResult["skipped"] = [];
  let searchedArchives = 0;
  let truncated = input.sourceArchives.length > maxArchives;

  for (const sourceArchive of input.sourceArchives.slice(0, maxArchives)) {
    if (matches.length >= maxMatches) {
      truncated = true;
      break;
    }

    searchedArchives += 1;
    const remainingMatches = maxMatches - matches.length;
    const result = await searchArchiveContent({
      sourceArchive,
      domains: input.domains,
      query: input.query,
      limit: remainingMatches,
      maxBytesPerFile: input.maxBytesPerFile,
      cache: input.cache
    });

    matches.push(
      ...result.matches.map((match) => ({
        ...match,
        sourceArchive
      }))
    );
    skipped.push(
      ...result.skipped.map((entry) => ({
        ...entry,
        sourceArchive
      }))
    );
    truncated = truncated || result.truncated;
  }

  return {
    matches,
    skipped,
    searchedArchives,
    truncated
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Math.floor(limit));
}
