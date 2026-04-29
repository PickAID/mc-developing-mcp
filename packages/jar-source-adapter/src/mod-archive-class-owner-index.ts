import type {
  ArchiveClassOwnerMatch,
  ArchiveClassOwnerMatchKind
} from "./class-owner.js";
import {
  queryCachedModArchiveEntries,
  type ModArchiveEntryIndexCacheMetadata
} from "./mod-archive-entry-index.js";

export interface FindCachedModArchiveClassOwnersResult {
  matches: ArchiveClassOwnerMatch[];
  searchedArchives: number;
  truncated: boolean;
  cache: {
    entryIndex: ModArchiveEntryIndexCacheMetadata;
  };
}

const DEFAULT_MAX_MATCHES = Number.POSITIVE_INFINITY;

export async function findCachedModArchiveClassOwners(input: {
  workspaceRoot: string;
  databasePath: string;
  classNames: string[];
  maxArchives?: number;
  maxMatches?: number;
  includeNested?: boolean;
  refresh?: boolean;
}): Promise<FindCachedModArchiveClassOwnersResult> {
  const requestedClasses = normalizeRequestedClasses(input.classNames);
  const maxMatches = normalizeLimit(input.maxMatches, DEFAULT_MAX_MATCHES);
  const matches: ArchiveClassOwnerMatch[] = [];
  const entryIndex = await queryCachedModArchiveEntries({
    workspaceRoot: input.workspaceRoot,
    databasePath: input.databasePath,
    domains: ["class"],
    maxArchives: input.maxArchives,
    refresh: input.refresh
  });

  if (requestedClasses.length === 0 || maxMatches === 0) {
    return buildResult({ entryIndex, matches, truncated: false });
  }

  let truncated = false;
  for (const entry of entryIndex.entries) {
    const binaryName = entry.relativePath
      .replace(/\.class$/i, "")
      .replaceAll("/", ".");

    for (const requestedClassName of requestedClasses) {
      const matchKind = getClassMatchKind(
        binaryName,
        requestedClassName,
        input.includeNested ?? false
      );
      if (!matchKind) {
        continue;
      }
      if (matches.length >= maxMatches) {
        truncated = true;
        break;
      }
      matches.push({
        sourceArchive: entry.sourceArchive,
        archiveRelativePath: entry.archiveRelativePath,
        requestedClassName,
        binaryName,
        relativePath: entry.relativePath,
        sizeBytes: entry.sizeBytes,
        matchKind
      });
    }
    if (truncated) {
      break;
    }
  }

  return buildResult({
    entryIndex,
    matches,
    truncated: truncated || entryIndex.truncated
  });
}

function buildResult(input: {
  entryIndex: Awaited<ReturnType<typeof queryCachedModArchiveEntries>>;
  matches: ArchiveClassOwnerMatch[];
  truncated: boolean;
}): FindCachedModArchiveClassOwnersResult {
  return {
    matches: input.matches,
    searchedArchives: input.entryIndex.archiveCount,
    truncated: input.truncated,
    cache: {
      entryIndex: input.entryIndex.cache
    }
  };
}

function normalizeRequestedClasses(classNames: string[]): string[] {
  const normalized: string[] = [];

  for (const className of classNames) {
    const reference = normalizeClassReference(className);
    if (reference && !normalized.includes(reference)) {
      normalized.push(reference);
    }
  }

  return normalized;
}

function normalizeClassReference(rawReference: string): string | undefined {
  const withoutDecorators = rawReference
    .replace(/^[\s"'`]+|[\s"'`,;:)]+$/g, "")
    .replace(/\.class$/i, "");
  const dotted = withoutDecorators.replaceAll("/", ".");

  if (!dotted.includes(".") || dotted.startsWith(".") || dotted.endsWith(".")) {
    return undefined;
  }

  const simpleName = dotted.split(".").at(-1) ?? "";
  return /^[A-Z_$]/.test(simpleName) ? dotted : undefined;
}

function getClassMatchKind(
  binaryName: string,
  requestedClassName: string,
  includeNested: boolean
): ArchiveClassOwnerMatchKind | undefined {
  if (binaryName === requestedClassName) {
    return "exact";
  }
  if (includeNested && binaryName.startsWith(`${requestedClassName}$`)) {
    return "nested";
  }

  return undefined;
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  return Math.max(0, Math.floor(limit ?? fallback));
}
