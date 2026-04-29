import {
  buildModArchiveInventory,
  type ArchiveContentCache
} from "@mcpskill/jar-source-adapter";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";

const DEFAULT_MAX_ARCHIVES = 64;
const DEFAULT_MAX_NESTED_ARCHIVES = 16;

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

export async function listModArchiveInventory(input: {
  executorInput: McpServerEvidenceExecutorInput;
  cache?: ArchiveContentCache;
}): Promise<McpServerEvidenceExecutorResult> {
  const workspaceRoot =
    input.executorInput.requestPlan.requestContext.workspaceContext?.workspaceRoot;
  if (!workspaceRoot) {
    return {
      matched: false,
      summary: "No workspace root available for mod archive inventory."
    };
  }

  const result = await buildModArchiveInventory({
    workspaceRoot,
    maxArchives: DEFAULT_MAX_ARCHIVES,
    maxNestedArchives: DEFAULT_MAX_NESTED_ARCHIVES,
    cache: input.cache
  });

  return {
    matched: true,
    summary: `Listed ${result.archives.length} mod archive inventory entrie(s).`,
    payload: {
      source: "mod_archive_content",
      mode: "inventory",
      ...result
    }
  };
}
