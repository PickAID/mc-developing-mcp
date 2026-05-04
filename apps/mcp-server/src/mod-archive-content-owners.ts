import {
  extractJavaClassReferences,
  findArchiveSetClassOwners,
  findCachedModArchiveClassOwners,
  findModArchiveInventoryMetadataOwners,
  type ArchiveContentCache
} from "@mcpskill/jar-source-adapter";

import { extractCrashLoaderDependency } from "./external-mod-loader-dependency.js";
import {
  CLASS_OWNER_IGNORED_PACKAGE_PREFIXES,
  DEFAULT_MAX_ARCHIVES,
  DEFAULT_MAX_MATCHES
} from "./mod-archive-content-constants.js";
import { attachArchiveMetadata } from "./mod-archive-content-metadata.js";
import {
  MOD_ARCHIVE_QUERY_LIMIT
} from "./mod-archive-content-query.js";
import type {
  McpServerEvidenceExecutorResult
} from "./request-handler.js";

export async function lookupLoaderDependencyOwner(input: {
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

export async function lookupClassOwners(input: {
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
