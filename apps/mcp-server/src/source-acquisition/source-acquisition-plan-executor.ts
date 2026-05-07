import {
  buildSourceAcquisitionWorkItems,
  planSourceAcquisition,
  runSourceAcquisitionWorkItems,
  type SourceAcquisitionWorkItem,
  type SourceAcquisitionWorkItemRunnerHandlers,
  type SourceAcquisitionRoute
} from "@mcpskill/source-package-manager";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "../request/execution/request-handler.js";

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
      minecraftVersion
    })
  ).concat(mappingIndexWorkItems(requestText, minecraftVersion));
  const workItemResult = options.workItemHandlers
    ? await runSourceAcquisitionWorkItems({
        workItems,
        handlers: options.workItemHandlers
      })
    : undefined;

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
      workItemExecutionStatus: workItemResult?.status,
      workItemExecutions: workItemResult?.executions
    }
  };
}

function routePaths(
  route: SourceAcquisitionRoute,
  localJarPaths?: string[]
): string[] | undefined {
  return route.origin === "local_jar" ? localJarPaths : undefined;
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
