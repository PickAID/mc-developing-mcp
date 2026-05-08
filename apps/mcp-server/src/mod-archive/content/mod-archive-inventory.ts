import {
  buildModArchiveInventory,
  buildCachedModArchiveInventory,
  queryCachedModArchiveEntries,
  type ArchiveContentCache,
  type ModArchiveAssetKind,
  type ModArchiveDataKind
} from "minecraft-developing-mcp-jar-source-adapter";
import { join } from "node:path";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "../../request/execution/request-handler.js";

const DEFAULT_MAX_ARCHIVES = 64;
const DEFAULT_MAX_NESTED_ARCHIVES = 16;
const DEFAULT_RESOURCE_ENTRY_LIMIT = 12;

const ASSET_KIND_INTENT: ReadonlyArray<{
  kind: ModArchiveAssetKind;
  patterns: RegExp[];
}> = [
  { kind: "models", patterns: [/\bmodels?\b|\bblock models?\b|\bitem models?\b/, /模型/] },
  { kind: "blockstates", patterns: [/\bblockstates?\b/, /方块状态/] },
  { kind: "items", patterns: [/\bitems?\b/, /物品定义|物品模型/] },
  { kind: "textures", patterns: [/\btextures?\b/, /贴图|纹理/] },
  { kind: "gui_texture", patterns: [/\bgui textures?\b/, /界面贴图/] },
  { kind: "gui_sprite", patterns: [/\bgui sprites?\b|\bsprites?\b/, /精灵图/] },
  { kind: "atlas", patterns: [/\batlases?\b/, /图集/] },
  { kind: "font", patterns: [/\bfonts?\b/, /字体/] },
  { kind: "lang", patterns: [/\blang(?:uage)?\b|\btranslations?\b/, /语言|翻译/] },
  { kind: "particles", patterns: [/\bparticles?\b/, /粒子/] },
  { kind: "shaders", patterns: [/\bshaders?\b/, /着色器/] },
  { kind: "sounds", patterns: [/\bsounds?\b/, /声音|音效/] }
];

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
  const requestedAssetKinds = resolveRequestedModArchiveAssetKinds(
    input.executorInput.requestPlan.requestText
  );
  const requestedDomains = [
    ...(requestedDataKinds.length > 0 ? ["data" as const] : []),
    ...(requestedAssetKinds.length > 0 ? ["assets" as const] : [])
  ];
  const entryIndex = input.databasePath
    ? await queryCachedModArchiveEntries({
        workspaceRoot,
        databasePath: input.databasePath,
        maxArchives: DEFAULT_MAX_ARCHIVES,
        domains: requestedDomains.length > 0 ? requestedDomains : undefined,
        assetKinds:
          requestedAssetKinds.length > 0 ? requestedAssetKinds : undefined,
        dataKinds:
          requestedDataKinds.length > 0 ? requestedDataKinds : undefined,
        limit:
          requestedDomains.length > 0 ? DEFAULT_RESOURCE_ENTRY_LIMIT : 0,
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
            ...(requestedAssetKinds.length > 0
              ? { assetResourceEntries: entryIndex.entries.map(toAssetResourceEntry) }
              : {}),
            ...(requestedDataKinds.length > 0
              ? { dataResourceEntries: entryIndex.entries.map(toDataResourceEntry) }
              : {})
          }
        : {})
    }
  };
}

export function resolveRequestedModArchiveAssetKinds(
  requestText?: string
): ModArchiveAssetKind[] {
  if (!requestText) {
    return [];
  }

  const normalizedText = requestText.toLowerCase();
  return ASSET_KIND_INTENT.flatMap(({ kind, patterns }) =>
    patterns.some((pattern) => pattern.test(normalizedText)) ? [kind] : []
  );
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

function toAssetResourceEntry(entry: {
  archiveRelativePath: string;
  embeddedArchivePath?: string;
  relativePath: string;
  assetKind?: ModArchiveAssetKind;
}) {
  return {
    archiveRelativePath: entry.archiveRelativePath,
    ...(entry.embeddedArchivePath
      ? { embeddedArchivePath: entry.embeddedArchivePath }
      : {}),
    relativePath: entry.relativePath,
    assetKind: entry.assetKind
  };
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
