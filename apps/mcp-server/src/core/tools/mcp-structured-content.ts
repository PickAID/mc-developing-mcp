import type { McpServerRequestExecutorResult } from "../../request/execution/request-executor.js";
import type { MdmResourceStatusContext } from "../../docs/mdm-resource/mdm-resource-status.js";
import type { McpMdmReleaseInstallResult } from "../../docs/mdm-resource/mdm-release-install.js";
import type { MdmDocsResourceSummary } from "../../docs/mdm-docs/mdm-docs-records.js";
import type { MdmPackageRecommendations } from "../../docs/mdm-resource/mdm-package-recommendations.js";
import { buildMcpResourceActions } from "./mcp-resource-actions.js";
import { buildMcpPromptGuidance } from "./mcp-prompt-guidance.js";
import { buildWorkspacePreparationWorkflow } from "./mcp-workspace-preparation-workflow.js";

type RequiredBudgetOptions = Required<
  Omit<
    McpDevelopStructuredContentOptions,
    | "mdmResources"
    | "mdmReleaseInstall"
    | "mdmDocs"
    | "mdmPackageRecommendations"
  >
>;

const DEFAULT_BUDGET: RequiredBudgetOptions = {
  maxArrayItems: 20,
  maxStringLength: 4000,
  maxDepth: 8
};

export interface McpDevelopStructuredContentOptions {
  maxArrayItems?: number;
  maxStringLength?: number;
  maxDepth?: number;
  mdmResources?: MdmResourceStatusContext;
  mdmReleaseInstall?: McpMdmReleaseInstallResult;
  mdmDocs?: MdmDocsResourceSummary;
  mdmPackageRecommendations?: MdmPackageRecommendations;
}

export function buildMcpDevelopStructuredContent(
  result: McpServerRequestExecutorResult,
  options: McpDevelopStructuredContentOptions = {}
): Record<string, unknown> {
  const budget = normalizeBudget(options);
  const snapshot = result.requestPlan.requestContext.harnessSnapshot;
  const executions = result.executions.map((execution) =>
    toCompactExecution(execution, budget)
  );
  const selectedEvidence = result.selectedEvidence
    ? toCompactExecution(result.selectedEvidence, budget)
    : undefined;
  const compact = {
    appId: result.appId,
    requestText: result.requestPlan.requestText,
    workspace: {
      root: snapshot.workspaceRoot,
      kind: snapshot.workspaceKind,
      currentRuntime: snapshot.currentRuntime,
      facts: snapshot.facts
    },
    trace: result.trace,
    workspacePreparation: buildWorkspacePreparation(result, budget),
    promptGuidance: buildMcpPromptGuidance(
      result.requestPlan,
      budget,
      compactPayload
    ),
    budget: {
      payloadPolicy: "bounded",
      maxArrayItems: budget.maxArrayItems,
      maxStringLength: budget.maxStringLength,
      maxDepth: budget.maxDepth,
      truncatedExecutionIds: executions
        .filter((execution) => execution.payloadBudget?.truncated)
        .map((execution) => execution.candidateId)
    },
    executions,
    selectedEvidence,
    mdmResources: options.mdmResources
      ? compactPayload(options.mdmResources, budget).value
      : undefined,
    mdmReleaseInstall: options.mdmReleaseInstall
      ? compactPayload(options.mdmReleaseInstall, budget).value
      : undefined,
    mdmDocs: options.mdmDocs
      ? compactPayload(options.mdmDocs, budget).value
      : undefined,
    mdmPackageRecommendations: options.mdmPackageRecommendations
      ? compactPayload(options.mdmPackageRecommendations, budget).value
      : undefined,
    resourceActions: buildMcpResourceActions(
      options.mdmPackageRecommendations,
      budget,
      compactPayload
    )
  };

  return JSON.parse(JSON.stringify(compact)) as Record<string, unknown>;
}

function buildWorkspacePreparation(
  result: McpServerRequestExecutorResult,
  budget: RequiredBudgetOptions
) {
  const execution = result.executions.find(
    (item) => item.routeStep === "source_acquisition_plan" && item.payload
  );
  const payload = execution?.payload;
  if (!isRecord(payload) || payload.source !== "source_acquisition_plan") {
    return undefined;
  }

  const capabilityGuidance = isRecord(payload.capabilityGuidance)
    ? payload.capabilityGuidance
    : undefined;

  const capabilityMapPayload = compactPayload(
    capabilityGuidance?.capabilityMap,
    budget
  );
  const topLevel = {
    source: payload.source,
    candidateId: execution?.candidateId,
    status: resolveWorkspacePreparationStatus(payload),
    requiresWorkspace: payload.requiresWorkspace,
    capabilityGuidance: {
      statusLines: capabilityGuidance?.statusLines,
      nextActions: capabilityGuidance?.nextActions
    },
    capabilityMap: capabilityMapPayload.value,
    workflow: buildWorkspacePreparationWorkflow(payload, capabilityGuidance),
    evidenceSummary: buildWorkspacePreparationEvidenceSummary(
      payload,
      result.executions
    ),
    budget: capabilityMapPayload.stats.truncated
      ? capabilityMapPayload.stats
      : undefined
  };

  return compactPayload(topLevel, budget).value;
}

