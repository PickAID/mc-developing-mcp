import {
  extractJavaClassReferences,
  findArchiveSetClassOwners,
  findCachedModArchiveClassOwners,
  findModArchiveInventoryMetadataOwners,
  listArchiveContent,
  queryCachedModArchiveEntries,
  type ArchiveContentCache
} from "@mcpskill/jar-source-adapter";

import { collectAccessWidenerTargetEvidence } from "../access-widener/access-widener-evidence.js";
import { extractCrashLoaderDependency } from "../../external-mod/loader/external-mod-loader-dependency.js";
import { extractMixinMemberReferences } from "../mixin/mixin-member-signals.js";
import {
  MIXIN_VERIFIER_BOUNDARY_EVIDENCE,
  verifyMixinTarget
} from "../mixin/mixin-target-verifier.js";
import { collectSourceIndexMemberEvidence } from "../../source-bundle/shared/source-index-member-evidence.js";
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
} from "../../request/execution/request-handler.js";

const MAX_MIXIN_AVAILABLE_CLASSES = 4096;
const MIXIN_TARGET_ARCHIVE_IGNORED_PREFIXES = [
  ...CLASS_OWNER_IGNORED_PACKAGE_PREFIXES,
  "net.minecraft.",
  "com.mojang."
];

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

export async function lookupMixinTargetVerification(input: {
  workspaceRoot: string;
  archivePaths: string[];
  requestText?: string;
  cache?: ArchiveContentCache;
  databasePath?: string;
  runtimeRoot?: string;
  refresh?: boolean;
}): Promise<McpServerEvidenceExecutorResult | undefined> {
  const requestedMembers = extractMixinMemberReferences(input.requestText).filter(
    (member) => isMixinArchiveTarget(member.owner)
  );
  const requestedTargets = unique([
    ...extractMixinTargetReferences(input.requestText),
    ...requestedMembers.map((member) => member.owner)
  ]).filter(isMixinArchiveTarget);
  if (requestedTargets.length === 0 && requestedMembers.length === 0) {
    return undefined;
  }

  const available = await collectAvailableClassesForMixinTargets(input);
  const memberEvidence = await collectSourceIndexMemberEvidence({
    runtimeRoot: input.runtimeRoot,
    requestedMembers
  });
  const awTargetEvidence = await collectAccessWidenerTargetEvidence({
    ...input,
    targetEvidence: {
      availableMembers: memberEvidence.members
    }
  });
  const verifications = requestedTargets.map((requestedTarget) =>
    verifyMixinTarget({
      requestedTarget,
      availableClasses: available.classes,
      availableClassesTruncated: available.truncated,
      requestedMembers: requestedMembers.filter(
        (member) => normalizeClassName(member.owner) === normalizeClassName(requestedTarget)
      ),
      availableMembers: memberEvidence.members
    })
  );

  return {
    matched: true,
    summary: `Verified ${verifications.length} Mixin target class reference(s) and ${requestedMembers.length} member reference(s).`,
    payload: {
      source: "mod_archive_content",
      mode: "mixin_target_verification",
      tokenPolicy: "compact_mixin_target_verification",
      namespaceTranslation: false,
      semanticVerification: false,
      ...MIXIN_VERIFIER_BOUNDARY_EVIDENCE,
      descriptorProofLevel: "member_parameter_types_only",
      requestedTargets,
      requestedMembers,
      verifications,
      searchedArchives: available.searchedArchives,
      searchedSourceIndexes: memberEvidence.searchedDatabases,
      availableClassCount: available.availableClassCount,
      ...(awTargetEvidence.targetCount > 0 || awTargetEvidence.fileCount > 0
        ? { awTargetEvidence }
        : {}),
      cache: available.cache,
      truncated: available.truncated || memberEvidence.truncated || awTargetEvidence.truncated
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

function extractMixinTargetReferences(requestText: string | undefined): string[] {
  if (!requestText) {
    return [];
  }

  return unique([
    ...extractContextMixinTargets(requestText),
    ...extractRawMixinApplyTargets(requestText)
  ]).filter(isMixinArchiveTarget);
}

function isMixinArchiveTarget(className: string): boolean {
  return !MIXIN_TARGET_ARCHIVE_IGNORED_PREFIXES.some((prefix) =>
    className.startsWith(prefix)
  );
}

function extractContextMixinTargets(requestText: string): string[] {
  const matches = requestText.matchAll(
    /^Crash log mixin target class references:\s*(.+)$/gim
  );

  return [...matches].flatMap((match) =>
    (match[1] ?? "")
      .split(",")
      .map((value) => normalizeClassName(value))
      .filter((value): value is string => value !== undefined)
  );
}

function extractRawMixinApplyTargets(requestText: string): string[] {
  const matches = requestText.matchAll(
    /\bMixin apply failed\b.*?->\s+((?:[a-z_][\w$]*\.){2,}[A-Z_$][\w$]*(?:\$[A-Za-z_$][\w$]*)*)\b/gi
  );

  return [...matches]
    .map((match) => normalizeClassName(match[1] ?? ""))
    .filter((value): value is string => value !== undefined);
}

async function collectAvailableClassesForMixinTargets(input: {
  workspaceRoot: string;
  archivePaths: string[];
  cache?: ArchiveContentCache;
  databasePath?: string;
  refresh?: boolean;
}): Promise<{
  classes: string[];
  searchedArchives: number;
  availableClassCount: number;
  truncated: boolean;
  cache?: unknown;
}> {
  if (input.databasePath) {
    const result = await queryCachedModArchiveEntries({
      workspaceRoot: input.workspaceRoot,
      databasePath: input.databasePath,
      domains: ["class"],
      maxArchives: DEFAULT_MAX_ARCHIVES,
      limit: MAX_MIXIN_AVAILABLE_CLASSES,
      refresh: input.refresh
    });

    return {
      classes: result.entries.map((entry) => classNameFromPath(entry.relativePath)),
      searchedArchives: result.archiveCount,
      availableClassCount: result.entryCount,
      truncated: result.truncated,
      cache: { entryIndex: result.cache }
    };
  }

  const archives = input.archivePaths.slice(0, DEFAULT_MAX_ARCHIVES);
  const classes: string[] = [];
  let centralDirectoryHits = 0;
  let centralDirectoryMisses = 0;
  let truncated = input.archivePaths.length > DEFAULT_MAX_ARCHIVES;

  for (const sourceArchive of archives) {
    const remaining = MAX_MIXIN_AVAILABLE_CLASSES - classes.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const result = await listArchiveContent({
      sourceArchive,
      domains: ["class"],
      limit: remaining,
      cache: input.cache
    });
    classes.push(
      ...result.entries.map((entry) => classNameFromPath(entry.relativePath))
    );
    if (result.cache?.centralDirectoryHit === true) {
      centralDirectoryHits += 1;
    } else if (result.cache?.centralDirectoryHit === false) {
      centralDirectoryMisses += 1;
    }
    truncated = truncated || result.truncated;
  }

  return {
    classes,
    searchedArchives: archives.length,
    availableClassCount: classes.length,
    truncated,
    cache: {
      centralDirectoryHits,
      centralDirectoryMisses
    }
  };
}

function classNameFromPath(relativePath: string): string {
  return relativePath.replace(/\.class$/i, "").replaceAll("/", ".");
}

function normalizeClassName(value: string): string | undefined {
  const normalized = value.trim().replaceAll("/", ".").replace(/\.class$/i, "");
  if (!normalized.includes(".")) {
    return undefined;
  }

  const simpleName = normalized.split(".").at(-1) ?? "";
  return /^[A-Z_$]/.test(simpleName) ? normalized : undefined;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
