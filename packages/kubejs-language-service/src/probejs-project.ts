import { opendir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import type {
  DiscoverProbeJsLanguageProjectOptions,
  ProbeJsLanguageProject,
  ProbeJsLanguageProjectFile
} from "./types.js";

export async function discoverProbeJsLanguageProject(
  options: DiscoverProbeJsLanguageProjectOptions
): Promise<ProbeJsLanguageProject> {
  const workspaceRoot = resolve(options.workspaceRoot);
  const scopedRoots = await existingRoots(
    probeScopeCandidates(workspaceRoot, options.scope)
  );
  const roots =
    scopedRoots.length > 0
      ? scopedRoots
      : await existingRoots(legacyProbeCandidates(workspaceRoot));
  const allDeclarations = await collectFiles(workspaceRoot, roots, ".d.ts");
  const maxDeclarationFiles = normalizeBudget(options.maxDeclarationFiles);
  const declarationFiles = allDeclarations.slice(0, maxDeclarationFiles);
  const snippetFiles = await collectFiles(
    workspaceRoot,
    await existingRoots([join(workspaceRoot, ".vscode")]),
    ".code-snippets"
  );

  return {
    workspaceRoot,
    scope: options.scope,
    declarationFiles,
    snippetFiles,
    totalDeclarationBytes: declarationFiles.reduce(
      (sum, file) => sum + file.sizeBytes,
      0
    ),
    truncated: allDeclarations.length > declarationFiles.length
  };
}

function probeScopeCandidates(workspaceRoot: string, scope: string): string[] {
  if (scope === "shared") {
    return [join(workspaceRoot, ".probe", "shared")];
  }

  return [
    join(workspaceRoot, ".probe", scope),
    join(workspaceRoot, ".probe", "shared")
  ];
}

function legacyProbeCandidates(workspaceRoot: string): string[] {
  return [
    join(workspaceRoot, ".probe"),
    join(workspaceRoot, "kubejs", "probe", "generated")
  ];
}

async function existingRoots(candidates: string[]): Promise<string[]> {
  const roots: string[] = [];

  for (const candidate of candidates) {
    if (await isDirectory(candidate)) {
      roots.push(candidate);
    }
  }

  return roots;
}

async function collectFiles(
  workspaceRoot: string,
  roots: string[],
  extension: string
): Promise<ProbeJsLanguageProjectFile[]> {
  const files: ProbeJsLanguageProjectFile[] = [];

  for (const root of roots) {
    files.push(...(await walkFiles(workspaceRoot, root, extension)));
  }

  return files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
}

async function walkFiles(
  workspaceRoot: string,
  root: string,
  extension: string
): Promise<ProbeJsLanguageProjectFile[]> {
  const entries = await readSortedEntries(root);
  const files: ProbeJsLanguageProjectFile[] = [];

  for (const entry of entries) {
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(workspaceRoot, absolutePath, extension)));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(extension)) {
      continue;
    }

    const fileStat = await stat(absolutePath);
    files.push({
      absolutePath,
      relativePath: relative(workspaceRoot, absolutePath).replaceAll("\\", "/"),
      sizeBytes: fileStat.size,
      mtimeMs: fileStat.mtimeMs
    });
  }

  return files;
}

async function readSortedEntries(path: string) {
  const directory = await opendir(path);
  const entries = [];

  for await (const entry of directory) {
    entries.push(entry);
  }

  return entries.sort((left, right) => left.name.localeCompare(right.name));
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
  return value === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.floor(value));
}
