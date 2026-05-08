import {
  querySourceIndex,
  type SourceIndexMatch
} from "minecraft-developing-mcp-source-index";
import {
  buildSourceAcquisitionWorkItems,
  planSourceAcquisition,
  runSourceAcquisitionWorkItems,
  type SourceAcquisitionWorkItem,
  type SourceAcquisitionWorkItemRunnerHandlers,
  type SourceAcquisitionRoute
} from "minecraft-developing-mcp-source-package-manager";
import {
  readGradleDeclaredDependencies,
  readGradleMavenRepositories
} from "minecraft-developing-mcp-gradle-adapter";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "../request/execution/request-handler.js";
import { executeMcpServerProbeJsTypes } from "../probejs/types/probejs-types-executor.js";

export interface McpServerSourceAcquisitionPlanExecutorOptions {
  workItemHandlers?: SourceAcquisitionWorkItemRunnerHandlers;
  sourceIndexDatabasePaths?: string[];
}

export async function executeMcpServerSourceAcquisitionPlan(
  input: McpServerEvidenceExecutorInput,
  options: McpServerSourceAcquisitionPlanExecutorOptions = {}
): Promise<McpServerEvidenceExecutorResult> {
  if (input.candidate.routeStep !== "source_acquisition_plan") {
    return {
      matched: false,
      summary: `source acquisition executor cannot handle ${input.candidate.routeStep}.`
    };
  }

  const descriptor = input.requestPlan.requestContext.workspaceContext?.descriptor;
  const workspaceRoot =
    input.requestPlan.requestContext.workspaceContext?.workspaceRoot ??
    descriptor?.root;
  const requestText = input.requestPlan.requestText ?? "";
  const minecraftVersion =
    descriptor?.currentRuntime.minecraftVersion ??
    inferMinecraftVersion(requestText);
  const plan = planSourceAcquisition({
    request: {
      purpose: "source_lookup",
      minecraftVersion,
      loader: descriptor?.currentRuntime.loader,
      localJarPaths: descriptor?.modArchivePaths,
      remoteSources: inferRemoteSources(requestText)
    },
    workspace: {
      available: descriptor !== undefined,
      hasGradle: descriptor?.hasGradle,
      hasProbeJs: descriptor?.hasProbeJS
    },
    policies: {
      remoteDownloads: "confirm",
      curseforgeCredentials: false
    }
  });
  const workItems = plan.routes.flatMap((route) =>
    buildSourceAcquisitionWorkItems({
      route,
      paths: routePaths(route, descriptor?.modArchivePaths),
      minecraftVersion,
      workspaceRoot
    })
  ).concat(mappingIndexWorkItems(requestText, minecraftVersion));
  const workItemHandlers = mergeWorkItemHandlers(
    defaultWorkspaceWorkItemHandlers(input),
    options.workItemHandlers
  );
  const shouldRunWorkItems =
    options.workItemHandlers !== undefined || hasWorkspaceWorkItems(workItems);
  const workItemResult = shouldRunWorkItems
    ? await runSourceAcquisitionWorkItems({
        workItems,
        handlers: workItemHandlers
      })
    : undefined;
  const sourceIndexPreview = buildSourceIndexPreview({
    requestText,
    databasePaths: options.sourceIndexDatabasePaths ?? [],
    minecraftVersion
  });

  return {
    matched: true,
    summary: `Planned ${plan.routes.length} source acquisition routes.`,
    payload: {
      source: "source_acquisition_plan",
      requiresWorkspace: plan.requiresWorkspace,
      routes: plan.routes.map((route) => ({
        origin: route.origin,
        artifactStrategy: route.artifactStrategy,
        cacheMode: route.cacheMode,
        warnings: route.warnings
      })),
      workItems,
      cachedSourceIndexes: {
        databaseCount: options.sourceIndexDatabasePaths?.length ?? 0,
        databases: options.sourceIndexDatabasePaths ?? []
      },
      ...(sourceIndexPreview ? { sourceIndexPreview } : {}),
      workItemExecutionStatus: workItemResult?.status,
      workItemExecutions: workItemResult?.executions
    }
  };
}

