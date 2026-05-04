export interface McpServerExternalModLoaderDependency {
  modId: string;
  requestedBy?: string;
  expectedRange?: string;
  actualVersion?: string;
  kind: "missing_dependency" | "incompatible_dependency";
}

export function extractCrashLoaderModQuery(
  requestText: string
): string | undefined {
  const match = requestText.match(
    /^Crash log loader mod ids:\s*([A-Za-z0-9_.-]+(?:\s*,\s*[A-Za-z0-9_.-]+)*)/im
  );
  const firstModId = match?.[1]?.split(",")[0]?.trim().toLowerCase();

  return firstModId && firstModId.length > 0 ? firstModId : undefined;
}

export function extractCrashLoaderDependency(
  requestText: string
): McpServerExternalModLoaderDependency | undefined {
  const summary = requestText.match(
    /^Crash log loader dependency:\s*(.+)$/im
  )?.[1];
  if (!summary) {
    return undefined;
  }

  const fields = parseSemicolonFields(summary);
  const modId = fields.get("modid");
  const kind = normalizeLoaderDependencyKind(fields.get("kind"));

  if (!modId || !kind) {
    return undefined;
  }

  return {
    modId: modId.toLowerCase(),
    requestedBy: fields.get("requestedby"),
    expectedRange: fields.get("expected") ?? fields.get("expectedrange"),
    actualVersion: fields.get("actual") ?? fields.get("actualversion"),
    kind
  };
}

function parseSemicolonFields(input: string): Map<string, string> {
  const fields = new Map<string, string>();

  for (const segment of input.split(";")) {
    const separatorIndex = segment.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = segment.slice(0, separatorIndex).trim().toLowerCase();
    const value = segment.slice(separatorIndex + 1).trim();
    if (key && value) {
      fields.set(key, value);
    }
  }

  return fields;
}

function normalizeLoaderDependencyKind(
  value: string | undefined
): McpServerExternalModLoaderDependency["kind"] | undefined {
  if (value === "missing_dependency" || value === "incompatible_dependency") {
    return value;
  }

  return undefined;
}
