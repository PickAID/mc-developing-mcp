import type { McpServerRequestExecutorResult } from "../../request/execution/request-executor.js";
import type { MdmResourceStatusContext } from "../../docs/mdm-resource/mdm-resource-status.js";
import type { McpMdmReleaseInstallResult } from "../../docs/mdm-resource/mdm-release-install.js";
import type { MdmDocsResourceSummary } from "../../docs/mdm-docs/mdm-docs-records.js";
import type { MdmPackageRecommendations } from "../../docs/mdm-resource/mdm-package-recommendations.js";
import { buildMcpResourceActions } from "./mcp-resource-actions.js";
import { buildMcpPromptGuidance } from "./mcp-prompt-guidance.js";
import { buildWorkspacePreparationWorkflow } from "./mcp-workspace-preparation-workflow.js";
import { buildWorkspacePreparationEvidenceSummary } from "./mcp-workspace-preparation-summary.js";

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
    clientVisualVerifier: buildClientVisualVerifierSummary(result, budget),
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

function buildClientVisualVerifierSummary(
  result: McpServerRequestExecutorResult,
  budget: RequiredBudgetOptions
) {
  const selected = verifierFromExecution(result.selectedEvidence);
  const fallback = selected
    ? undefined
    : result.executions.map(verifierFromExecution).find((entry) => entry);
  const entry = selected ?? fallback;
  if (!entry) {
    return undefined;
  }

  const summary = {
    source: entry.source,
    candidateId: entry.candidateId,
    overall: optionalString(entry.verifier.overall),
    missingChecks: checkIdsByStatus(entry.verifier.checks, "missing"),
    riskyChecks: checkIdsByStatus(entry.verifier.checks, "risky"),
    nextProofSteps: arrayOfStrings(entry.verifier.nextProofSteps)
  };

  return compactPayload(summary, budget).value;
}

function verifierFromExecution(
  execution: McpServerRequestExecutorResult["executions"][number] | undefined
) {
  const payload = isRecord(execution?.payload) ? execution.payload : undefined;
  const evidence = isRecord(payload?.clientVisualEvidence)
    ? payload.clientVisualEvidence
    : undefined;
  const verifier = isRecord(evidence?.visualVerifier)
    ? evidence.visualVerifier
    : undefined;
  if (!execution || !verifier) {
    return undefined;
  }

  return {
    source: execution.status === "selected" ? "selectedEvidence" : "execution",
    candidateId: execution.candidateId,
    verifier
  };
}

function checkIdsByStatus(value: unknown, status: string): string[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value)
    .filter(
      ([, entry]) => isRecord(entry) && optionalString(entry.status) === status
    )
    .map(([id]) => id);
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

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
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
