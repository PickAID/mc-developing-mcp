import { open, readdir, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

import {
  parseCrashSignals,
  type CrashFtbQuestsError
} from "../../crash/signals/crash-log-signals.js";
import {
  readWorkspaceLocalSettings,
  type WorkspaceLocalSchemaExtension,
  type WorkspaceLocalSettingsPath
} from "../../workspace/local-settings.js";

const FTB_QUESTS_ROOTS = [
  join("config", "ftbquests", "quests"),
  join("config", "ftbquests")
];
const SUPPORTED_FORMATS = new Set([".snbt"]);
const MAX_FILES = 128;
const MAX_LISTED_PATHS = 24;
const MAX_LOG_BYTES = 64 * 1024;

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

const BUILTIN_FTB_QUESTS_SCHEMA_EXTENSIONS: WorkspaceLocalSchemaExtension[] = [
  {
    id: "builtin.file_settings",
    category: "file_settings",
    paths: ["data.snbt"]
  },
  {
    id: "builtin.chapter_groups",
    category: "chapter_groups",
    paths: ["chapter_groups.snbt"]
  },
  { id: "builtin.chapter_files", category: "chapter", paths: ["chapters"] },
  {
    id: "builtin.reward_tables",
    category: "reward_table",
    paths: ["reward_tables"]
  },
  { id: "builtin.translations", category: "translation", paths: ["lang"] }
];

type FtbQuestsCategory =
  | "addon_or_unknown"
  | "chapter"
  | "chapter_groups"
  | "file_settings"
  | "reward_table"
  | "translation"
  | string;

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
    schemaResolution: "builtin_fallback" | "workspace_overrides_builtin_fallback";
    evolutionGuidance: FtbQuestsSchemaEvolutionGuidance;
    fallbackExtensions: WorkspaceLocalSchemaExtension[];
    localExtensions?: WorkspaceLocalSchemaExtension[];
  };
  localSettings?: {
    source: "workspace_local_settings";
    applied: boolean;
    path: WorkspaceLocalSettingsPath;
    schemaExtensionCount: number;
  };
  logSignals?: FtbQuestsLogSignals;
  topPaths: string[];
  truncated: boolean;
}

interface FtbQuestsSchemaEvolutionGuidance {
  policy: "grow_schema_from_verified_workspace_evidence";
  priority: "workspace_schema_over_builtin_fallback";
  workspaceSettingsPath: WorkspaceLocalSettingsPath;
  evidenceSignals: string[];
  recommendedActions: string[];
}

interface FtbQuestsLogSignals {
  source: "workspace_logs";
  ftbQuestsErrorCount: number;
  errors: CrashFtbQuestsError[];
  suggestedSchemaExtensions: FtbQuestsSuggestedSchemaExtension[];
}

interface FtbQuestsSuggestedSchemaExtension extends WorkspaceLocalSchemaExtension {
  confidence: "needs_user_verification";
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

  const localSettings = await readWorkspaceLocalSettings(workspaceRoot);
  const localSchemaExtensions = localSettings.ftbQuests.schemaExtensions;
  const schemaExtensions = [
    ...localSchemaExtensions,
    ...BUILTIN_FTB_QUESTS_SCHEMA_EXTENSIONS
  ];
  const uniquePaths = [...new Set(paths)].sort();
  const logSignals = await summarizeFtbQuestsLogSignals(workspaceRoot);

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
    byCategory: countCategories(uniquePaths, schemaExtensions),
    schemaProfile: {
      ...FTB_QUESTS_SCHEMA_PROFILE,
      schemaResolution:
        localSchemaExtensions.length > 0
          ? "workspace_overrides_builtin_fallback"
          : "builtin_fallback",
      evolutionGuidance: buildSchemaEvolutionGuidance(localSettings.path),
      fallbackExtensions: BUILTIN_FTB_QUESTS_SCHEMA_EXTENSIONS,
      ...(localSchemaExtensions.length > 0
        ? { localExtensions: localSchemaExtensions }
        : {})
    },
    ...(localSchemaExtensions.length > 0
      ? {
          localSettings: {
            source: localSettings.source,
            applied: true,
            path: localSettings.path,
            schemaExtensionCount: localSchemaExtensions.length
          }
        }
      : {}),
    ...(logSignals ? { logSignals } : {}),
    topPaths: uniquePaths.slice(0, MAX_LISTED_PATHS),
    truncated: uniquePaths.length > MAX_LISTED_PATHS || paths.length >= MAX_FILES
  };
}

