import { describe, expect, it } from "vitest";

import { createLspDiagnosticRegistry } from "./diagnostic-registry.js";

describe("createLspDiagnosticRegistry", () => {
  it("replaces diagnostics per URI, dedupes identical entries, and drains pending once", () => {
    const registry = createLspDiagnosticRegistry({
      maxDiagnosticsPerFile: 10,
      maxTotalDiagnostics: 30
    });

    registry.publish({
      uri: "file:///workspace/A.java",
      diagnostics: [
        diagnostic("first", 2),
        diagnostic("first", 2),
        diagnostic("second", 1)
      ]
    });

    expect(registry.snapshot()).toEqual([
      {
        uri: "file:///workspace/A.java",
        diagnostics: [diagnostic("second", 1), diagnostic("first", 2)]
      }
    ]);
    expect(registry.drainPending()).toHaveLength(1);
    expect(registry.drainPending()).toEqual([]);

    registry.publish({
      uri: "file:///workspace/A.java",
      diagnostics: [diagnostic("replacement", 1)]
    });

    expect(registry.snapshot()).toEqual([
      {
        uri: "file:///workspace/A.java",
        diagnostics: [diagnostic("replacement", 1)]
      }
    ]);
    expect(registry.drainPending()).toEqual([
      {
        uri: "file:///workspace/A.java",
        diagnostics: [diagnostic("replacement", 1)]
      }
    ]);
  });

  it("enforces per-file and total diagnostic budgets by severity", () => {
    const registry = createLspDiagnosticRegistry({
      maxDiagnosticsPerFile: 2,
      maxTotalDiagnostics: 3
    });

    registry.publish({
      uri: "file:///workspace/A.java",
      diagnostics: [
        diagnostic("info", 3),
        diagnostic("error", 1),
        diagnostic("warning", 2)
      ]
    });
    registry.publish({
      uri: "file:///workspace/B.java",
      diagnostics: [diagnostic("b-error", 1), diagnostic("b-warning", 2)]
    });

    expect(registry.snapshot()).toEqual([
      {
        uri: "file:///workspace/A.java",
        truncated: true,
        originalDiagnosticCount: 3,
        omittedDiagnosticCount: 1,
        diagnostics: [diagnostic("error", 1), diagnostic("warning", 2)]
      },
      {
        uri: "file:///workspace/B.java",
        truncated: true,
        originalDiagnosticCount: 2,
        omittedDiagnosticCount: 1,
        diagnostics: [diagnostic("b-error", 1)]
      }
    ]);
  });

  it("can drain only pending diagnostics accepted by a filter", () => {
    const registry = createLspDiagnosticRegistry();

    registry.publish({
      uri: "file:///workspace-a/A.java",
      diagnostics: [diagnostic("a-error", 1)]
    });
    registry.publish({
      uri: "file:///workspace-b/B.java",
      diagnostics: [diagnostic("b-error", 1)]
    });

    expect(
      registry.drainPending((entry) => entry.uri.includes("workspace-a"))
    ).toEqual([
      {
        uri: "file:///workspace-a/A.java",
        diagnostics: [diagnostic("a-error", 1)]
      }
    ]);
    expect(registry.drainPending()).toEqual([
      {
        uri: "file:///workspace-b/B.java",
        diagnostics: [diagnostic("b-error", 1)]
      }
    ]);
  });
});

function diagnostic(message: string, severity: number) {
  return {
    message,
    severity,
    range: {
      start: { line: severity, character: 0 },
      end: { line: severity, character: 1 }
    }
  };
}
