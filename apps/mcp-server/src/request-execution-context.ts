import type {
  McpServerEvidenceCandidate,
  McpServerEvidencePlan
} from "./evidence-plan.js";
import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";

export interface RequestExecutionContext {
  classReferences: string[];
}

export function createRequestExecutionContext(): RequestExecutionContext {
  return { classReferences: [] };
}

export function prepareExecutorInput(
  evidencePlan: McpServerEvidencePlan,
  candidate: McpServerEvidenceCandidate,
  context: RequestExecutionContext
): Omit<McpServerEvidenceExecutorInput, "docsSelection"> {
  const requestText = enrichRequestText(
    evidencePlan.requestPlan.requestText,
    context
  );
  const requestPlan =
    requestText === evidencePlan.requestPlan.requestText
      ? evidencePlan.requestPlan
      : { ...evidencePlan.requestPlan, requestText };
  const queryHint = enrichRequestText(candidate.queryHint, context);
  const preparedCandidate =
    queryHint === candidate.queryHint ? candidate : { ...candidate, queryHint };

  return {
    candidate: preparedCandidate,
    evidencePlan: { ...evidencePlan, requestPlan },
    requestPlan
  };
}

export function shouldUseAsContext(
  candidate: McpServerEvidenceCandidate,
  result: McpServerEvidenceExecutorResult,
  evidencePlan: McpServerEvidencePlan
): boolean {
  return (
    candidate.routeStep === "log_files" &&
    extractActionableClassReferences(result.payload).length > 0 &&
    hasLaterCandidate(evidencePlan, candidate)
  );
}

export function rememberContext(
  payload: unknown,
  context: RequestExecutionContext
): void {
  context.classReferences = unique([
    ...context.classReferences,
    ...extractActionableClassReferences(payload)
  ]);
}

function hasLaterCandidate(
  evidencePlan: McpServerEvidencePlan,
  candidate: McpServerEvidenceCandidate
): boolean {
  return evidencePlan.candidates.some(
    (entry) => entry.priority > candidate.priority
  );
}

function enrichRequestText(
  requestText: string | undefined,
  context: RequestExecutionContext
): string | undefined {
  if (context.classReferences.length === 0) {
    return requestText;
  }

  const contextText = `Crash log class references: ${context.classReferences.join(", ")}`;
  if (!requestText) {
    return contextText;
  }
  if (context.classReferences.every((className) => requestText.includes(className))) {
    return requestText;
  }

  return `${requestText}\n${contextText}`;
}

function extractActionableClassReferences(payload: unknown): string[] {
  if (!isRecord(payload) || payload.source !== "workspace_analyze") {
    return [];
  }

  const signals = payload.signals;
  if (!isRecord(signals) || !Array.isArray(signals.actionableClassReferences)) {
    return [];
  }

  return signals.actionableClassReferences.filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
