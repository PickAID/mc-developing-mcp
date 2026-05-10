import type { McpServerRequestExecutorResult } from "../../request/execution/request-executor.js";
import { buildWorkspacePreparationWorkflow } from "./mcp-workspace-preparation-workflow.js";
import { buildWorkspacePreparationEvidenceSummary } from "./mcp-workspace-preparation-summary.js";

export interface StructuredContentBudgetOptions {
  maxArrayItems: number;
  maxStringLength: number;
  maxDepth: number;
}

export interface PayloadBudgetStats {
  truncated: boolean;
  omittedArrayItems: number;
  truncatedStrings: number;
  depthLimitHits: number;
  circularReferences: number;
}

export type CompactPayload = (
  value: unknown,
  budget: StructuredContentBudgetOptions
) => { value: unknown; stats: PayloadBudgetStats };

export function buildStructuredWorkspacePreparation(
  result: McpServerRequestExecutorResult,
  budget: StructuredContentBudgetOptions,
  compactPayload: CompactPayload
): unknown {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
