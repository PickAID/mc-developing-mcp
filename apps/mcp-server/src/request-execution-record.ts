import type {
  AgentRuntimeTaskRouteStep,
  McpServerRequestPlan
} from "@mcpskill/shared-types";
import type { DocsPackageSelectionResult } from "@mcpskill/docs-retrieval";

import type {
  McpServerEvidenceCandidate,
  McpServerEvidencePlan
} from "./evidence-plan.js";
import type {
  McpServerEvidenceExecution,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";

export type McpServerRequestExecutionStatus =
  | McpServerEvidenceExecution["status"]
  | "context";

export interface McpServerRequestExecution
  extends Omit<McpServerEvidenceExecution, "status"> {
  status: McpServerRequestExecutionStatus;
}

export interface McpServerRequestExecutorResult {
  appId: "mcp-server";
  requestPlan: McpServerRequestPlan;
  evidencePlan: McpServerEvidencePlan;
  executions: McpServerRequestExecution[];
  selectedEvidence?: McpServerRequestExecution;
  trace: {
    routeSteps: AgentRuntimeTaskRouteStep[];
    candidateIds: string[];
    executedCandidateIds: string[];
    contextCandidateIds: string[];
    failedCandidateIds: string[];
    skippedCandidateIds: string[];
    docsSelectionCandidateIds: string[];
    selectedDocsPackageIds: string[];
    selectedCandidateId?: string;
    fallbackUsed: boolean;
  };
}

export function buildSelectedExecution(
  candidate: McpServerEvidenceCandidate,
  result: McpServerEvidenceExecutorResult,
  docsSelection?: DocsPackageSelectionResult
): McpServerRequestExecution {
  return {
    ...buildExecutionBase(candidate),
    attempted: true,
    status: candidate.tier === "fallback" ? "fallback" : "selected",
    summary: result.summary,
    docsSelection,
    payload: result.payload
  };
}

export function buildContextExecution(
  candidate: McpServerEvidenceCandidate,
  result: McpServerEvidenceExecutorResult,
  docsSelection?: DocsPackageSelectionResult
): McpServerRequestExecution {
  return {
    ...buildExecutionBase(candidate),
    attempted: true,
    status: "context",
    summary: result.summary,
    docsSelection,
    payload: result.payload
  };
}

export function buildSkippedExecution(
  candidate: McpServerEvidenceCandidate,
  attempted: boolean,
  summary: string,
  payload?: unknown,
  docsSelection?: DocsPackageSelectionResult
): McpServerRequestExecution {
  return {
    ...buildExecutionBase(candidate),
    attempted,
    status: "skipped",
    summary,
    docsSelection,
    payload
  };
}

export function buildFailedExecution(
  candidate: McpServerEvidenceCandidate,
  attempted: boolean,
  summary: string,
  payload?: unknown,
  error?: string,
  docsSelection?: DocsPackageSelectionResult
): McpServerRequestExecution {
  return {
    ...buildExecutionBase(candidate),
    attempted,
    status: "failed",
    summary,
    docsSelection,
    payload,
    error
  };
}

export function buildRequestResult(
  evidencePlan: McpServerEvidencePlan,
  executions: McpServerRequestExecution[],
  selectedEvidence?: McpServerRequestExecution
): McpServerRequestExecutorResult {
  return {
    appId: "mcp-server",
    requestPlan: evidencePlan.requestPlan,
    evidencePlan,
    executions,
    selectedEvidence,
    trace: {
      routeSteps: [...evidencePlan.trace.routeSteps],
      candidateIds: [...evidencePlan.trace.candidateIds],
      executedCandidateIds: executions
        .filter((execution) => execution.attempted)
        .map((execution) => execution.candidateId),
      contextCandidateIds: executions
        .filter((execution) => execution.status === "context")
        .map((execution) => execution.candidateId),
      failedCandidateIds: executions
        .filter((execution) => execution.status === "failed")
        .map((execution) => execution.candidateId),
      skippedCandidateIds: executions
        .filter((execution) => execution.status === "skipped")
        .map((execution) => execution.candidateId),
      docsSelectionCandidateIds: executions
        .filter((execution) => execution.docsSelection !== undefined)
        .map((execution) => execution.candidateId),
      selectedDocsPackageIds:
        selectedEvidence?.docsSelection?.selections.map(
          (selection) => selection.packageId
        ) ?? [],
      selectedCandidateId: selectedEvidence?.candidateId,
      fallbackUsed: selectedEvidence?.status === "fallback"
    }
  };
}

function buildExecutionBase(
  candidate: McpServerEvidenceCandidate
): Omit<
  McpServerRequestExecution,
  "attempted" | "status" | "summary" | "payload" | "error"
> {
  return {
    candidateId: candidate.id,
    routeStep: candidate.routeStep,
    provenance: candidate.provenance,
    preferredTool: candidate.preferredTool,
    tier: candidate.tier,
    pathHints: [...candidate.pathHints],
    queryHint: candidate.queryHint
  };
}
