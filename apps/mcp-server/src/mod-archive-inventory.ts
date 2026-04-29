import {
  buildModArchiveInventory,
  buildCachedModArchiveInventory,
  queryCachedModArchiveEntries,
  type ArchiveContentCache
} from "@mcpskill/jar-source-adapter";
import { join } from "node:path";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";

const DEFAULT_MAX_ARCHIVES = 64;
const DEFAULT_MAX_NESTED_ARCHIVES = 16;

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
  const entryIndex = input.databasePath
    ? await queryCachedModArchiveEntries({
        workspaceRoot,
        databasePath: input.databasePath,
        maxArchives: DEFAULT_MAX_ARCHIVES,
        limit: 0,
        refresh: input.refresh
      })
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
            }
          }
        : {})
    }
  };
}
