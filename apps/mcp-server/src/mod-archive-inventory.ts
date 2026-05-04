import {
  buildModArchiveInventory,
  buildCachedModArchiveInventory,
  queryCachedModArchiveEntries,
  type ArchiveContentCache,
  type ModArchiveDataKind
} from "@mcpskill/jar-source-adapter";
import { join } from "node:path";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";

const DEFAULT_MAX_ARCHIVES = 64;
const DEFAULT_MAX_NESTED_ARCHIVES = 16;
const DEFAULT_DATA_ENTRY_LIMIT = 12;

const DATA_KIND_INTENT: ReadonlyArray<{
  kind: ModArchiveDataKind;
  patterns: RegExp[];
}> = [
  { kind: "recipes", patterns: [/\brecipes?\b/, /配方/] },
  { kind: "loot_tables", patterns: [/\bloot(?:\s+tables?)?\b/, /战利品|掉落表|掉落/] },
  { kind: "tags", patterns: [/\btags?\b/, /标签/] },
  { kind: "functions", patterns: [/\bfunctions?\b/, /函数/] },
  { kind: "advancements", patterns: [/\badvancements?\b|\bachievements?\b/, /进度|成就/] },
  { kind: "worldgen", patterns: [/\bworld\s*gen(?:eration)?\b|\bbiomes?\b/, /世界生成|生物群系|地形/] },
  { kind: "structures", patterns: [/\bstructures?\b/, /结构/] },
  { kind: "predicates", patterns: [/\bpredicates?\b/, /谓词/] },
  { kind: "item_modifiers", patterns: [/\bitem[_\s-]?modifiers?\b/, /物品修改器/] },
  { kind: "registry", patterns: [/\bregistr(?:y|ies)\b/, /注册项|注册表/] }
];

export function resolveModArchiveInventoryDatabasePath(
  runtimeRoot: string
): string {
  return join(
    runtimeRoot,
    "caches",
    "mod-archives",
    "mod-archive-inventory.sqlite"
  );
}

export function isModArchiveInventoryRequest(requestText?: string): boolean {
  if (!requestText) {
    return false;
  }

  const normalizedText = requestText.toLowerCase();
  return (
    /\b(inventory|index|summary|清单|索引|概览)\b/i.test(requestText) &&
    /\b(mod|mods|jar|jars|jarjar|archive|archives)\b/.test(normalizedText)
  );
}

export function shouldRefreshModArchiveInventory(requestText?: string): boolean {
  if (!requestText) {
    return false;
  }

  const normalizedText = requestText.toLowerCase();
  return (
    /\b(refresh|rebuild|rescan|reload|force|invalidate|bypass cache)\b/.test(
      normalizedText
    ) || /(刷新|重建|重新扫描|强制|绕过缓存|清理缓存)/.test(requestText)
  );
}

export async function listModArchiveInventory(input: {
  executorInput: McpServerEvidenceExecutorInput;
  cache?: ArchiveContentCache;
  databasePath?: string;
  refresh?: boolean;
}): Promise<McpServerEvidenceExecutorResult> {
  const workspaceRoot =
    input.executorInput.requestPlan.requestContext.workspaceContext?.workspaceRoot;
  if (!workspaceRoot) {
    return {
      matched: false,
      summary: "No workspace root available for mod archive inventory."
    };
  }

  const result = input.databasePath
    ? await buildCachedModArchiveInventory({
        workspaceRoot,
        databasePath: input.databasePath,
        maxArchives: DEFAULT_MAX_ARCHIVES,
        maxNestedArchives: DEFAULT_MAX_NESTED_ARCHIVES,
        refresh: input.refresh,
        buildInventory: (options) =>
          buildModArchiveInventory({ ...options, cache: input.cache })
      })
    : await buildModArchiveInventory({
        workspaceRoot,
        maxArchives: DEFAULT_MAX_ARCHIVES,
        maxNestedArchives: DEFAULT_MAX_NESTED_ARCHIVES,
        cache: input.cache
      });
  const requestedDataKinds = resolveRequestedModArchiveDataKinds(
    input.executorInput.requestPlan.requestText
  );
  const entryIndex = input.databasePath
    ? await queryCachedModArchiveEntries({
        workspaceRoot,
        databasePath: input.databasePath,
        maxArchives: DEFAULT_MAX_ARCHIVES,
        domains: requestedDataKinds.length > 0 ? ["data"] : undefined,
        dataKinds:
          requestedDataKinds.length > 0 ? requestedDataKinds : undefined,
        limit:
          requestedDataKinds.length > 0 ? DEFAULT_DATA_ENTRY_LIMIT : 0,
        refresh: input.refresh
      })
    : undefined;
  const assetResourceSummary =
    entryIndex && entryIndex.assetSummary.assetEntryCount > 0
      ? {
          ...entryIndex.assetSummary,
          tokenPolicy: "counts_only" as const
        }
      : undefined;
  const dataResourceSummary =
    entryIndex && entryIndex.dataSummary.dataEntryCount > 0
      ? {
          ...entryIndex.dataSummary,
          tokenPolicy: "counts_only" as const
        }
      : undefined;

  return {
    matched: true,
    summary: `Listed ${result.archives.length} mod archive inventory entrie(s).`,
    payload: {
      source: "mod_archive_content",
      mode: "inventory",
      ...result,
      ...(entryIndex
        ? {
            entryIndex: {
              archiveCount: entryIndex.archiveCount,
              entryCount: entryIndex.entryCount,
              truncated: entryIndex.truncated,
              cache: entryIndex.cache
            },
            ...(assetResourceSummary ? { assetResourceSummary } : {}),
            ...(dataResourceSummary ? { dataResourceSummary } : {}),
            ...(requestedDataKinds.length > 0
              ? { dataResourceEntries: entryIndex.entries.map(toDataResourceEntry) }
              : {})
          }
        : {})
    }
  };
}

export function resolveRequestedModArchiveDataKinds(
  requestText?: string
): ModArchiveDataKind[] {
  if (!requestText) {
    return [];
  }

  const normalizedText = requestText.toLowerCase();
  return DATA_KIND_INTENT.flatMap(({ kind, patterns }) =>
    patterns.some((pattern) => pattern.test(normalizedText)) ? [kind] : []
  );
}

function toDataResourceEntry(entry: {
  archiveRelativePath: string;
  embeddedArchivePath?: string;
  relativePath: string;
  dataKind?: ModArchiveDataKind;
}) {
  return {
    archiveRelativePath: entry.archiveRelativePath,
    ...(entry.embeddedArchivePath
      ? { embeddedArchivePath: entry.embeddedArchivePath }
      : {}),
    relativePath: entry.relativePath,
    dataKind: entry.dataKind
  };
}
