export function extractFtbQuestsErrorSummaries(payload: unknown): string[] {
  const signals = extractWorkspaceAnalyzeSignals(payload);

  if (!signals || !Array.isArray(signals.ftbQuestsErrors)) {
    return [];
  }

  return signals.ftbQuestsErrors
    .map((entry) =>
      isRecord(entry) && typeof entry.path === "string"
        ? formatFtbQuestsErrorSummary(entry)
        : undefined
    )
    .filter((value): value is string => value !== undefined);
}

function formatFtbQuestsErrorSummary(entry: Record<string, unknown>): string {
  return [
    typeof entry.kind === "string" ? entry.kind : "load_error",
    entry.path,
    typeof entry.message === "string" ? entry.message : undefined
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}

function extractWorkspaceAnalyzeSignals(
  payload: unknown
): Record<string, unknown> | undefined {
  if (!isRecord(payload) || payload.source !== "workspace_analyze") {
    return undefined;
  }

  return isRecord(payload.signals) ? payload.signals : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
