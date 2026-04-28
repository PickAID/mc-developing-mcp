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
  drainPending(
    filter?: (params: LspPublishDiagnosticsParams) => boolean
  ): LspPublishDiagnosticsParams[];
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
  const byUri = new Map<string, StoredDiagnostics>();
  const pendingUris = new Set<string>();

  return {
    publish(params) {
      const dedupedDiagnostics = dedupeDiagnostics(params.diagnostics);
      const diagnostics = limitDiagnostics(
        dedupedDiagnostics,
        maxDiagnosticsPerFile
      );

      byUri.set(params.uri, {
        diagnostics,
        originalDiagnosticCount: dedupedDiagnostics.length,
        omittedDiagnosticCount: Math.max(
          0,
          dedupedDiagnostics.length - diagnostics.length
        )
      });
      pendingUris.add(params.uri);
      enforceTotalBudget(byUri, maxTotalDiagnostics);
    },

    snapshot() {
      return mapToSnapshot(byUri);
    },

    drainPending(filter) {
      const pending = mapToSnapshot(
        new Map([...byUri].filter(([uri]) => pendingUris.has(uri)))
      );
      const result = filter ? pending.filter(filter) : pending;

      if (filter) {
        for (const entry of result) {
          pendingUris.delete(entry.uri);
        }
      } else {
        pendingUris.clear();
      }

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
  byUri: Map<string, StoredDiagnostics>,
  maxTotalDiagnostics: number
): void {
  let remaining = maxTotalDiagnostics;

  for (const uri of [...byUri.keys()].sort()) {
    const entry = byUri.get(uri);
    if (!entry) {
      continue;
    }

    const kept = entry.diagnostics.slice(0, Math.max(0, remaining));
    remaining -= kept.length;

    if (kept.length === 0) {
      byUri.delete(uri);
    } else {
      byUri.set(uri, {
        ...entry,
        diagnostics: kept,
        omittedDiagnosticCount:
          entry.omittedDiagnosticCount + entry.diagnostics.length - kept.length
      });
    }
  }
}

function mapToSnapshot(
  byUri: Map<string, StoredDiagnostics>
): LspPublishDiagnosticsParams[] {
  return [...byUri.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([uri, entry]) => ({
      uri,
      diagnostics: [...entry.diagnostics],
      ...(entry.omittedDiagnosticCount > 0
        ? {
            truncated: true,
            originalDiagnosticCount: entry.originalDiagnosticCount,
            omittedDiagnosticCount: entry.omittedDiagnosticCount
          }
        : {})
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

interface StoredDiagnostics {
  diagnostics: LspDiagnostic[];
  originalDiagnosticCount: number;
  omittedDiagnosticCount: number;
}
