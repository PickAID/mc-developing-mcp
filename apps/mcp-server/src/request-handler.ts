import type {
  AgentRuntimeTaskRouteStep,
  AgentRuntimeToolName,
  McpServerRequestPlan
} from "@mcpskill/shared-types";
import type { DocsPackageSelectionResult } from "@mcpskill/docs-retrieval";

import type {
  McpServerEvidenceCandidate,
  McpServerEvidencePlan,
  McpServerEvidenceProvenance
} from "./evidence-plan.js";
import { buildMcpServerDocsSelection } from "./docs-selection.js";

export interface McpServerEvidenceExecutorInput {
  candidate: McpServerEvidenceCandidate;
  evidencePlan: McpServerEvidencePlan;
  requestPlan: McpServerRequestPlan;
  docsSelection?: DocsPackageSelectionResult;
}

export interface McpServerEvidenceExecutorResult {
  matched: boolean;
  summary: string;
  payload?: unknown;
}

export type McpServerEvidenceExecutor = (
  input: McpServerEvidenceExecutorInput
) =>
  | McpServerEvidenceExecutorResult
  | Promise<McpServerEvidenceExecutorResult>;

export interface McpServerRequestHandlerOptions {
  evidencePlan: McpServerEvidencePlan;
  executors: Partial<Record<AgentRuntimeToolName, McpServerEvidenceExecutor>>;
}

export type McpServerEvidenceExecutionStatus =
  | "selected"
  | "fallback"
  | "failed"
  | "skipped";

export interface McpServerEvidenceExecution {
  candidateId: string;
  routeStep: AgentRuntimeTaskRouteStep;
  provenance: McpServerEvidenceProvenance;
  preferredTool: AgentRuntimeToolName;
  tier: McpServerEvidenceCandidate["tier"];
  attempted: boolean;
  status: McpServerEvidenceExecutionStatus;
  summary: string;
  pathHints: string[];
  queryHint?: string;
  docsSelection?: DocsPackageSelectionResult;
  payload?: unknown;
  error?: string;
}

export interface McpServerRequestHandlerResult {
  appId: "mcp-server";
  requestPlan: McpServerRequestPlan;
  evidencePlan: McpServerEvidencePlan;
  executions: McpServerEvidenceExecution[];
  selectedEvidence?: McpServerEvidenceExecution;
  trace: {
    routeSteps: AgentRuntimeTaskRouteStep[];
    candidateIds: string[];
    executedCandidateIds: string[];
    failedCandidateIds: string[];
    skippedCandidateIds: string[];
    docsSelectionCandidateIds: string[];
    selectedDocsPackageIds: string[];
    selectedCandidateId?: string;
    fallbackUsed: boolean;
  };
}

export async function executeMcpServerRequestHandler(
  options: McpServerRequestHandlerOptions
): Promise<McpServerRequestHandlerResult> {
  const { evidencePlan, executors } = options;
  const executions: McpServerEvidenceExecution[] = [];
  let selectedEvidence: McpServerEvidenceExecution | undefined;

  for (const candidate of evidencePlan.candidates) {
    if (selectedEvidence) {
      executions.push(
        buildSkippedExecution(
          candidate,
          false,
          `Skipped because ${selectedEvidence.candidateId} already resolved the request.`
        )
      );
      continue;
    }

    const executor = executors[candidate.preferredTool];

    if (!executor) {
      executions.push(
        buildFailedExecution(
          candidate,
          false,
          `No executor registered for ${candidate.preferredTool}.`
        )
      );
      continue;
    }

    let docsSelection: DocsPackageSelectionResult | undefined;

    try {
      docsSelection = buildMcpServerDocsSelection(
        evidencePlan.requestPlan,
        candidate
      );
      const result = await executor({
        candidate,
        evidencePlan,
        requestPlan: evidencePlan.requestPlan,
        docsSelection
      });

      if (!result.matched) {
        executions.push(
          buildSkippedExecution(
            candidate,
            true,
            result.summary,
            result.payload,
            docsSelection
          )
        );
        continue;
      }

      const execution = buildMatchedExecution(candidate, result, docsSelection);
      executions.push(execution);
      selectedEvidence = execution;
    } catch (error) {
      executions.push(
        buildFailedExecution(
          candidate,
          true,
          `Executor failed for ${candidate.preferredTool}.`,
          undefined,
          toErrorMessage(error),
          docsSelection
        )
      );
    }
  }

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

function buildMatchedExecution(
  candidate: McpServerEvidenceCandidate,
  result: McpServerEvidenceExecutorResult,
  docsSelection?: DocsPackageSelectionResult
): McpServerEvidenceExecution {
  return {
    ...buildExecutionBase(candidate),
    attempted: true,
    status: candidate.tier === "fallback" ? "fallback" : "selected",
    summary: result.summary,
    docsSelection,
    payload: result.payload
  };
}

function buildSkippedExecution(
  candidate: McpServerEvidenceCandidate,
  attempted: boolean,
  summary: string,
  payload?: unknown,
  docsSelection?: DocsPackageSelectionResult
): McpServerEvidenceExecution {
  return {
    ...buildExecutionBase(candidate),
    attempted,
    status: "skipped",
    summary,
    docsSelection,
    payload
  };
}

function buildFailedExecution(
  candidate: McpServerEvidenceCandidate,
  attempted: boolean,
  summary: string,
  payload?: unknown,
  error?: string,
  docsSelection?: DocsPackageSelectionResult
): McpServerEvidenceExecution {
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

function buildExecutionBase(
  candidate: McpServerEvidenceCandidate
): Omit<
  McpServerEvidenceExecution,
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
