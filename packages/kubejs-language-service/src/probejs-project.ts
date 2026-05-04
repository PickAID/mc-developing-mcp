import { opendir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import type {
  DiscoverProbeJsLanguageProjectOptions,
  KubeJsScriptScope,
  ProbeJsLanguageProject,
  ProbeJsLanguageProjectFile
} from "./types.js";

const PROBE_BASE_CANDIDATES = [
  ".probe",
  ".probejs",
  "probe",
  "probejs",
  "kubejs/probe",
  "kubejs/.probe",
  "kubejs/probejs",
  "kubejs/.probejs"
];

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
  const allDeclarations = await collectFiles(
    workspaceRoot,
    roots,
    isDeclarationFile
  );
  const maxDeclarationFiles = normalizeBudget(options.maxDeclarationFiles);
  const declarationFiles = allDeclarations.slice(0, maxDeclarationFiles);
  const snippetFiles = await collectFiles(
    workspaceRoot,
    await existingRoots(snippetCandidates(workspaceRoot)),
    isProbeSnippetFile
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

function probeScopeCandidates(
  workspaceRoot: string,
  scope: KubeJsScriptScope
): string[] {
  const bases = probeBaseCandidates(workspaceRoot);
  if (scope === "shared") {
    return bases.map((base) => join(base, "shared"));
  }

  return bases.flatMap((base) => [join(base, scope), join(base, "shared")]);
}

function legacyProbeCandidates(workspaceRoot: string): string[] {
  return probeBaseCandidates(workspaceRoot).flatMap((base) => [
    base,
    join(base, "generated")
  ]);
}

function snippetCandidates(workspaceRoot: string): string[] {
  return [
    join(workspaceRoot, ".vscode"),
    ...probeBaseCandidates(workspaceRoot).map((base) => join(base, "snippets"))
  ];
}

function probeBaseCandidates(workspaceRoot: string): string[] {
  return PROBE_BASE_CANDIDATES.map((candidate) => join(workspaceRoot, candidate));
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
  matchesFile: (fileName: string) => boolean
): Promise<ProbeJsLanguageProjectFile[]> {
  const files: ProbeJsLanguageProjectFile[] = [];

  for (const root of roots) {
    files.push(...(await walkFiles(workspaceRoot, root, matchesFile)));
  }

  return [
    ...new Map(files.map((file) => [file.absolutePath, file])).values()
  ].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function walkFiles(
  workspaceRoot: string,
  root: string,
  matchesFile: (fileName: string) => boolean
): Promise<ProbeJsLanguageProjectFile[]> {
  const entries = await readSortedEntries(root);
  const files: ProbeJsLanguageProjectFile[] = [];

  for (const entry of entries) {
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(workspaceRoot, absolutePath, matchesFile)));
      continue;
    }
    if (!entry.isFile() || !matchesFile(entry.name)) {
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

function isDeclarationFile(fileName: string): boolean {
  return fileName.endsWith(".d.ts");
}

function isProbeSnippetFile(fileName: string): boolean {
  return fileName.endsWith(".code-snippets") || fileName.endsWith(".txt");
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
