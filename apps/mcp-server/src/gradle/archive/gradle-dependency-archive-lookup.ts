import {
  discoverDeclaredDependencyBinaryArchives,
  type GradleSourceArchiveCandidate
} from "@mcpskill/gradle-adapter";
import {
  extractJavaClassReferences,
  findArchiveSetClassOwners,
  type ArchiveClassOwnerMatch
} from "@mcpskill/jar-source-adapter";

import type { GradleSourceArchiveDiscoveryOptions } from "./gradle-source-archive-lookup.js";

export interface GradleDependencyArchiveLookupResult {
  status: "ready";
  requestedClasses: string[];
  searchedArchives: number;
  matches: ArchiveClassOwnerMatch[];
  archiveCount: number;
}

const IGNORED_CLASS_PREFIXES = ["java.", "javax.", "jdk.", "sun.", "net.minecraft."];

export async function resolveGradleDependencyArchiveLookup(input: {
  workspaceRoot: string;
  requestText?: string;
  discovery?: GradleSourceArchiveDiscoveryOptions;
}): Promise<GradleDependencyArchiveLookupResult | undefined> {
  if (input.discovery?.enabled === false) {
    return undefined;
  }

  const requestedClasses = extractJavaClassReferences(input.requestText, {
    ignoredPackagePrefixes: IGNORED_CLASS_PREFIXES,
    limit: 8
  });

  if (requestedClasses.length === 0) {
    return undefined;
  }

  const archives = await discoverDeclaredDependencyBinaryArchives({
    workspaceRoot: input.workspaceRoot,
    gradleUserHome: input.discovery?.gradleUserHome,
    includeDefaultGradleUserHome:
      input.discovery?.includeDefaultGradleUserHome
  });

  return findClassOwners({
    archives,
    requestedClasses
  });
}

async function findClassOwners(input: {
  archives: GradleSourceArchiveCandidate[];
  requestedClasses: string[];
}): Promise<GradleDependencyArchiveLookupResult | undefined> {
  if (input.archives.length === 0) {
    return undefined;
  }

  const result = await findArchiveSetClassOwners({
    sourceArchives: input.archives.map((archive) => archive.archivePath),
    classNames: input.requestedClasses,
    maxMatches: 12
  });

  if (result.matches.length === 0) {
    return undefined;
  }

  return {
    status: "ready",
    requestedClasses: input.requestedClasses,
    searchedArchives: result.searchedArchives,
    matches: result.matches,
    archiveCount: input.archives.length
  };
}
