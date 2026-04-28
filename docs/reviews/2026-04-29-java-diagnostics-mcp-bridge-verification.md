# Java Diagnostics MCP Bridge Verification
Date: 2026-04-29
Author: m1hono
Scope: `apps/mcp-server`, `packages/agent-harness`, `packages/java-jdtls-adapter`, `packages/shared-types`

## Change
Java compile or diagnostic requests now route through pending Java LSP diagnostics before falling back to source and docs.

The public MCP surface remains progressive and minimal:

- One exposed MCP tool: `mc_develop`
- New internal route step: `java_diagnostics`
- New internal intent: `java_diagnostics`
- Diagnostics are collected through `@mcpskill/java-jdtls-adapter` and passed into `workspace.analyze`
- A diagnostics hit is recorded as context evidence, not terminal evidence, so later source/docs candidates can use the diagnostic summary
- Diagnostic source file paths are injected into later candidates, so `workspace_source` can resolve the file even when the user only says `cannot resolve symbol RegistryObject`

This keeps JDTLS output useful for Java modding without exposing another top-level MCP method.

## Review Corrections
A subagent review found three issues before this final pass. They were fixed before the verification below:

- Pending diagnostics are drained only for file URIs inside the active workspace root. Nonmatching pending diagnostics remain in the registry for their own workspace.
- Diagnostic context now carries source file paths as well as human-readable summaries. This avoids relying on the user to mention a fully qualified class name.
- Per-file and top-level diagnostic payloads now report registry truncation instead of hardcoding `truncated: false`.

Direct stdio startup still requires a host/runtime integration to attach and populate a live JDTLS diagnostic registry. This slice wires the MCP bridge and host injection path without adding another public MCP tool.

## Regression Coverage
Targeted command:

```bash
pnpm exec tsc -b packages/java-jdtls-adapter apps/mcp-server --pretty false
pnpm exec vitest run packages/java-jdtls-adapter/src/diagnostic-registry.test.ts packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts apps/mcp-server/src/evidence-plan.test.ts apps/mcp-server/src/workspace-analyze-executor.test.ts apps/mcp-server/src/source-bundle-workspace-executor.test.ts apps/mcp-server/src/request-executor.test.ts apps/mcp-server/src/mcp-tools.test.ts apps/mcp-server/src/mcp-structured-content.test.ts
```

Fresh result:

```text
Test Files  9 passed (9)
Tests       33 passed (33)
```

Covered behavior:

- Java compile/diagnostic wording is detected only when the workspace has Java or Gradle signals.
- Route order is `java_diagnostics -> workspace_source -> docs_lookup`.
- Evidence planning builds `candidate-1-java_diagnostics` with `workspace.analyze`.
- `workspace.analyze` drains only pending JDTLS diagnostics inside the active workspace.
- Request execution treats diagnostic evidence as context and injects summaries plus source paths into later candidate query text.
- `workspace_source` reads Java files requested by diagnostic source paths.
- The top-level `mc_develop` tool accepts an attached diagnostic registry without adding another public tool.
- `structuredContent` omits undefined payload fields instead of stringifying them as `"undefined"`.

## Real MCP Return Value
Command:

```bash
pnpm exec tsx tmp/java-diagnostics-mcp-real-output.ts
```

Fresh output excerpt:

```json
{
  "text": {
    "type": "text",
    "text": "Selected: candidate-2-workspace_source (workspace_source, source.bundle)\nRoute: java_diagnostics -> workspace_source -> docs_lookup\nExecuted: candidate-1-java_diagnostics, candidate-2-workspace_source\nContext: candidate-1-java_diagnostics\nSummary: Resolved 1 local workspace source file(s)."
  },
  "structuredContent": {
    "trace": {
      "routeSteps": [
        "java_diagnostics",
        "workspace_source",
        "docs_lookup"
      ],
      "executedCandidateIds": [
        "candidate-1-java_diagnostics",
        "candidate-2-workspace_source"
      ],
      "contextCandidateIds": [
        "candidate-1-java_diagnostics"
      ],
      "selectedCandidateId": "candidate-2-workspace_source",
      "fallbackUsed": false
    },
    "budget": {
      "payloadPolicy": "bounded",
      "maxArrayItems": 20,
      "maxStringLength": 4000,
      "maxDepth": 8,
      "truncatedExecutionIds": []
    },
    "executions": [
      {
        "candidateId": "candidate-1-java_diagnostics",
        "routeStep": "java_diagnostics",
        "preferredTool": "workspace.analyze",
        "status": "context",
        "summary": "Drained 1 pending Java LSP diagnostic(s) from 1 file(s).",
        "payload": {
          "source": "workspace_analyze",
          "mode": "java_diagnostics",
          "totalDiagnostics": 1,
          "files": [
            {
              "uri": "file:///var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-java-diag-tool-PL91jo/src/main/java/example/Broken.java",
              "diagnosticCount": 1,
              "diagnostics": [
                {
                  "message": "RegistryObject cannot be resolved to a type",
                  "severity": "error",
                  "line": 12,
                  "character": 5,
                  "source": "jdtls"
                }
              ],
              "truncated": false
            }
          ],
          "truncated": false
        }
      },
      {
        "candidateId": "candidate-2-workspace_source",
        "routeStep": "workspace_source",
        "preferredTool": "source.bundle",
        "status": "selected",
        "summary": "Resolved 1 local workspace source file(s).",
        "payload": {
          "source": "workspace_source",
          "mode": "local_files",
          "references": [
            {
              "kind": "java",
              "symbol": "example.Broken",
              "relativePath": "src/main/java/example/Broken.java"
            }
          ],
          "truncated": false
        }
      }
    ]
  }
}
```

The real output shows the diagnostic candidate is used as context, the source candidate is selected afterward, and no payload field is serialized as `"undefined"`.

The request text used for this run was only:

```text
Fix the compile error: cannot resolve symbol RegistryObject.
```

The source file was still resolved through the diagnostic URI, without the request mentioning `example.Broken`.

## Verification Commands
```bash
pnpm exec tsx tmp/java-diagnostics-mcp-real-output.ts
pnpm exec tsc -b packages/java-jdtls-adapter apps/mcp-server --pretty false
pnpm exec vitest run packages/java-jdtls-adapter/src/diagnostic-registry.test.ts packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts apps/mcp-server/src/evidence-plan.test.ts apps/mcp-server/src/workspace-analyze-executor.test.ts apps/mcp-server/src/source-bundle-workspace-executor.test.ts apps/mcp-server/src/request-executor.test.ts apps/mcp-server/src/mcp-tools.test.ts apps/mcp-server/src/mcp-structured-content.test.ts
pnpm typecheck
pnpm --filter @mcpskill/mcp-server test
pnpm test
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
git diff --check
```

## Current Results
- `pnpm exec tsx tmp/java-diagnostics-mcp-real-output.ts`: returned `java_diagnostics -> workspace_source -> docs_lookup`, context `candidate-1-java_diagnostics`, selected `candidate-2-workspace_source`.
- `pnpm exec tsc -b packages/java-jdtls-adapter apps/mcp-server --pretty false`: passed.
- Targeted regression command: 9 test files passed, 33 tests passed.
- `pnpm typecheck`: `tsc -b --pretty false` passed.
- `pnpm --filter @mcpskill/mcp-server test`: 25 test files passed, 63 tests passed.
- `pnpm test`: 73 test files passed, 227 tests passed.
- 500-line source/test check: no files reported.
- Go residual check: no files reported.
- `git diff --check`: no output.
