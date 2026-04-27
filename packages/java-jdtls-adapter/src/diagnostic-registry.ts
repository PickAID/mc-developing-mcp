import type {
  LspDiagnostic,
  LspPublishDiagnosticsParams
} from "./lsp-types.js";

export interface LspDiagnosticRegistryOptions {
  maxDiagnosticsPerFile?: number;
  maxTotalDiagnostics?: number;
}

export interface LspDiagnosticRegistry {
  publish(params: LspPublishDiagnosticsParams): void;
  snapshot(): LspPublishDiagnosticsParams[];
  drainPending(): LspPublishDiagnosticsParams[];
  clear(uri?: string): void;
}

const DEFAULT_MAX_DIAGNOSTICS_PER_FILE = 10;
const DEFAULT_MAX_TOTAL_DIAGNOSTICS = 30;

export function createLspDiagnosticRegistry(
  options: LspDiagnosticRegistryOptions = {}
): LspDiagnosticRegistry {
  const maxDiagnosticsPerFile =
    options.maxDiagnosticsPerFile ?? DEFAULT_MAX_DIAGNOSTICS_PER_FILE;
  const maxTotalDiagnostics =
    options.maxTotalDiagnostics ?? DEFAULT_MAX_TOTAL_DIAGNOSTICS;
  const byUri = new Map<string, LspDiagnostic[]>();
  const pendingUris = new Set<string>();

  return {
    publish(params) {
      byUri.set(
        params.uri,
        limitDiagnostics(dedupeDiagnostics(params.diagnostics), maxDiagnosticsPerFile)
      );
      pendingUris.add(params.uri);
      enforceTotalBudget(byUri, maxTotalDiagnostics);
    },

    snapshot() {
      return mapToSnapshot(byUri);
    },

    drainPending() {
      const result = mapToSnapshot(
        new Map([...byUri].filter(([uri]) => pendingUris.has(uri)))
      );
      pendingUris.clear();

      return result;
    },

    clear(uri) {
      if (uri) {
        byUri.delete(uri);
        pendingUris.delete(uri);
        return;
      }

      byUri.clear();
      pendingUris.clear();
    }
  };
}

function dedupeDiagnostics(diagnostics: LspDiagnostic[]): LspDiagnostic[] {
  const seen = new Set<string>();
  const result: LspDiagnostic[] = [];

  for (const diagnostic of diagnostics.sort(compareDiagnostics)) {
    const key = diagnosticKey(diagnostic);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(diagnostic);
  }

  return result;
}

function limitDiagnostics(
  diagnostics: LspDiagnostic[],
  maxDiagnostics: number
): LspDiagnostic[] {
  return diagnostics.sort(compareDiagnostics).slice(0, maxDiagnostics);
}

function enforceTotalBudget(
  byUri: Map<string, LspDiagnostic[]>,
  maxTotalDiagnostics: number
): void {
  let remaining = maxTotalDiagnostics;

  for (const uri of [...byUri.keys()].sort()) {
    const diagnostics = byUri.get(uri) ?? [];
    const kept = diagnostics.slice(0, Math.max(0, remaining));
    remaining -= kept.length;

    if (kept.length === 0) {
      byUri.delete(uri);
    } else {
      byUri.set(uri, kept);
    }
  }
}

function mapToSnapshot(
  byUri: Map<string, LspDiagnostic[]>
): LspPublishDiagnosticsParams[] {
  return [...byUri.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([uri, diagnostics]) => ({
      uri,
      diagnostics: [...diagnostics]
    }));
}

function compareDiagnostics(left: LspDiagnostic, right: LspDiagnostic): number {
  return (
    severityScore(left) - severityScore(right) ||
    (left.message ?? "").localeCompare(right.message ?? "")
  );
}

function severityScore(diagnostic: LspDiagnostic): number {
  return diagnostic.severity ?? 4;
}

function diagnosticKey(diagnostic: LspDiagnostic): string {
  return JSON.stringify({
    message: diagnostic.message,
    severity: diagnostic.severity,
    range: diagnostic.range,
    code: diagnostic.code,
    source: diagnostic.source
  });
}