function buildWorkspacePreparationEvidenceSummary(
  payload: Record<string, unknown>,
  executions: McpServerRequestExecutorResult["executions"]
) {
  const workItemExecutions = arrayOfRecords(payload.workItemExecutions);
  const summary = {
    gradle: summarizeGradleExecution(workItemExecutions),
    probejs: summarizeProbeJsExecution(workItemExecutions),
    localJar: summarizeJarExecution(workItemExecutions),
    sourceIndex: summarizeSourceIndexPreview(payload.sourceIndexPreview),
    javaDiagnostics: summarizeJavaDiagnosticsExecution(workItemExecutions),
    ftbQuests: summarizeFtbQuestsExecution(executions)
  };

  return Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value !== undefined)
  );
}

function summarizeGradleExecution(executions: Array<Record<string, unknown>>) {
  const execution = findWorkItemPayload(executions, "workspace_gradle_dependencies");
  if (!execution || execution.source !== "workspace_gradle") {
    return undefined;
  }

  return {
    dependencyCount: numberValue(execution.dependencyCount),
    repositoryCount: numberValue(execution.repositoryCount),
    sourceArchiveCount: numberValue(execution.declaredDependencySourceArchiveCount),
    binaryArchiveCount: numberValue(execution.declaredDependencyBinaryArchiveCount),
    sourceArchives: archivePaths(execution.declaredDependencySourceArchives),
    binaryArchives: archivePaths(execution.declaredDependencyBinaryArchives)
  };
}

function summarizeProbeJsExecution(executions: Array<Record<string, unknown>>) {
  const execution = findWorkItemPayload(executions, "workspace_probejs_types");
  const probeResources = isRecord(execution?.probeResources)
    ? execution.probeResources
    : undefined;
  const summary = isRecord(probeResources?.summary)
    ? probeResources.summary
    : undefined;

  if (!summary) {
    return undefined;
  }

  return {
    counts: summary.counts,
    totalCounts: summary.totalCounts,
    cacheHit: execution?.probeResourceCacheHit
  };
}

function summarizeJarExecution(executions: Array<Record<string, unknown>>) {
  const execution = findWorkItemPayload(executions, "jar_index");
  if (!execution || execution.source !== "source_acquisition_jar_index") {
    return undefined;
  }

  const cache = isRecord(execution.cache) ? execution.cache : undefined;

  return {
    mode: execution.mode,
    archiveCount: numberValue(execution.archiveCount),
    entryCount: numberValue(execution.entryCount),
    tokenPolicy: execution.tokenPolicy,
    cache: cache
      ? {
          archiveHits: numberValue(cache.archiveHits),
          archiveMisses: numberValue(cache.archiveMisses)
        }
      : undefined,
    domainCounts: execution.domainCounts
  };
}

function summarizeSourceIndexPreview(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }
  const matches = arrayOfRecords(value.matches);

  return {
    query: value.query,
    searchedDatabaseCount: numberValue(value.searchedDatabaseCount),
    matchCount: matches.length,
    topPaths: matches
      .map((match) => optionalString(match.path))
      .filter((path): path is string => path !== undefined)
      .slice(0, 5),
    warnings: value.warnings
  };
}

function summarizeJavaDiagnosticsExecution(
  executions: Array<Record<string, unknown>>
) {
  const execution = findWorkItemPayload(executions, "java_diagnostics");
  if (!execution || execution.mode !== "java_diagnostics") {
    return undefined;
  }

  const firstFile = arrayOfRecords(execution.files)[0];
  const firstDiagnostic = arrayOfRecords(firstFile?.diagnostics)[0];
  const firstMessage = optionalString(firstDiagnostic?.message);
  if (!firstFile || !firstMessage) {
    return {
      totalDiagnostics: numberValue(execution.totalDiagnostics)
    };
  }

  return {
    totalDiagnostics: numberValue(execution.totalDiagnostics),
    firstLocation: formatDiagnosticLocation(firstFile, firstDiagnostic),
    firstMessage
  };
}

function summarizeFtbQuestsExecution(
  executions: McpServerRequestExecutorResult["executions"]
) {
  const execution = executions.find((item) => item.routeStep === "datapack_files");
  const payload = isRecord(execution?.payload) ? execution.payload : undefined;
  const summary = isRecord(payload?.ftbQuestsSummary)
    ? payload.ftbQuestsSummary
    : undefined;
  const logSignals = isRecord(summary?.logSignals) ? summary.logSignals : undefined;
  const proposal = isRecord(logSignals?.settingsProposal)
    ? logSignals.settingsProposal
    : undefined;
  if (!summary) {
    return undefined;
  }

  return {
    fileCount: numberValue(summary.fileCount),
    schemaSource: isRecord(summary.schemaProfile)
      ? summary.schemaProfile.sourceEvidence
      : undefined,
    logErrorCount: numberValue(logSignals?.ftbQuestsErrorCount),
    settingsProposalTargetPath: proposal?.targetPath,
    nextAction: isRecord(summary.decisionTrace)
      ? summary.decisionTrace.nextAction
      : undefined
  };
}