function defaultWorkspaceWorkItemHandlers(
  input: McpServerEvidenceExecutorInput
): SourceAcquisitionWorkItemRunnerHandlers {
  return {
    async workspaceGradleDependencies(item) {
      const [dependencies, repositories] = await Promise.all([
        readGradleDeclaredDependencies({ workspaceRoot: item.workspaceRoot }),
        readGradleMavenRepositories({ workspaceRoot: item.workspaceRoot })
      ]);

      return {
        summary: `Read ${dependencies.length} Gradle dependencies and ${repositories.length} repositories from workspace.`,
        payload: {
          source: "workspace_gradle",
          workspaceRoot: item.workspaceRoot,
          dependencyCount: dependencies.length,
          repositoryCount: repositories.length,
          dependencies: dependencies.slice(0, 20),
          repositories: repositories.slice(0, 10)
        }
      };
    },
    async workspaceProbeJsTypes(item) {
      const workspaceContext = input.requestPlan.requestContext.workspaceContext;
      if (!workspaceContext) {
        throw new Error("No workspace context available for ProbeJS work item.");
      }

      const result = await executeMcpServerProbeJsTypes({
        ...input,
        candidate: {
          ...input.candidate,
          id: `${input.candidate.id}-workspace-probejs`,
          routeStep: "probejs_types",
          provenance: "probejs_types",
          reason: "Read ProbeJS workspace types and registries."
        },
        requestPlan: {
          ...input.requestPlan,
          requestContext: {
            ...input.requestPlan.requestContext,
            workspaceContext: {
              ...workspaceContext,
              workspaceRoot: item.workspaceRoot
            }
          }
        }
      });

      return {
        summary: result.summary,
        payload: result.payload
      };
    }
  };
}

function mergeWorkItemHandlers(
  defaults: SourceAcquisitionWorkItemRunnerHandlers,
  overrides?: SourceAcquisitionWorkItemRunnerHandlers
): SourceAcquisitionWorkItemRunnerHandlers {
  return {
    ...defaults,
    ...overrides
  };
}

function hasWorkspaceWorkItems(workItems: SourceAcquisitionWorkItem[]): boolean {
  return workItems.some(
    (workItem) =>
      workItem.kind === "workspace_gradle_dependencies" ||
      workItem.kind === "workspace_probejs_types"
  );
}

function routePaths(
  route: SourceAcquisitionRoute,
  localJarPaths?: string[]
): string[] | undefined {
  return route.origin === "local_jar" ? localJarPaths : undefined;
}

function buildSourceIndexPreview(input: {
  requestText: string;
  databasePaths: string[];
  minecraftVersion?: string;
}): SourceIndexPreview | undefined {
  const query = inferSourceIndexQuery(input.requestText);
  if (!query || input.databasePaths.length === 0) {
    return undefined;
  }

  const matches: SourceIndexPreviewMatch[] = [];
  const warnings: string[] = [];
  let searchedDatabaseCount = 0;
  for (const databasePath of input.databasePaths.slice(0, 3)) {
    searchedDatabaseCount += 1;
    const result = safeQuerySourceIndex(databasePath, query);
    if (!result) {
      warnings.push(`Skipped unreadable source index ${databasePath}.`);
      continue;
    }
    for (const match of result.matches) {
      if (!sourceIndexMatchTargetsVersion(match, input.minecraftVersion)) {
        continue;
      }
      matches.push(toPreviewMatch(databasePath, match));
      if (matches.length >= 5) {
        return {
          query,
          searchedDatabaseCount,
          matches,
          warnings: optionalWarnings(warnings)
        };
      }
    }
  }

  return {
    query,
    searchedDatabaseCount,
    matches,
    warnings: optionalWarnings(warnings)
  };
}

function sourceIndexMatchTargetsVersion(match: SourceIndexMatch, minecraftVersion?: string): boolean {
  return !minecraftVersion || !match.packageId || match.packageId.startsWith(`minecraft-${minecraftVersion}-`);
}

function safeQuerySourceIndex(
  databasePath: string,
  query: string
): ReturnType<typeof querySourceIndex> | undefined {
  try {
    return querySourceIndex({
      databasePath,
      ...querySourceIndexInput(query),
      limit: 3
    });
  } catch {
    return undefined;
  }
}

