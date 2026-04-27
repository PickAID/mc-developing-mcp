import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, normalize, resolve } from "node:path";

import {
  readGradleDeclaredDependencies,
  type GradleDeclaredDependency
} from "./build-dependencies.js";
import type { GradleSourceArchiveCandidate } from "./source-archives.js";

export interface DiscoverDeclaredDependencySourceArchivesInput {
  workspaceRoot: string;
  gradleUserHome?: string;
  includeDefaultGradleUserHome?: boolean;
  maxResults?: number;
  dependencies?: GradleDeclaredDependency[];
}

const DEFAULT_MAX_RESULTS = 32;

export async function discoverDeclaredDependencySourceArchives(
  input: DiscoverDeclaredDependencySourceArchivesInput
): Promise<GradleSourceArchiveCandidate[]> {
  const dependencies =
    input.dependencies ??
    (await readGradleDeclaredDependencies({ workspaceRoot: input.workspaceRoot }));
  const roots = buildGradleModuleCacheRoots(input);
  const maxResults = Math.max(0, Math.floor(input.maxResults ?? DEFAULT_MAX_RESULTS));
  const candidates: GradleSourceArchiveCandidate[] = [];

  for (const dependency of dependencies) {
    if (!dependency.version) {
      continue;
    }

    for (const root of roots) {
      if (candidates.length >= maxResults) {
        return dedupeCandidates(candidates);
      }

      candidates.push(
        ...(await findDependencySourcesInRoot(root, dependency)).map((archivePath) => ({
          archivePath,
          source: "gradle-cache" as const,
          confidence: "high" as const,
          reason: `declared Gradle dependency ${dependency.notation} in ${dependency.sourceFile}`
        }))
      );
    }
  }

  return dedupeCandidates(candidates).slice(0, maxResults);
}

async function findDependencySourcesInRoot(
  root: string,
  dependency: GradleDeclaredDependency
): Promise<string[]> {
  const versionRoot = join(
    root,
    dependency.group,
    dependency.artifact,
    dependency.version ?? ""
  );
  let hashEntries;

  try {
    hashEntries = await readdir(versionRoot, { withFileTypes: true });
  } catch (error) {
    if (isSkippablePathError(error)) {
      return [];
    }
    throw error;
  }

  const archives: string[] = [];
  for (const hashEntry of hashEntries) {
    if (!hashEntry.isDirectory()) {
      continue;
    }

    const hashRoot = join(versionRoot, hashEntry.name);
    let files;

    try {
      files = await readdir(hashRoot, { withFileTypes: true });
    } catch (error) {
      if (isSkippablePathError(error)) {
        continue;
      }
      throw error;
    }

    for (const file of files) {
      if (file.isFile() && isDependencySourcesFile(file.name, dependency)) {
        archives.push(join(hashRoot, file.name));
      }
    }
  }

  return archives.sort();
}

function isDependencySourcesFile(
  fileName: string,
  dependency: GradleDeclaredDependency
): boolean {
  const escapedArtifact = escapeRegExp(dependency.artifact);
  const escapedVersion = dependency.version ? escapeRegExp(dependency.version) : ".+";

  return new RegExp(
    `^${escapedArtifact}-${escapedVersion}(?:-[A-Za-z0-9_.-]+)?-sources\\.(?:jar|zip)$`,
    "i"
  ).test(fileName);
}

function buildGradleModuleCacheRoots(
  input: DiscoverDeclaredDependencySourceArchivesInput
): string[] {
  const workspaceRoot = normalize(resolve(input.workspaceRoot));
  const roots = [
    join(workspaceRoot, ".gradle", "caches", "modules-2", "files-2.1")
  ];

  if (input.gradleUserHome) {
    roots.push(join(input.gradleUserHome, "caches", "modules-2", "files-2.1"));
  }
  if (input.includeDefaultGradleUserHome !== false) {
    roots.push(join(homedir(), ".gradle", "caches", "modules-2", "files-2.1"));
  }

  return [...new Set(roots.map((root) => normalize(root)))];
}

function dedupeCandidates(
  candidates: GradleSourceArchiveCandidate[]
): GradleSourceArchiveCandidate[] {
  const seen = new Set<string>();
  const result: GradleSourceArchiveCandidate[] = [];

  for (const candidate of candidates) {
    const key = normalize(candidate.archivePath);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({ ...candidate, archivePath: key });
  }

  return result;
}

function isSkippablePathError(error: unknown): boolean {
  const code =
    error instanceof Error && "code" in error
      ? (error as NodeJS.ErrnoException).code
      : undefined;

  return code === "ENOENT" || code === "ENOTDIR" || code === "EACCES" || code === "EPERM";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
