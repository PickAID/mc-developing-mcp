import type {
  McpServerEvidenceCandidate,
  McpServerEvidencePlan
} from "../evidence/evidence-plan.js";
import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";
import { extractFtbQuestsErrorSummaries } from "./request-execution-ftb-context.js";
import { buildContextTexts } from "./request-execution-context-text.js";
import {
  extractActionableClassReferences,
  extractCrashLogContextQueries,
  extractJavaDiagnosticSourcePaths,
  extractJavaDiagnosticSummaries,
  extractLoaderDependencySummaries,
  extractLoaderModIds,
  extractMixinTargetClassReferences,
  extractResourceLocations,
  extractResourcePaths
} from "./request-execution-extractors.js";

export interface RequestExecutionContext {
  classReferences: string[];
  mixinTargetClassReferences: string[];
  resourceLocations: string[];
  resourcePaths: string[];
  loaderModIds: string[];
  loaderDependencySummaries: string[];
  ftbQuestsErrorSummaries: string[];
  javaDiagnostics: string[];
  javaSourcePaths: string[];
}

export function createRequestExecutionContext(): RequestExecutionContext {
  return {
    classReferences: [],
    mixinTargetClassReferences: [],
    resourceLocations: [],
    resourcePaths: [],
    loaderModIds: [],
    loaderDependencySummaries: [],
    ftbQuestsErrorSummaries: [],
    javaDiagnostics: [],
    javaSourcePaths: []
  };
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
  if (!hasLaterCandidate(evidencePlan, candidate)) {
    return false;
  }

  if (candidate.routeStep === "log_files") {
    return extractCrashLogContextQueries(result.payload).length > 0;
  }

  if (candidate.routeStep === "java_diagnostics") {
    return extractJavaDiagnosticSummaries(result.payload).length > 0;
  }

  if (candidate.routeStep === "source_acquisition_plan") {
    return (
      evidencePlan.requestPlan.trace.taskIntent.id !== "workspace_preparation" ||
      mentionsDocsLookup(evidencePlan.requestPlan.requestText)
    );
  }

  return false;
}

function mentionsDocsLookup(requestText: string | undefined): boolean {
  return /docs?|documentation|guide|guidance|reference|explain|文档|说明|参考/u.test(
    requestText ?? ""
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
  context.resourceLocations = unique([
    ...context.resourceLocations,
    ...extractResourceLocations(payload)
  ]);
  context.mixinTargetClassReferences = unique([
    ...context.mixinTargetClassReferences,
    ...extractMixinTargetClassReferences(payload)
  ]);
  context.resourcePaths = unique([
    ...context.resourcePaths,
    ...extractResourcePaths(payload)
  ]);
  context.loaderModIds = unique([
    ...context.loaderModIds,
    ...extractLoaderModIds(payload)
  ]);
  context.loaderDependencySummaries = unique([
    ...context.loaderDependencySummaries,
    ...extractLoaderDependencySummaries(payload)
  ]);
  context.ftbQuestsErrorSummaries = unique([
    ...context.ftbQuestsErrorSummaries,
    ...extractFtbQuestsErrorSummaries(payload)
  ]);
  context.javaDiagnostics = unique([
    ...context.javaDiagnostics,
    ...extractJavaDiagnosticSummaries(payload)
  ]);
  context.javaSourcePaths = unique([
    ...context.javaSourcePaths,
    ...extractJavaDiagnosticSourcePaths(payload)
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
  const contextTexts = buildContextTexts(context);

  if (contextTexts.length === 0) {
    return requestText;
  }

  const contextText = contextTexts.join("\n");
  if (!requestText) {
    return contextText;
  }
  if (contextTexts.every((text) => requestText.includes(text))) {
    return requestText;
  }

  return `${requestText}\n${contextText}`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