async function summarizeFtbQuestsLogSignals(
  workspaceRoot: string
): Promise<FtbQuestsLogSignals | undefined> {
  const logs = await Promise.all(
    [join(workspaceRoot, "logs", "latest.log"), join(workspaceRoot, "logs", "debug.log")]
      .map(readLogTailIfPresent)
  );
  const errors = logs.flatMap((content) =>
    content ? parseCrashSignals(content).ftbQuestsErrors : []
  );
  const uniqueErrors = uniqueFtbQuestsErrors(errors);

  if (uniqueErrors.length === 0) {
    return undefined;
  }

  return {
    source: "workspace_logs",
    ftbQuestsErrorCount: uniqueErrors.length,
    errors: uniqueErrors,
    suggestedSchemaExtensions: suggestSchemaExtensions(uniqueErrors)
  };
}

async function readLogTailIfPresent(path: string): Promise<string | undefined> {
  try {
    const details = await stat(path);
    const readBytes = Math.min(details.size, MAX_LOG_BYTES);
    const offset = Math.max(0, details.size - readBytes);
    const handle = await open(path, "r");

    try {
      const buffer = Buffer.alloc(readBytes);
      await handle.read(buffer, 0, readBytes, offset);
      return buffer.toString("utf-8");
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

function suggestSchemaExtensions(
  errors: CrashFtbQuestsError[]
): FtbQuestsSuggestedSchemaExtension[] {
  return unique(
    errors.flatMap((error) => {
      const rootRelativePath = error.path.split("config/ftbquests/quests/").at(1);
      const firstSegment = rootRelativePath?.split("/")[0];

      if (!firstSegment || firstSegment.endsWith(".snbt")) {
        return [];
      }

      return [{
        id: `observed.${firstSegment}`,
        category: firstSegment,
        paths: [firstSegment],
        confidence: "needs_user_verification" as const
      }];
    }),
    (entry) => entry.id
  );
}

function buildSchemaEvolutionGuidance(
  settingsPath: WorkspaceLocalSettingsPath
): FtbQuestsSchemaEvolutionGuidance {
  return {
    policy: "grow_schema_from_verified_workspace_evidence",
    priority: "workspace_schema_over_builtin_fallback",
    workspaceSettingsPath: settingsPath,
    evidenceSignals: [
      "ftb_quests_load_errors",
      "unknown_snbt_directories",
      "repeated_addon_specific_paths",
      "user_reported_success_or_failure"
    ],
    recommendedActions: [
      "treat builtin schema as fallback only",
      "inspect FTB load errors before changing schema",
      "ask whether generated or edited quest files worked in-game",
      "preserve verified reusable categories in workspace settings"
    ]
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
  extensions: WorkspaceLocalSchemaExtension[]
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
  extensions: WorkspaceLocalSchemaExtension[]
): FtbQuestsCategory {
  const rootRelativePath = path.split("config/ftbquests/quests/").at(1) ?? path;
  const segments = rootRelativePath.split("/");
  const localMatch = extensions.find((extension) =>
    extension.paths.some((prefix) => pathStartsWith(rootRelativePath, prefix))
  );

  if (localMatch) {
    return localMatch.category;
  }

  return "addon_or_unknown";
}

function pathStartsWith(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function uniqueFtbQuestsErrors(
  values: CrashFtbQuestsError[]
): CrashFtbQuestsError[] {
  return unique(values, (value) =>
    [value.kind, value.path, value.message ?? ""].join("\0")
  );
}

function unique<T>(values: T[], keyOf: (value: T) => string): T[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = keyOf(value);

    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}
