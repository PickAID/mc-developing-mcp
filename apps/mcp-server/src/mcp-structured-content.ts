import type { McpServerRequestExecutorResult } from "./request-executor.js";

const DEFAULT_BUDGET: Required<McpDevelopStructuredContentBudgetOptions> = {
  maxArrayItems: 20,
  maxStringLength: 4000,
  maxDepth: 8
};

export interface McpDevelopStructuredContentBudgetOptions {
  maxArrayItems?: number;
  maxStringLength?: number;
  maxDepth?: number;
}

export function buildMcpDevelopStructuredContent(
  result: McpServerRequestExecutorResult,
  options: McpDevelopStructuredContentBudgetOptions = {}
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
    selectedEvidence
  };

  return JSON.parse(JSON.stringify(compact)) as Record<string, unknown>;
}

function normalizeBudget(
  options: McpDevelopStructuredContentBudgetOptions
): Required<McpDevelopStructuredContentBudgetOptions> {
  return {
    maxArrayItems: options.maxArrayItems ?? DEFAULT_BUDGET.maxArrayItems,
    maxStringLength:
      options.maxStringLength ?? DEFAULT_BUDGET.maxStringLength,
    maxDepth: options.maxDepth ?? DEFAULT_BUDGET.maxDepth
  };
}

function toCompactExecution(
  execution: McpServerRequestExecutorResult["executions"][number],
  budget: Required<McpDevelopStructuredContentBudgetOptions>
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
  budget: Required<McpDevelopStructuredContentBudgetOptions>
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
  budget: Required<McpDevelopStructuredContentBudgetOptions>,
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

interface PayloadBudgetStats {
  truncated: boolean;
  omittedArrayItems: number;
  truncatedStrings: number;
  depthLimitHits: number;
  circularReferences: number;
}