function formatDiagnosticLocation(
  file: Record<string, unknown>,
  diagnostic: Record<string, unknown>
): string {
  const relativePath = optionalString(file.relativePath) ?? "unknown.java";
  const start = isRecord(diagnostic.range)
    ? isRecord(diagnostic.range.start)
      ? diagnostic.range.start
      : undefined
    : undefined;
  const line = numberValue(start?.line);
  const character = numberValue(start?.character);

  return line !== undefined && character !== undefined
    ? `${relativePath}:${line + 1}:${character + 1}`
    : relativePath;
}

function findWorkItemPayload(
  executions: Array<Record<string, unknown>>,
  kind: string
): Record<string, unknown> | undefined {
  const execution = executions.find((item) => item.kind === kind);
  return isRecord(execution?.payload) ? execution.payload : undefined;
}

function archivePaths(value: unknown): string[] {
  return arrayOfRecords(value)
    .map((archive) => optionalString(archive.archivePath))
    .filter((path): path is string => path !== undefined)
    .slice(0, 5);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function resolveWorkspacePreparationStatus(
  payload: Record<string, unknown>
): "ready" | "partial" | "blocked" | "no_workspace" {
  if (payload.requiresWorkspace === true) {
    return "no_workspace";
  }
  if (payload.workItemExecutionStatus === "partial") {
    return "partial";
  }
  if (payload.workItemExecutionStatus === "completed") {
    return "ready";
  }

  return "ready";
}

function normalizeBudget(
  options: McpDevelopStructuredContentOptions
): RequiredBudgetOptions {
  return {
    maxArrayItems: options.maxArrayItems ?? DEFAULT_BUDGET.maxArrayItems,
    maxStringLength:
      options.maxStringLength ?? DEFAULT_BUDGET.maxStringLength,
    maxDepth: options.maxDepth ?? DEFAULT_BUDGET.maxDepth
  };
}

function toCompactExecution(
  execution: McpServerRequestExecutorResult["executions"][number],
  budget: RequiredBudgetOptions
) {
  const payload = compactPayload(execution.payload, budget);
  const compact = {
    candidateId: execution.candidateId,
    routeStep: execution.routeStep,
    preferredTool: execution.preferredTool,
    status: execution.status,
    attempted: execution.attempted,
    summary: execution.summary,
    pathHints: execution.pathHints,
    queryHint: execution.queryHint,
    payload: payload.value,
    payloadBudget: payload.stats.truncated ? payload.stats : undefined
  };

  return compact;
}

function compactPayload(
  value: unknown,
  budget: RequiredBudgetOptions
): { value: unknown; stats: PayloadBudgetStats } {
  const stats: PayloadBudgetStats = {
    truncated: false,
    omittedArrayItems: 0,
    truncatedStrings: 0,
    depthLimitHits: 0,
    circularReferences: 0
  };
  const compacted = compactValue(value, budget, stats, 0, new WeakSet());

  return { value: compacted, stats };
}

function compactValue(
  value: unknown,
  budget: RequiredBudgetOptions,
  stats: PayloadBudgetStats,
  depth: number,
  seen: WeakSet<object>
): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return compactString(value, budget.maxStringLength, stats);
  }
  if (typeof value === "undefined") {
    return undefined;
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) {
    stats.truncated = true;
    stats.circularReferences += 1;
    return "[Circular]";
  }
  if (depth >= budget.maxDepth) {
    stats.truncated = true;
    stats.depthLimitHits += 1;
    return summarizeDepthLimitedValue(value);
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const omitted = Math.max(0, value.length - budget.maxArrayItems);

    if (omitted > 0) {
      stats.truncated = true;
      stats.omittedArrayItems += omitted;
    }

    const compacted = value
      .slice(0, budget.maxArrayItems)
      .map((item) => compactValue(item, budget, stats, depth + 1, seen));

    seen.delete(value);

    return compacted;
  }

  const compacted = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      compactValue(entry, budget, stats, depth + 1, seen)
    ])
  );

  seen.delete(value);

  return compacted;
}

function compactString(
  value: string,
  maxLength: number,
  stats: PayloadBudgetStats
): string {
  if (value.length <= maxLength) {
    return value;
  }

  stats.truncated = true;
  stats.truncatedStrings += 1;

  return `${value.slice(0, maxLength)}...<truncated ${
    value.length - maxLength
  } chars>`;
}

function summarizeDepthLimitedValue(value: object): string {
  if (Array.isArray(value)) {
    return `[Array(${value.length}) depth limit]`;
  }

  return `[Object depth limit: ${Object.keys(value).length} keys]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

interface PayloadBudgetStats {
  truncated: boolean;
  omittedArrayItems: number;
  truncatedStrings: number;
  depthLimitHits: number;
  circularReferences: number;
}
