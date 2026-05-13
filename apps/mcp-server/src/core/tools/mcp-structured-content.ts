import type { McpServerRequestExecutorResult } from "../../request/execution/request-executor.js";
import type { MdmResourceStatusContext } from "../../docs/mdm-resource/mdm-resource-status.js";
import type { McpMdmReleaseInstallResult } from "../../docs/mdm-resource/mdm-release-install.js";
import type { MdmDocsResourceSummary } from "../../docs/mdm-docs/mdm-docs-records.js";
import type { MdmPackageRecommendations } from "../../docs/mdm-resource/mdm-package-recommendations.js";
import type { McpRuntimeEnvironment } from "./mcp-tool-runtime-resolution.js";
import { buildMcpResourceActions } from "./mcp-resource-actions.js";
import { buildMcpPromptGuidance } from "./mcp-prompt-guidance.js";
import { buildStructuredWorkspacePreparation } from "./mcp-structured-workspace-preparation.js";
import {
  buildCrashSignalsSummary,
  buildClientVisualVerifierSummary,
  buildJavaDiagnosticsSummary,
  buildKubeJsQualitySummary
} from "./mcp-structured-evidence-summaries.js";

type RequiredBudgetOptions = Required<
  Omit<
    McpDevelopStructuredContentOptions,
    | "mdmResources"
    | "mdmReleaseInstall"
    | "mdmDocs"
    | "mdmPackageRecommendations"
    | "runtimeEnvironment"
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
  runtimeEnvironment?: McpRuntimeEnvironment;
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
    workspacePreparation: buildStructuredWorkspacePreparation(
      result,
      budget,
      compactPayload
    ),
    promptGuidance: buildMcpPromptGuidance(
      result.requestPlan,
      budget,
      compactPayload
    ),
    crashSignals: buildCrashSignalsSummary(result, budget, compactPayload),
    javaDiagnostics: buildJavaDiagnosticsSummary(result, budget, compactPayload),
    kubeJsQuality: buildKubeJsQualitySummary(result, budget, compactPayload),
    clientVisualVerifier: buildClientVisualVerifierSummary(
      result,
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
    runtimeEnvironment: options.runtimeEnvironment
      ? compactPayload(toRuntimeEnvironmentSummary(options.runtimeEnvironment), budget)
          .value
      : undefined,
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

function toRuntimeEnvironmentSummary(
  runtimeEnvironment: McpRuntimeEnvironment
): Omit<McpRuntimeEnvironment, "env"> {
  return {
    values: runtimeEnvironment.values,
    sources: runtimeEnvironment.sources,
    inputPatch: runtimeEnvironment.inputPatch,
    envPatch: runtimeEnvironment.envPatch
  };
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
  const compacted = compactValue(value, budget, stats, 0, [], new WeakSet());

  return { value: compacted, stats };
}

function compactValue(
  value: unknown,
  budget: RequiredBudgetOptions,
  stats: PayloadBudgetStats,
  depth: number,
  path: string[],
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
    if (isUnboundedProbeResourceEntryPath(path)) {
      const compacted = value.map((item) =>
        compactValue(item, budget, stats, depth + 1, path, seen)
      );

      seen.delete(value);

      return compacted;
    }

    const omitted = Math.max(0, value.length - budget.maxArrayItems);

    if (omitted > 0) {
      stats.truncated = true;
      stats.omittedArrayItems += omitted;
    }

    const compacted = value
      .slice(0, budget.maxArrayItems)
      .map((item) => compactValue(item, budget, stats, depth + 1, path, seen));

    seen.delete(value);

    return compacted;
  }

  const compacted = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      compactValue(entry, budget, stats, depth + 1, [...path, key], seen)
    ])
  );

  seen.delete(value);

  return compacted;
}

function isUnboundedProbeResourceEntryPath(path: string[]): boolean {
  return (
    path.length >= 3 &&
    path.at(-3) === "probeResources" &&
    path.at(-2) === "entries"
  );
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

interface PayloadBudgetStats {
  truncated: boolean;
  omittedArrayItems: number;
  truncatedStrings: number;
  depthLimitHits: number;
  circularReferences: number;
}
