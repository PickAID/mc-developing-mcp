import { opendir, stat } from "node:fs/promises";
import { join } from "node:path";

import { classifyKubeJsTypeResource } from "./classify.js";
import { normalizeWorkspaceRoot, toPosixRelative } from "./paths.js";
import type {
  DiscoverKubeJsTypeResourcesOptions,
  KubeJsTypeDiscoveryResult,
  KubeJsTypeResourceFile,
  KubeJsTypeRoot,
  KubeJsTypeRootKind,
  KubeJsTypeSourceKind
} from "./types.js";

const PROBE_ROOT_CANDIDATES: Array<{
  relativePath: string;
  rootKind: KubeJsTypeRootKind;
}> = [
  { relativePath: ".vscode", rootKind: "workspace-local" },
  { relativePath: ".probejs", rootKind: "workspace-local" },
  { relativePath: "probejs", rootKind: "workspace-local" },
  { relativePath: ".probe", rootKind: "workspace-local" },
  { relativePath: "probe", rootKind: "workspace-local" },
  { relativePath: "kubejs/probejs", rootKind: "kubejs-nested" },
  { relativePath: "kubejs/.probejs", rootKind: "kubejs-nested" },
  { relativePath: "kubejs/probe", rootKind: "kubejs-nested" },
  { relativePath: "kubejs/.probe", rootKind: "kubejs-nested" }
];

export async function discoverKubeJsTypeResources(
  options: DiscoverKubeJsTypeResourcesOptions
): Promise<KubeJsTypeDiscoveryResult> {
  const workspaceRoot = normalizeWorkspaceRoot(options.workspaceRoot);
  const maxFiles = normalizeBudget(options.maxFiles);
  const roots = await discoverRoots(workspaceRoot);
  const files: KubeJsTypeResourceFile[] = [];
  let skippedFiles = 0;

  for (const root of roots) {
    for await (const file of walkRoot(workspaceRoot, root)) {
      if (files.length >= maxFiles) {
        skippedFiles += 1;
        continue;
      }
      files.push(file);
    }
  }

  return {
    workspaceRoot,
    roots,
    files,
    summary: buildSummary(roots.length, files, skippedFiles)
  };
}

async function discoverRoots(workspaceRoot: string): Promise<KubeJsTypeRoot[]> {
  const roots: KubeJsTypeRoot[] = [];

  for (const candidate of PROBE_ROOT_CANDIDATES) {
    const absolutePath = join(workspaceRoot, candidate.relativePath);
    if (await isDirectory(absolutePath)) {
      roots.push({
        absolutePath,
        relativePath: candidate.relativePath,
        rootKind: candidate.rootKind
      });
    }
  }

  return roots;
}

async function* walkRoot(
  workspaceRoot: string,
  root: KubeJsTypeRoot,
  currentPath = root.absolutePath
): AsyncGenerator<KubeJsTypeResourceFile> {
  const entries = await readSortedEntries(currentPath);

  for (const entry of entries) {
    const absolutePath = join(currentPath, entry.name);
    if (entry.isDirectory()) {
      yield* walkRoot(workspaceRoot, root, absolutePath);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const fileStat = await stat(absolutePath);
    const relativePath = toPosixRelative(workspaceRoot, absolutePath);

    yield {
      absolutePath,
      relativePath,
      sourceKind: classifyKubeJsTypeResource(relativePath),
      sizeBytes: fileStat.size,
      rootKind: root.rootKind
    };
  }
}

async function readSortedEntries(path: string) {
  const directory = await opendir(path);
  const entries = [];

  for await (const entry of directory) {
    entries.push(entry);
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function normalizeBudget(value: number | undefined): number {
  if (value === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Math.floor(value));
}

function buildSummary(
  rootCount: number,
  files: KubeJsTypeResourceFile[],
  skippedFiles: number
) {
  const bySourceKind: Record<KubeJsTypeSourceKind, number> = {
    dts: 0,
    item: 0,
    other: 0,
    registry: 0,
    snippet: 0
  };

  for (const file of files) {
    bySourceKind[file.sourceKind] += 1;
  }

  return {
    rootCount,
    fileCount: files.length,
    bySourceKind,
    truncated: skippedFiles > 0,
    skippedFiles
  };
}
