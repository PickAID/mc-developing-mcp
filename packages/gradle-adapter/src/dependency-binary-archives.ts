import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, normalize, resolve } from "node:path";

import {
  readGradleDeclaredDependencies,
  type GradleDeclaredDependency
} from "./build-dependencies.js";
import type { GradleSourceArchiveCandidate } from "./source-archives.js";

export interface DiscoverDeclaredDependencyBinaryArchivesInput {
  workspaceRoot: string;
  gradleUserHome?: string;
  includeDefaultGradleUserHome?: boolean;
  maxResults?: number;
  dependencies?: GradleDeclaredDependency[];
}

const DEFAULT_MAX_RESULTS = 32;
type BinaryArchiveRoot =
  | {
      kind: "flat";
      path: string;
      source: "workspace";
      reason: string;
    }
  | {
      kind: "gradle-cache";
      path: string;
      source: "gradle-cache";
    };

interface BinaryArchiveMatch {
  archivePath: string;
  source: BinaryArchiveRoot["source"];
  reason: string;
}

export async function discoverDeclaredDependencyBinaryArchives(
  input: DiscoverDeclaredDependencyBinaryArchivesInput
): Promise<GradleSourceArchiveCandidate[]> {
  const dependencies =
    input.dependencies ??
    (await readGradleDeclaredDependencies({ workspaceRoot: input.workspaceRoot }));
  const roots = buildBinaryArchiveRoots(input);
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
        ...(await findDependencyBinariesInRoot(root, dependency)).map((match) => ({
          archivePath: match.archivePath,
          source: match.source,
          confidence: "high" as const,
          reason: formatArchiveReason(dependency, match.reason)
        }))
      );
    }
  }

  return dedupeCandidates(candidates).slice(0, maxResults);
}

async function findDependencyBinariesInRoot(
  root: BinaryArchiveRoot,
  dependency: GradleDeclaredDependency
): Promise<BinaryArchiveMatch[]> {
  if (root.kind === "flat") {
    return findDependencyBinariesInFlatRoot(root, dependency);
  }

  return (await findDependencyBinariesInGradleCacheRoot(root.path, dependency)).map(
    (archivePath) => ({
      archivePath,
      source: root.source,
      reason: ""
    })
  );
}

function formatArchiveReason(
  dependency: GradleDeclaredDependency,
  suffix: string
): string {
  const base = `declared Gradle dependency ${dependency.notation} in ${dependency.sourceFile}`;

  return suffix ? `${base}; ${suffix}` : base;
}

async function findDependencyBinariesInFlatRoot(
  root: Extract<BinaryArchiveRoot, { kind: "flat" }>,
  dependency: GradleDeclaredDependency
): Promise<BinaryArchiveMatch[]> {
  let files;

  try {
    files = await readdir(root.path, { withFileTypes: true });
  } catch (error) {
    if (isSkippablePathError(error)) {
      return [];
    }
    throw error;
  }

  return files
    .filter(
      (file) => file.isFile() && isDeclaredDependencyBinaryFile(file.name, dependency)
    )
    .map((file) => ({
      archivePath: join(root.path, file.name),
      source: root.source,
      reason: root.reason
    }))
    .sort((left, right) => left.archivePath.localeCompare(right.archivePath));
}

async function findDependencyBinariesInGradleCacheRoot(
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
      if (file.isFile() && isDeclaredDependencyBinaryFile(file.name, dependency)) {
        archives.push(join(hashRoot, file.name));
      }
    }
  }

  return archives.sort();
}

export function isDeclaredDependencyBinaryFile(
  fileName: string,
  dependency: GradleDeclaredDependency
): boolean {
  const baseName = `${dependency.artifact}-${dependency.version}`;

  if (fileName === `${baseName}.jar`) {
    return true;
  }

  if (!fileName.startsWith(`${baseName}-`) || !fileName.endsWith(".jar")) {
    return false;
  }

  const classifier = fileName.slice(baseName.length + 1, -".jar".length);

  return isRuntimeClassifier(classifier);
}

function isRuntimeClassifier(classifier: string): boolean {
  const nonRuntimeParts = new Set([
    "sources",
    "source",
    "javadoc",
    "docs",
    "doc",
    "kdoc"
  ]);
  const parts = classifier.toLowerCase().split(/[-_.]+/).filter(Boolean);

  return parts.length > 0 && parts.every((part) => !nonRuntimeParts.has(part));
}

function buildBinaryArchiveRoots(
  input: DiscoverDeclaredDependencyBinaryArchivesInput
): BinaryArchiveRoot[] {
  const workspaceRoot = normalize(resolve(input.workspaceRoot));
  const roots: BinaryArchiveRoot[] = [
    {
      kind: "flat",
      path: join(workspaceRoot, "libs"),
      source: "workspace",
      reason: "workspace libs directory"
    },
    {
      kind: "flat",
      path: join(workspaceRoot, "build", "libs"),
      source: "workspace",
      reason: "workspace build libs directory"
    },
    {
      kind: "gradle-cache",
      path: join(workspaceRoot, ".gradle", "caches", "modules-2", "files-2.1"),
      source: "gradle-cache"
    }
  ];

  if (input.gradleUserHome) {
    roots.push({
      kind: "gradle-cache",
      path: join(input.gradleUserHome, "caches", "modules-2", "files-2.1"),
      source: "gradle-cache"
    });
  }
  if (input.includeDefaultGradleUserHome !== false) {
    roots.push({
      kind: "gradle-cache",
      path: join(homedir(), ".gradle", "caches", "modules-2", "files-2.1"),
      source: "gradle-cache"
    });
  }

  return dedupeRoots(roots);
}

function dedupeRoots(roots: BinaryArchiveRoot[]): BinaryArchiveRoot[] {
  const seen = new Set<string>();
  const result: BinaryArchiveRoot[] = [];

  for (const root of roots) {
    const key = normalize(root.path);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({ ...root, path: key });
  }

  return result;
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
