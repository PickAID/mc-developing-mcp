import ts from "typescript";

import type { KubeJsDiagnostic } from "./types.js";

export function formatKubeJsDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
  maxDiagnostics = 20
): KubeJsDiagnostic[] {
  return diagnostics.slice(0, Math.max(0, maxDiagnostics)).map((diagnostic) => {
    const location =
      diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : undefined;

    return {
      filePath: diagnostic.file?.fileName ?? "",
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      code: diagnostic.code,
      category: ts.DiagnosticCategory[diagnostic.category] ?? "Unknown",
      line: location ? location.line + 1 : undefined,
      character: location ? location.character + 1 : undefined
    };
  });
}
