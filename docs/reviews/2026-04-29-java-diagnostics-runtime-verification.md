# Java Diagnostics Runtime Verification
Date: 2026-04-29
Author: m1hono
Scope: `apps/mcp-server` Java diagnostics runtime integration

## Change
`mc_develop` now has an internal Java diagnostics runtime path instead of relying only on a pre-injected `lspDiagnostics` registry.

The public MCP surface remains unchanged:

- One exposed tool: `mc_develop`
- No new tool input fields
- No new package entrypoint exports
- Java diagnostics still flow through the existing `java_diagnostics` evidence candidate

Runtime behavior:

- `registerMcpServerTools()` creates a default Java diagnostics runtime when one is not provided.
- `mc_develop` only prepares the runtime for compile/diagnostic-style requests, so crash/datapack/KubeJS requests do not start JDTLS.
- The runtime builds a JDTLS profile per workspace, starts a resilient manager only when the profile is `ready`, and reuses that manager for later requests in the same workspace.
- Relevant Java files are opened into JDTLS with bounded file counts before evidence execution.
- The existing `workspace.analyze` Java diagnostics executor drains the runtime registry and bridges diagnostics into later source lookup.

This is still intentionally conservative: if JDTLS is missing or cannot start, the request continues through normal evidence routing without failing the MCP call.

## RED Tests
Command before implementation:

```bash
pnpm exec vitest run apps/mcp-server/src/java-diagnostics-runtime.test.ts apps/mcp-server/src/mcp-tools.test.ts
```

Observed failures:

```text
Cannot find module './java-diagnostics-runtime.js'

registerMcpServerTools > uses the Java diagnostics runtime when direct diagnostics are not injected
expected trace.contextCandidateIds to contain candidate-1-java_diagnostics
```

These failures proved both missing runtime implementation and missing high-level tool wiring.

## Runtime Return Shape
Targeted command after implementation:

```bash
pnpm exec vitest run apps/mcp-server/src/java-diagnostics-runtime.test.ts apps/mcp-server/src/mcp-tools.test.ts apps/mcp-server/src/package-metadata.test.ts
pnpm exec tsc -b apps/mcp-server --pretty false
```

Fresh result:

```text
Test Files  3 passed (3)
Tests       6 passed (6)
```

Unit coverage:

- Runtime starts one manager per workspace and reuses it.
- Runtime syncs bounded Java files into the manager.
- Runtime returns `unavailable` instead of starting a manager when JDTLS profile is `missing_jdtls`.
- Top-level `mc_develop` can use `javaDiagnosticsRuntime.prepare()` without direct `lspDiagnostics` injection.
- Package test script includes `java-diagnostics-runtime.test.ts`.

## Real MCP Runtime Path Output
Command:

```bash
pnpm exec tsx tmp/java-diagnostics-runtime-mcp-real-output.ts
```

The smoke uses the actual `mc_develop` registration and request execution path with a deterministic runtime object. It does not pass `lspDiagnostics` directly.

Observed output excerpt:

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
    "executions": [
      {
        "candidateId": "candidate-1-java_diagnostics",
        "routeStep": "java_diagnostics",
        "status": "context",
        "summary": "Drained 1 pending Java LSP diagnostic(s) from 1 file(s).",
        "payload": {
          "source": "workspace_analyze",
          "mode": "java_diagnostics",
          "totalDiagnostics": 1,
          "files": [
            {
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
        "status": "selected",
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

## Verification Commands
```bash
pnpm exec tsx tmp/java-diagnostics-runtime-mcp-real-output.ts
pnpm exec vitest run apps/mcp-server/src/java-diagnostics-runtime.test.ts apps/mcp-server/src/mcp-tools.test.ts apps/mcp-server/src/package-metadata.test.ts
pnpm exec tsc -b apps/mcp-server --pretty false
pnpm --filter @mcpskill/mcp-server test
pnpm typecheck
pnpm test
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
git diff --check
```

## Current Results
- `pnpm exec tsx tmp/java-diagnostics-runtime-mcp-real-output.ts`: returned `java_diagnostics -> workspace_source -> docs_lookup`, context `candidate-1-java_diagnostics`, selected `candidate-2-workspace_source`.
- Targeted runtime tests: 3 test files passed, 6 tests passed.
- `pnpm exec tsc -b apps/mcp-server --pretty false`: passed.
- `pnpm --filter @mcpskill/mcp-server test`: 26 test files passed, 66 tests passed.
- `pnpm typecheck`: `tsc -b --pretty false` passed.
- `pnpm test`: 74 test files passed, 230 tests passed.
- 500-line source/test check: no files reported.
- Go residual check: no files reported.
- `git diff --check`: no output.
