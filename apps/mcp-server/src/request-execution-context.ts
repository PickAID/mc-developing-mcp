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
  javaDiagnostics: string[];
  javaSourcePaths: string[];
}

export function createRequestExecutionContext(): RequestExecutionContext {
  return { classReferences: [], javaDiagnostics: [], javaSourcePaths: [] };
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
    return extractActionableClassReferences(result.payload).length > 0;
  }

  if (candidate.routeStep === "java_diagnostics") {
    return extractJavaDiagnosticSummaries(result.payload).length > 0;
  }

  return false;
}

export function rememberContext(
  payload: unknown,
  context: RequestExecutionContext
): void {
  context.classReferences = unique([
    ...context.classReferences,
    ...extractActionableClassReferences(payload)
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

function buildContextTexts(context: RequestExecutionContext): string[] {
  return [
    ...(context.classReferences.length > 0
      ? [`Crash log class references: ${context.classReferences.join(", ")}`]
      : []),
    ...(context.javaDiagnostics.length > 0
      ? [`Java diagnostics: ${context.javaDiagnostics.join("; ")}`]
      : []),
    ...(context.javaSourcePaths.length > 0
      ? [`Java diagnostic source files: ${context.javaSourcePaths.join(", ")}`]
      : [])
  ];
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

function extractJavaDiagnosticSummaries(payload: unknown): string[] {
  if (
    !isRecord(payload) ||
    payload.source !== "workspace_analyze" ||
    payload.mode !== "java_diagnostics" ||
    !Array.isArray(payload.files)
  ) {
    return [];
  }

  return payload.files.flatMap((file) => {
    if (!isRecord(file) || !Array.isArray(file.diagnostics)) {
      return [];
    }

    const fileName = extractFileName(file.uri);

    return file.diagnostics
      .map((diagnostic) =>
        isRecord(diagnostic)
          ? formatDiagnosticSummary(fileName, diagnostic)
          : undefined
      )
      .filter((value): value is string => value !== undefined);
  });
}

function extractJavaDiagnosticSourcePaths(payload: unknown): string[] {
  if (
    !isRecord(payload) ||
    payload.source !== "workspace_analyze" ||
    payload.mode !== "java_diagnostics" ||
    !Array.isArray(payload.files)
  ) {
    return [];
  }

  return payload.files
    .map((file) =>
      isRecord(file) ? formatDiagnosticSourcePath(file.uri) : undefined
    )
    .filter((value): value is string => value !== undefined);
}

function formatDiagnosticSummary(
  fileName: string,
  diagnostic: Record<string, unknown>
): string | undefined {
  const message = diagnostic.message;
  if (typeof message !== "string" || message.length === 0) {
    return undefined;
  }

  const line =
    typeof diagnostic.line === "number" ? String(diagnostic.line) : "?";
  const character =
    typeof diagnostic.character === "number"
      ? String(diagnostic.character)
      : "?";

  return `${fileName}:${line}:${character} ${message}`;
}

function extractFileName(uri: unknown): string {
  if (typeof uri !== "string" || uri.length === 0) {
    return "unknown";
  }

  const rawName = uri.split("/").filter(Boolean).at(-1) ?? uri;

  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
}

function formatDiagnosticSourcePath(uri: unknown): string | undefined {
  if (typeof uri !== "string" || uri.length === 0) {
    return undefined;
  }

  const decoded = decodeUri(uri);
  const sourcePath = extractKnownJavaSourcePath(decoded);

  return sourcePath ?? (uri.startsWith("file://") ? uri : undefined);
}

function decodeUri(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}

function extractKnownJavaSourcePath(value: string): string | undefined {
  const normalized = value.replaceAll("\\", "/");
  const markers = ["/src/main/java/", "/src/test/java/"];

  for (const marker of markers) {
    const index = normalized.indexOf(marker);
    if (index >= 0) {
      return `${marker.slice(1)}${normalized.slice(index + marker.length)}`;
    }
  }

  return undefined;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
