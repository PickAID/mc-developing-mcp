import { extractFtbQuestsErrorSummaries } from "./request-execution-ftb-context.js";

export function extractCrashLogContextQueries(payload: unknown): string[] {
  return [
    ...extractActionableClassReferences(payload),
    ...extractMixinTargetClassReferences(payload),
    ...extractResourceLocations(payload),
    ...extractResourcePaths(payload),
    ...extractLoaderModIds(payload),
    ...extractFtbQuestsErrorSummaries(payload)
  ];
}

export function extractActionableClassReferences(payload: unknown): string[] {
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

export function extractMixinTargetClassReferences(payload: unknown): string[] {
  const signals = extractWorkspaceAnalyzeSignals(payload);

  if (!signals || !Array.isArray(signals.mixinTargetClassReferences)) {
    return [];
  }

  return signals.mixinTargetClassReferences.filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
}

export function extractResourceLocations(payload: unknown): string[] {
  const signals = extractWorkspaceAnalyzeSignals(payload);

  if (!signals || !Array.isArray(signals.resourceLocations)) {
    return [];
  }

  return signals.resourceLocations.filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
}

export function extractResourcePaths(payload: unknown): string[] {
  const signals = extractWorkspaceAnalyzeSignals(payload);

  if (!signals || !Array.isArray(signals.resourcePaths)) {
    return [];
  }

  return signals.resourcePaths.filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
}

export function extractLoaderModIds(payload: unknown): string[] {
  const signals = extractWorkspaceAnalyzeSignals(payload);

  if (!signals) {
    return [];
  }
  if (!Array.isArray(signals.loaderModReferences)) {
    return Array.isArray(signals.loaderModIds)
      ? signals.loaderModIds.filter(isNonEmptyString)
      : [];
  }

  return unique(
    [
      ...(Array.isArray(signals.loaderModIds)
        ? signals.loaderModIds.filter(isNonEmptyString)
        : []),
      ...signals.loaderModReferences
        .map((reference) =>
          isRecord(reference) && typeof reference.modId === "string"
            ? reference.modId
            : undefined
        )
        .filter(isNonEmptyString)
    ]
  );
}

export function extractLoaderDependencySummaries(payload: unknown): string[] {
  const signals = extractWorkspaceAnalyzeSignals(payload);

  if (!signals || !Array.isArray(signals.loaderModReferences)) {
    return [];
  }

  return signals.loaderModReferences
    .map((reference) =>
      isRecord(reference) && typeof reference.modId === "string"
        ? formatLoaderDependencySummary(reference)
        : undefined
    )
    .filter((value): value is string => value !== undefined);
}

export function extractJavaDiagnosticSummaries(payload: unknown): string[] {
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

export function extractJavaDiagnosticSourcePaths(payload: unknown): string[] {
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
      isRecord(file) ? extractDiagnosticSourcePath(file) : undefined
    )
    .filter((value): value is string => value !== undefined);
}

function formatLoaderDependencySummary(
  reference: Record<string, unknown>
): string {
  return [
    `modId=${reference.modId}`,
    typeof reference.requestedBy === "string"
      ? `requestedBy=${reference.requestedBy}`
      : undefined,
    typeof reference.expectedRange === "string"
      ? `expected=${reference.expectedRange}`
      : undefined,
    typeof reference.actualVersion === "string"
      ? `actual=${reference.actualVersion}`
      : undefined,
    typeof reference.kind === "string" ? `kind=${reference.kind}` : undefined
  ]
    .filter((value): value is string => value !== undefined)
    .join("; ");
}

function extractWorkspaceAnalyzeSignals(
  payload: unknown
): Record<string, unknown> | undefined {
  if (!isRecord(payload) || payload.source !== "workspace_analyze") {
    return undefined;
  }

  return isRecord(payload.signals) ? payload.signals : undefined;
}

function extractDiagnosticSourcePath(
  file: Record<string, unknown>
): string | undefined {
  const relativePath = file.relativePath;
  if (typeof relativePath === "string" && relativePath.length > 0) {
    return relativePath;
  }

  return formatDiagnosticSourcePath(file.uri);
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

  if (uri.startsWith("file://")) {
    return uri;
  }

  return extractKnownJavaSourcePath(decoded);
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
