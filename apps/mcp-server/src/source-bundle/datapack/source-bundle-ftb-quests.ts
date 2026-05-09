import { readdir, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

const FTB_QUESTS_ROOTS = [
  join("config", "ftbquests", "quests"),
  join("config", "ftbquests")
];
const SUPPORTED_FORMATS = new Set([".json", ".nbt", ".snbt"]);
const MAX_FILES = 128;
const MAX_LISTED_PATHS = 24;

export interface FtbQuestsSummary {
  source: "ftb_quests_files";
  tokenPolicy: "counts_first";
  rootCount: number;
  fileCount: number;
  chapterFileCount: number;
  rewardTableFileCount: number;
  byFormat: Record<string, number>;
  topPaths: string[];
  truncated: boolean;
}

export async function summarizeFtbQuestsFiles(
  workspaceRoot: string
): Promise<FtbQuestsSummary | undefined> {
  const roots = await existingFtbQuestRoots(workspaceRoot);

  if (roots.length === 0) {
    return undefined;
  }

  const paths: string[] = [];

  for (const root of roots) {
    await collectQuestPaths(root, workspaceRoot, paths);
  }

  const uniquePaths = [...new Set(paths)].sort();

  if (uniquePaths.length === 0) {
    return undefined;
  }

  return {
    source: "ftb_quests_files",
    tokenPolicy: "counts_first",
    rootCount: roots.length,
    fileCount: uniquePaths.length,
    chapterFileCount: countPathSegment(uniquePaths, "chapters"),
    rewardTableFileCount: countPathSegment(uniquePaths, "reward_tables"),
    byFormat: countFormats(uniquePaths),
    topPaths: uniquePaths.slice(0, MAX_LISTED_PATHS),
    truncated: uniquePaths.length > MAX_LISTED_PATHS || paths.length >= MAX_FILES
  };
}

async function existingFtbQuestRoots(workspaceRoot: string): Promise<string[]> {
  const roots: string[] = [];

  for (const relativeRoot of FTB_QUESTS_ROOTS) {
    const absoluteRoot = join(workspaceRoot, relativeRoot);

    if (await isDirectory(absoluteRoot)) {
      roots.push(absoluteRoot);
      break;
    }
  }

  return roots;
}

async function collectQuestPaths(
  root: string,
  workspaceRoot: string,
  paths: string[]
): Promise<void> {
  if (paths.length >= MAX_FILES) {
    return;
  }

  const entries = await readdir(root, { withFileTypes: true });

  const sortedEntries = entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  );

  for (const entry of sortedEntries) {
    if (paths.length >= MAX_FILES) {
      return;
    }

    const absolutePath = join(root, entry.name);

    if (entry.isDirectory()) {
      await collectQuestPaths(absolutePath, workspaceRoot, paths);
      continue;
    }

    if (entry.isFile() && SUPPORTED_FORMATS.has(extname(entry.name).toLowerCase())) {
      paths.push(toPosixPath(relative(workspaceRoot, absolutePath)));
    }
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function countPathSegment(paths: string[], segment: string): number {
  return paths.filter((path) => path.split("/").includes(segment)).length;
}

function countFormats(paths: string[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const path of paths) {
    const format = extname(path).slice(1).toLowerCase();

    counts[format] = (counts[format] ?? 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  );
}

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}