function querySourceIndexInput(query: string) {
  if (query.includes("/")) {
    return { pathLike: query.endsWith(".java") ? query : `${query}.java` };
  }
  if (/^(?:[a-z_][\w]*\.)+[A-Z_]\w*(?:\.[A-Z_]\w*)?$/u.test(query)) {
    return { symbol: query };
  }
  if (/^[A-Z_]\w*$/u.test(query)) {
    return { symbol: query };
  }
  return { text: query };
}

function inferSourceIndexQuery(requestText: string): string | undefined {
  return (
    requestText.match(/\bnet\.minecraft(?:\.[A-Za-z_][A-Za-z0-9_]*)+\b/u)?.[0] ??
    requestText.match(/\bnet\/minecraft(?:\/[A-Za-z0-9_]+)+(?:\.java)?\b/u)?.[0]
  );
}

function toPreviewMatch(
  databasePath: string,
  match: SourceIndexMatch
): SourceIndexPreviewMatch {
  return {
    databasePath,
    path: match.path,
    kind: match.kind,
    packageId: match.packageId,
    qualifiedName: match.qualifiedName,
    memberName: match.memberName,
    memberKind: match.memberKind,
    startLine: match.startLine,
    endLine: match.endLine,
    chunkId: match.chunkId,
    matchReasons: match.matchReasons
  };
}

function inferRemoteSources(
  requestText: string
): Array<"official" | "modrinth" | "curseforge" | "github"> {
  const normalized = requestText.toLowerCase();
  const sources: Array<"official" | "modrinth" | "curseforge" | "github"> = [];

  if (/\b(?:minecraft|vanilla|official)\b|原版|官方/.test(normalized)) {
    sources.push("official");
  }
  if (/\bmodrinth\b/.test(normalized)) {
    sources.push("modrinth");
  }
  if (/\bcurseforge\b|\bcurse\b/.test(normalized)) {
    sources.push("curseforge");
  }
  if (/\bgithub\b|github\.com/.test(normalized)) {
    sources.push("github");
  }

  return sources.length > 0 ? sources : ["official", "modrinth", "curseforge"];
}

interface SourceIndexPreview {
  query?: string;
  searchedDatabaseCount: number;
  matches: SourceIndexPreviewMatch[];
  warnings?: string[];
}

interface SourceIndexPreviewMatch {
  databasePath: string;
  path: string;
  kind: SourceIndexMatch["kind"];
  packageId?: string;
  qualifiedName?: string;
  memberName?: string;
  memberKind?: SourceIndexMatch["memberKind"];
  startLine?: number;
  endLine?: number;
  chunkId?: string;
  matchReasons?: string[];
}

function optionalWarnings(warnings: string[]): string[] | undefined {
  return warnings.length > 0 ? warnings : undefined;
}

function inferMinecraftVersion(requestText: string): string | undefined {
  return requestText.match(/\b1\.\d{1,2}(?:\.\d+)?\b/)?.[0];
}

function mappingIndexWorkItems(
  requestText: string,
  minecraftVersion?: string
): SourceAcquisitionWorkItem[] {
  if (!minecraftVersion || !hasMappingIntent(requestText)) {
    return [];
  }

  return [
    {
      kind: "mapping_index",
      minecraftVersion,
      mappingFamily: inferMappingFamily(requestText),
      cacheScope: "private_runtime"
    }
  ];
}

function hasMappingIntent(requestText: string): boolean {
  return /\b(mapping|mappings|mapped|remap|yarn|parchment|mojmap|obfuscated|mixin target)\b|映射|混淆/u.test(
    requestText.toLowerCase()
  );
}

function inferMappingFamily(
  requestText: string
): "yarn" | "parchment" | "mojmap" {
  const normalized = requestText.toLowerCase();
  if (/\bparchment\b/.test(normalized)) {
    return "parchment";
  }
  if (/\bmojmap\b|\bmojang mappings?\b/.test(normalized)) {
    return "mojmap";
  }
  return "yarn";
}
