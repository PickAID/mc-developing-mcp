import { discoverKubeJsTypeResources } from "./discovery.js";
import { readBudgetedUtf8 } from "./read.js";
import type {
  KubeJsTypeSearchMatch,
  KubeJsTypeSearchResult,
  SearchKubeJsTypeResourcesOptions
} from "./types.js";

export async function searchKubeJsTypeResources(
  options: SearchKubeJsTypeResourcesOptions
): Promise<KubeJsTypeSearchResult> {
  const query = options.query.trim();
  if (query.length === 0) {
    throw new Error("query must not be empty");
  }

  const limit = normalizeBudget(options.limit, 20);
  const discovery = await discoverKubeJsTypeResources({
    workspaceRoot: options.workspaceRoot,
    maxFiles: options.maxFiles
  });
  const matches: KubeJsTypeSearchMatch[] = [];
  let searchedFiles = 0;
  let truncated = discovery.summary.truncated;

  for (const file of discovery.files) {
    if (matches.length >= limit) {
      truncated = true;
      break;
    }

    const read = await readBudgetedUtf8(file.absolutePath, options.maxBytesPerFile);
    searchedFiles += 1;
    if (read.truncated) {
      truncated = true;
    }

    for (const match of findLineMatches(read.text, query)) {
      matches.push({ file, ...match });
      if (matches.length >= limit) {
        truncated = true;
        break;
      }
    }
  }

  return {
    query,
    matches,
    searchedFiles,
    truncated
  };
}

function findLineMatches(
  content: string,
  query: string
): Array<{ lineNumber: number; line: string }> {
  const normalizedQuery = query.toLowerCase();
  const lines = content.split(/\r?\n/);
  const matches: Array<{ lineNumber: number; line: string }> = [];

  for (const [index, line] of lines.entries()) {
    if (line.toLowerCase().includes(normalizedQuery)) {
      matches.push({
        lineNumber: index + 1,
        line
      });
    }
  }

  return matches;
}

function normalizeBudget(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}
