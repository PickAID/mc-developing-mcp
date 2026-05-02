import type { ArchiveContentCache } from "@mcpskill/jar-source-adapter";
import type { DocsPackageRecord } from "@mcpskill/docs-retrieval";
import {
  createFileMavenMetadataCache,
  type MavenMetadataCache
} from "@mcpskill/external-mod-resolver";

import { executeMcpServerDocsLookup } from "./docs-lookup-executor.js";
import { executeMcpServerExternalModResolution } from "./external-mod-resolution-executor.js";
import { createMcpServerModArchiveContentExecutor } from "./mod-archive-content-executor.js";
import { executeMcpServerProbeJsTypes } from "./probejs-types-executor.js";
import type {
  McpServerEvidenceExecutor,
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";

export interface McpServerContextQueryExecutorOptions {
  probejsTypesExecutor?: McpServerEvidenceExecutor;
  externalModResolutionExecutor?: McpServerEvidenceExecutor;
  externalModMavenMetadataCache?: MavenMetadataCache;
  modArchiveContentCache?: ArchiveContentCache;
  modArchiveInventoryDatabasePath?: string;
  modArchiveContentExecutor?: McpServerEvidenceExecutor;
  docsRecords?: DocsPackageRecord[];
  fallbackExecutor?: McpServerEvidenceExecutor;
  runtimeRoot?: string;
}

export function buildMcpServerContextQueryExecutor(
  options: McpServerContextQueryExecutorOptions = {}
): McpServerEvidenceExecutor {
  const modArchiveContentExecutor =
    options.modArchiveContentExecutor ??
    createMcpServerModArchiveContentExecutor({
      cache: options.modArchiveContentCache,
      inventoryDatabasePath: options.modArchiveInventoryDatabasePath,
      runtimeRoot: options.runtimeRoot
    });

  return (
    input: McpServerEvidenceExecutorInput
  ): McpServerEvidenceExecutorResult | Promise<McpServerEvidenceExecutorResult> => {
    switch (input.candidate.routeStep) {
      case "docs_lookup":
        return executeMcpServerDocsLookup(input, {
          resourceRecords: options.docsRecords
        });
      case "probejs_types":
        return (
          options.probejsTypesExecutor?.(input) ??
          executeMcpServerProbeJsTypes(input)
        );
      case "external_mod_resolution":
        return (
          options.externalModResolutionExecutor?.(input) ??
          executeMcpServerExternalModResolution(input, {
            mavenMetadataCache:
              options.externalModMavenMetadataCache ??
              (options.runtimeRoot
                ? createFileMavenMetadataCache(options.runtimeRoot)
                : undefined)
          })
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
