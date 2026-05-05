import type { ArchiveContentCache } from "@mcpskill/jar-source-adapter";
import type { DocsPackageRecord } from "@mcpskill/docs-retrieval";
import {
  createFileMavenMetadataCache,
  type MavenMetadataCache,
  type ResolveMavenArtifactInput,
  type ResolveModrinthModInput,
  type ResolveCurseForgeModInput
} from "@mcpskill/external-mod-resolver";
import { readGradleMavenRepositories } from "@mcpskill/gradle-adapter";

import { executeMcpServerDocsLookup } from "../../docs/lookup/docs-lookup-executor.js";
import type { MdmDocsSqliteArtifact } from "../../docs/mdm-docs/mdm-docs-records.js";
import { executeMcpServerExternalModResolution } from "../../external-mod/resolution/external-mod-resolution-executor.js";
import { createMcpServerModArchiveContentExecutor } from "../../mod-archive/content/mod-archive-content-executor.js";
import { executeMcpServerProbeJsTypes } from "../../probejs/types/probejs-types-executor.js";
import type {
  McpServerEvidenceExecutor,
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "../../request/execution/request-handler.js";
import type { McpServerExternalModMavenRepository } from "../../external-mod/resolution/external-mod-resolution-request.js";
import type { GradleSourceArchiveDiscoveryOptions } from "../../gradle/archive/gradle-source-archive-lookup.js";

export interface McpServerContextQueryExecutorOptions {
  probejsTypesExecutor?: McpServerEvidenceExecutor;
  externalModResolutionExecutor?: McpServerEvidenceExecutor;
  externalModMavenMetadataCache?: MavenMetadataCache;
  externalModMavenFetch?: ResolveMavenArtifactInput["fetch"];
  externalModMavenRepositories?: McpServerExternalModMavenRepository[];
  externalModGradleDependencyDiscovery?: GradleSourceArchiveDiscoveryOptions;
  externalModModrinthFetch?: ResolveModrinthModInput["fetch"];
  externalModModrinthApiBaseUrl?: string;
  externalModCurseForgeApiKey?: string;
  externalModCurseForgeCredentialProvider?: () => string | undefined;
  externalModCurseForgeFetch?: ResolveCurseForgeModInput["fetch"];
  externalModCurseForgeApiBaseUrl?: string;
  modArchiveContentCache?: ArchiveContentCache;
  modArchiveInventoryDatabasePath?: string;
  modArchiveContentExecutor?: McpServerEvidenceExecutor;
  docsRecords?: DocsPackageRecord[];
  docsSqliteArtifacts?: MdmDocsSqliteArtifact[];
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
          resourceRecords: options.docsRecords,
          sqliteArtifacts: options.docsSqliteArtifacts
        });
      case "probejs_types":
        return (
          options.probejsTypesExecutor?.(input) ??
          executeMcpServerProbeJsTypes(input)
        );
      case "external_mod_resolution":
        return (
          options.externalModResolutionExecutor?.(input) ??
          executeExternalModResolution(input, options)
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

async function executeExternalModResolution(
  input: McpServerEvidenceExecutorInput,
  options: McpServerContextQueryExecutorOptions
): Promise<McpServerEvidenceExecutorResult> {
  return await executeMcpServerExternalModResolution(input, {
    mavenMetadataCache:
      options.externalModMavenMetadataCache ??
      (options.runtimeRoot
        ? createFileMavenMetadataCache(options.runtimeRoot)
        : undefined),
    mavenRepositories:
      options.externalModMavenRepositories ??
      (await readWorkspaceMavenRepositories(input)),
    gradleDependencyDiscovery: options.externalModGradleDependencyDiscovery,
    mavenFetch: options.externalModMavenFetch,
    modrinthFetch: options.externalModModrinthFetch,
    modrinthApiBaseUrl: options.externalModModrinthApiBaseUrl,
    curseForgeApiKey: options.externalModCurseForgeApiKey,
    curseForgeCredentialProvider: options.externalModCurseForgeCredentialProvider,
    curseForgeFetch: options.externalModCurseForgeFetch,
    curseForgeApiBaseUrl: options.externalModCurseForgeApiBaseUrl,
    modArchiveContentCache: options.modArchiveContentCache
  });
}

async function readWorkspaceMavenRepositories(
  input: McpServerEvidenceExecutorInput
): Promise<McpServerExternalModMavenRepository[]> {
  const workspaceRoot = input.requestPlan.requestContext.workspaceContext?.workspaceRoot;

  if (!workspaceRoot) {
    return [];
  }

  const repositories = await readGradleMavenRepositories({ workspaceRoot });

  return repositories.map((repository) => ({
    name: `Gradle ${repository.sourceFile}`,
    url: repository.url
  }));
}
