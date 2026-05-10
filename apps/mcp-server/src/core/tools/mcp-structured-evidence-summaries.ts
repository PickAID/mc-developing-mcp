import type { McpServerRequestExecutorResult } from "../../request/execution/request-executor.js";

export interface StructuredEvidenceSummaryBudget {
  maxArrayItems: number;
  maxStringLength: number;
  maxDepth: number;
}

export interface StructuredEvidenceSummaryCompactPayload {
  (value: unknown, budget: StructuredEvidenceSummaryBudget): { value: unknown };
}

export function buildKubeJsQualitySummary(
  result: McpServerRequestExecutorResult,
  budget: StructuredEvidenceSummaryBudget,
  compactPayload: StructuredEvidenceSummaryCompactPayload
) {
  const selected = kubeJsQualityFromExecution(result.selectedEvidence);
  const fallback = selected
    ? undefined
    : result.executions.map(kubeJsQualityFromExecution).find((entry) => entry);
  const entry = selected ?? fallback;
  if (!entry) {
    return undefined;
  }

  const firstIssue = arrayOfRecords(entry.quality.issues)[0];
  const summary = {
    source: entry.source,
    candidateId: entry.candidateId,
    issueCount: numberValue(entry.quality.issueCount),
    severityCounts: isRecord(entry.quality.severityCounts)
      ? entry.quality.severityCounts
      : undefined,
    firstIssue: firstIssue
      ? {
          kind: optionalString(firstIssue.kind),
          severity: optionalString(firstIssue.severity),
          file: optionalString(firstIssue.file),
          line: numberValue(firstIssue.line)
        }
      : undefined
  };

  return compactPayload(summary, budget).value;
}

export function buildClientVisualVerifierSummary(
  result: McpServerRequestExecutorResult,
  budget: StructuredEvidenceSummaryBudget,
  compactPayload: StructuredEvidenceSummaryCompactPayload
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

export function buildJavaDiagnosticsSummary(
  result: McpServerRequestExecutorResult,
  budget: StructuredEvidenceSummaryBudget,
  compactPayload: StructuredEvidenceSummaryCompactPayload
) {
  const entry = result.executions.map(javaDiagnosticsFromExecution).find(Boolean);
  if (!entry) {
    return undefined;
  }

  const firstFile = arrayOfRecords(entry.payload.files)[0];
  const firstDiagnostic = arrayOfRecords(firstFile?.diagnostics)[0];
  const range = isRecord(firstDiagnostic?.range) ? firstDiagnostic.range : undefined;
  const start = isRecord(range?.start) ? range.start : undefined;
  const line = numberValue(start?.line);
  const character = numberValue(start?.character);
  const summary = {
    source: entry.source,
    candidateId: entry.candidateId,
    totalDiagnostics: numberValue(entry.payload.totalDiagnostics),
    fileCount: arrayOfRecords(entry.payload.files).length,
    firstDiagnostic: firstDiagnostic
      ? {
          file: optionalString(firstFile?.relativePath),
          line: line !== undefined ? line + 1 : undefined,
          character: character !== undefined ? character + 1 : undefined,
          message: optionalString(firstDiagnostic.message)
        }
      : undefined
  };

  return compactPayload(summary, budget).value;
}

function kubeJsQualityFromExecution(
  execution: McpServerRequestExecutorResult["executions"][number] | undefined
) {
  const payload = isRecord(execution?.payload) ? execution.payload : undefined;
  const quality = isRecord(payload?.scriptQualityEvidence)
    ? payload.scriptQualityEvidence
    : undefined;
  if (!execution || !quality) {
    return undefined;
  }

  return {
    source: execution.status === "selected" ? "selectedEvidence" : "execution",
    candidateId: execution.candidateId,
    quality
  };
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

function javaDiagnosticsFromExecution(
  execution: McpServerRequestExecutorResult["executions"][number]
) {
  const payload = isRecord(execution.payload) ? execution.payload : undefined;
  if (payload?.mode !== "java_diagnostics") {
    return undefined;
  }

  return {
    source: execution.status === "selected" ? "selectedEvidence" : "execution",
    candidateId: execution.candidateId,
    payload
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

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
