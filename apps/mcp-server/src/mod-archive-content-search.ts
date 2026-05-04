import {
  searchArchiveSetContent,
  type ArchiveContentCache,
  type ArchiveContentSkippedEntry,
  type ArchiveSetContentSearchMatch
} from "@mcpskill/jar-source-adapter";

import {
  DEFAULT_MAX_ARCHIVES,
  DEFAULT_MAX_BYTES_PER_FILE,
  DEFAULT_MAX_MATCHES
} from "./mod-archive-content-constants.js";
import {
  MOD_ARCHIVE_SEARCH_DOMAINS
} from "./mod-archive-content-query.js";

export async function searchQueries(input: {
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
