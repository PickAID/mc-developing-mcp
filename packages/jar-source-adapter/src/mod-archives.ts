import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export type ModArchiveSource =
  | "mods-directory"
  | "run-mods-directory"
  | "workspace-libs";

export interface ModArchiveCandidate {
  archivePath: string;
  relativePath: string;
  source: ModArchiveSource;
}

export interface DiscoverModArchivesResult {
  archives: ModArchiveCandidate[];
  truncated: boolean;
}

export async function discoverModArchives(input: {
  workspaceRoot: string;
  maxArchives?: number;
}): Promise<DiscoverModArchivesResult> {
  const workspaceRoot = resolve(input.workspaceRoot);
  const maxArchives = normalizeLimit(input.maxArchives);
  const candidates: ModArchiveCandidate[] = [];

  for (const root of buildModArchiveRoots(workspaceRoot)) {
    for (const archivePath of await listJarFiles(root.absolutePath)) {
      candidates.push({
        archivePath,
        relativePath: relative(workspaceRoot, archivePath).replaceAll("\\", "/"),
        source: root.source
      });
    }
  }

  const archives = dedupeArchives(candidates).sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );

  return {
    archives: archives.slice(0, maxArchives),
    truncated: archives.length > maxArchives
  };
}

function buildModArchiveRoots(workspaceRoot: string): Array<{
  absolutePath: string;
  source: ModArchiveSource;
}> {
  return [
    {
      absolutePath: join(workspaceRoot, "mods"),
      source: "mods-directory" satisfies ModArchiveSource
    },
    {
      absolutePath: join(workspaceRoot, "run", "mods"),
      source: "run-mods-directory" satisfies ModArchiveSource
    },
    {
      absolutePath: join(workspaceRoot, "run", "client", "mods"),
      source: "run-mods-directory" satisfies ModArchiveSource
    },
    {
      absolutePath: join(workspaceRoot, "libs"),
      source: "workspace-libs" satisfies ModArchiveSource
    },
    {
      absolutePath: join(workspaceRoot, "build", "libs"),
      source: "workspace-libs" satisfies ModArchiveSource
    }
  ];
}

async function listJarFiles(root: string): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isSkippablePathError(error)) {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && isRuntimeJarName(entry.name))
    .map((entry) => join(root, entry.name));
}

function isRuntimeJarName(name: string): boolean {
  return (
    name.endsWith(".jar") &&
    !/(?:^|[-_.])(sources|javadoc)\.jar$/i.test(name)
  );
}

function dedupeArchives(archives: ModArchiveCandidate[]): ModArchiveCandidate[] {
  const seen = new Set<string>();
  const deduped: ModArchiveCandidate[] = [];

  for (const archive of archives) {
    if (seen.has(archive.archivePath)) {
      continue;
    }
    seen.add(archive.archivePath);
    deduped.push(archive);
  }

  return deduped;
}

function isSkippablePathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Math.floor(limit));
}
