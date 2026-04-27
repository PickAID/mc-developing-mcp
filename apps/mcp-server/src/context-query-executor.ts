import type { ArchiveContentCache } from "@mcpskill/jar-source-adapter";

import { executeMcpServerDocsLookup } from "./docs-lookup-executor.js";
import { createMcpServerModArchiveContentExecutor } from "./mod-archive-content-executor.js";
import { executeMcpServerProbeJsTypes } from "./probejs-types-executor.js";
import type {
  McpServerEvidenceExecutor,
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";

export interface McpServerContextQueryExecutorOptions {
  probejsTypesExecutor?: McpServerEvidenceExecutor;
  modArchiveContentCache?: ArchiveContentCache;
  modArchiveContentExecutor?: McpServerEvidenceExecutor;
  fallbackExecutor?: McpServerEvidenceExecutor;
}

export function buildMcpServerContextQueryExecutor(
  options: McpServerContextQueryExecutorOptions = {}
): McpServerEvidenceExecutor {
  const modArchiveContentExecutor =
    options.modArchiveContentExecutor ??
    createMcpServerModArchiveContentExecutor({
      cache: options.modArchiveContentCache
    });

  return (
    input: McpServerEvidenceExecutorInput
  ): McpServerEvidenceExecutorResult | Promise<McpServerEvidenceExecutorResult> => {
    switch (input.candidate.routeStep) {
      case "docs_lookup":
        return executeMcpServerDocsLookup(input);
      case "probejs_types":
        return (
          options.probejsTypesExecutor?.(input) ??
          executeMcpServerProbeJsTypes(input)
        );
      case "mod_archive_content":
        return modArchiveContentExecutor(input);
      default:
        return (
          options.fallbackExecutor?.(input) ?? {
            matched: false,
            summary: `No internal context.query handler registered for ${input.candidate.routeStep}.`
          }
        );
    }
  };
}
