import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, normalize, resolve } from "node:path";

export interface GradleSourceArchiveCandidate {
  archivePath: string;
  source: "workspace" | "gradle-cache";
  confidence: "high" | "medium";
  reason: string;
}

export interface DiscoverGradleSourceArchivesInput {
  workspaceRoot: string;
  gradleUserHome?: string;
  includeDefaultGradleUserHome?: boolean;
  maxVisitedEntries?: number;
  maxResults?: number;
}

export interface DiscoverMinecraftSourceArchivesInput
  extends DiscoverGradleSourceArchivesInput {
  minecraftVersion: string;
}

const DEFAULT_MAX_VISITED_ENTRIES = 8_000;
const DEFAULT_MAX_RESULTS = 64;

export async function discoverGradleSourceArchives(
  input: DiscoverGradleSourceArchivesInput
): Promise<GradleSourceArchiveCandidate[]> {
  const roots = buildSearchRoots(input);
  const maxVisitedEntries =
    input.maxVisitedEntries ?? DEFAULT_MAX_VISITED_ENTRIES;
  const maxResults = input.maxResults ?? DEFAULT_MAX_RESULTS;
  const candidates: GradleSourceArchiveCandidate[] = [];
  let remainingBudget = maxVisitedEntries;

  for (const root of roots) {
    if (remainingBudget <= 0 || candidates.length >= maxResults) {
      break;
    }

    const result = await scanRoot(root, {
      maxVisitedEntries: remainingBudget,
      maxResults: maxResults - candidates.length
    });

    remainingBudget -= result.visitedEntries;
    candidates.push(...result.candidates);
  }

  return dedupeCandidates(candidates).slice(0, maxResults);
}

export async function discoverMinecraftSourceArchives(
  input: DiscoverMinecraftSourceArchivesInput
): Promise<GradleSourceArchiveCandidate[]> {
  const version = input.minecraftVersion.toLowerCase();
  const candidates = await discoverGradleSourceArchives(input);

  return candidates
    .filter((candidate) => isMinecraftSourceArchive(candidate.archivePath, version))
    .sort(compareCandidates);
}

interface SearchRoot {
  path: string;
  source: GradleSourceArchiveCandidate["source"];
  reason: string;
}

interface ScanRootResult {
  candidates: GradleSourceArchiveCandidate[];
  visitedEntries: number;
}

function buildSearchRoots(input: DiscoverGradleSourceArchivesInput): SearchRoot[] {
  const workspaceRoot = normalize(resolve(input.workspaceRoot));
  const roots: SearchRoot[] = [
    {
      path: join(workspaceRoot, "libs"),
      source: "workspace",
      reason: "workspace libs directory"
    },
    {
      path: join(workspaceRoot, "build", "libs"),
      source: "workspace",
      reason: "workspace build libs directory"
    },
    {
      path: join(workspaceRoot, ".gradle", "caches", "modules-2", "files-2.1"),
      source: "gradle-cache",
      reason: "workspace-local Gradle module cache"
    }
  ];

  if (input.gradleUserHome) {
    roots.push({
      path: join(input.gradleUserHome, "caches", "modules-2", "files-2.1"),
      source: "gradle-cache",
      reason: "configured Gradle user home module cache"
    });
  }

  if (input.includeDefaultGradleUserHome !== false) {
    roots.push({
      path: join(homedir(), ".gradle", "caches", "modules-2", "files-2.1"),
      source: "gradle-cache",
      reason: "default Gradle user home module cache"
    });
  }

  return dedupeRoots(roots);
}

async function scanRoot(
  root: SearchRoot,
  limits: { maxVisitedEntries: number; maxResults: number }
): Promise<ScanRootResult> {
  const queue = [root.path];
  const candidates: GradleSourceArchiveCandidate[] = [];
  let visitedEntries = 0;

  while (
    queue.length > 0 &&
    visitedEntries < limits.maxVisitedEntries &&
    candidates.length < limits.maxResults
  ) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    let entries;

    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (isSkippablePathError(error)) {
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      if (
        visitedEntries >= limits.maxVisitedEntries ||
        candidates.length >= limits.maxResults
      ) {
        break;
      }

      visitedEntries += 1;
      const entryPath = join(current, entry.name);

      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name)) {
          queue.push(entryPath);
        }
        continue;
      }

      if (!entry.isFile() || !isSourcesArchiveName(entry.name)) {
        continue;
      }

      candidates.push({
        archivePath: entryPath,
        source: root.source,
        confidence: root.source === "gradle-cache" ? "high" : "medium",
        reason: root.reason
      });
    }
  }

  return { candidates, visitedEntries };
}

function isSourcesArchiveName(name: string): boolean {
  return /(?:^|[-_.])sources\.(?:jar|zip)$/i.test(name);
}

function isMinecraftSourceArchive(archivePath: string, version: string): boolean {
  const path = archivePath.toLowerCase().replaceAll("\\", "/");
  const name = basename(path);

  return (
    path.includes(version) &&
    (name.includes("minecraft") ||
      name.includes("client") ||
      name.includes("server") ||
      name.includes("merged") ||
      path.includes("/net/minecraft/") ||
      path.includes("/com/mojang/"))
  );
}

function compareCandidates(
  left: GradleSourceArchiveCandidate,
  right: GradleSourceArchiveCandidate
): number {
  const confidence = confidenceScore(right) - confidenceScore(left);

  if (confidence !== 0) {
    return confidence;
  }

  return left.archivePath.localeCompare(right.archivePath);
}

function confidenceScore(candidate: GradleSourceArchiveCandidate): number {
  return candidate.confidence === "high" ? 2 : 1;
}

function shouldSkipDirectory(name: string): boolean {
  return name === ".git" || name === "node_modules";
}

function dedupeRoots(roots: SearchRoot[]): SearchRoot[] {
  const seen = new Set<string>();
  const result: SearchRoot[] = [];

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

  for (const candidate of candidates.sort(compareCandidates)) {
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

  return (
    code === "ENOENT" ||
    code === "ENOTDIR" ||
    code === "EACCES" ||
    code === "EPERM" ||
    code === "ELOOP"
  );
}
