import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

const FTB_QUESTS_ROOTS = [
  join("config", "ftbquests", "quests"),
  join("config", "ftbquests")
];
const SUPPORTED_FORMATS = new Set([".snbt"]);
const MAX_FILES = 128;
const MAX_LISTED_PATHS = 24;

const FTB_QUESTS_SCHEMA_PROFILE = {
  sourceEvidence: "ftb_quests_source",
  storageRoot: "config/ftbquests/quests",
  primaryFormat: "snbt",
  canonicalFiles: ["data.snbt", "chapter_groups.snbt"],
  canonicalDirectories: ["chapters", "reward_tables", "lang"],
  embeddedChapterCollections: [
    "quests",
    "tasks",
    "rewards",
    "quest_links",
    "images"
  ],
  extensionPolicy: "preserve_unknown_snbt_categories"
} as const;

type FtbQuestsCategory =
  | "addon_or_unknown"
  | "chapter"
  | "chapter_groups"
  | "file_settings"
  | "reward_table"
  | "translation"
  | string;

interface LocalSchemaExtension {
  id: string;
  category: string;
  paths: string[];
}

interface FtbQuestsLocalSettings {
  schemaExtensions: LocalSchemaExtension[];
}

export interface FtbQuestsSummary {
  source: "ftb_quests_files";
  tokenPolicy: "counts_first";
  rootCount: number;
  fileCount: number;
  chapterFileCount: number;
  rewardTableFileCount: number;
  byFormat: Record<string, number>;
  byCategory: Partial<Record<FtbQuestsCategory, number>>;
  schemaProfile: typeof FTB_QUESTS_SCHEMA_PROFILE & {
    localExtensions?: LocalSchemaExtension[];
  };
  localSettings?: {
    source: "workspace_local_settings";
    applied: boolean;
    path: ".mcpskill/settings.json";
    schemaExtensionCount: number;
  };
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

  const localSettings = await readFtbQuestsLocalSettings(workspaceRoot);
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
    byCategory: countCategories(uniquePaths, localSettings.schemaExtensions),
    schemaProfile: {
      ...FTB_QUESTS_SCHEMA_PROFILE,
      ...(localSettings.schemaExtensions.length > 0
        ? { localExtensions: localSettings.schemaExtensions }
        : {})
    },
    ...(localSettings.schemaExtensions.length > 0
      ? {
          localSettings: {
            source: "workspace_local_settings",
            applied: true,
            path: ".mcpskill/settings.json",
            schemaExtensionCount: localSettings.schemaExtensions.length
          }
        }
      : {}),
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

function countCategories(
  paths: string[],
  extensions: LocalSchemaExtension[]
): Partial<Record<FtbQuestsCategory, number>> {
  const counts: Partial<Record<FtbQuestsCategory, number>> = {};

  for (const path of paths) {
    const category = classifyQuestPath(path, extensions);

    counts[category] = (counts[category] ?? 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  ) as Partial<Record<FtbQuestsCategory, number>>;
}

function classifyQuestPath(
  path: string,
  extensions: LocalSchemaExtension[]
): FtbQuestsCategory {
  const rootRelativePath = path.split("config/ftbquests/quests/").at(1) ?? path;
  const segments = rootRelativePath.split("/");
  const localMatch = extensions.find((extension) =>
    extension.paths.some((prefix) => pathStartsWith(rootRelativePath, prefix))
  );

  if (localMatch) {
    return localMatch.category;
  }

  if (rootRelativePath === "data.snbt") {
    return "file_settings";
  }
  if (rootRelativePath === "chapter_groups.snbt") {
    return "chapter_groups";
  }
  if (segments[0] === "chapters") {
    return "chapter";
  }
  if (segments[0] === "reward_tables") {
    return "reward_table";
  }
  if (segments[0] === "lang") {
    return "translation";
  }

  return "addon_or_unknown";
}

async function readFtbQuestsLocalSettings(
  workspaceRoot: string
): Promise<FtbQuestsLocalSettings> {
  try {
    const raw = await readFile(join(workspaceRoot, ".mcpskill", "settings.json"), "utf-8");
    const parsed = JSON.parse(raw) as {
      ftbQuests?: { schemaExtensions?: unknown };
    };

    return {
      schemaExtensions: parseLocalSchemaExtensions(
        parsed.ftbQuests?.schemaExtensions
      )
    };
  } catch {
    return { schemaExtensions: [] };
  }
}

function parseLocalSchemaExtensions(value: unknown): LocalSchemaExtension[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const id = typeof entry.id === "string" ? entry.id : "";
    const category = typeof entry.category === "string" ? entry.category : "";
    const paths = Array.isArray(entry.paths)
      ? entry.paths.filter((path): path is string => typeof path === "string")
      : [];

    if (!safeIdentifier(id) || !safeIdentifier(category) || paths.length === 0) {
      return [];
    }

    return [{ id, category, paths: paths.map(normalizeLocalPathPrefix) }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeIdentifier(value: string): boolean {
  return /^[a-z0-9_.-]+$/i.test(value);
}

function normalizeLocalPathPrefix(path: string): string {
  return path.split(sep).join("/").replace(/^\/+|\/+$/g, "");
}

function pathStartsWith(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}
