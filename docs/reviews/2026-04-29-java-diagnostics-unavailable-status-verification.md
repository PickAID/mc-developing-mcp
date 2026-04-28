# Java Diagnostics Unavailable Status Verification
Date: 2026-04-29
Author: m1hono
Scope: `apps/mcp-server` Java diagnostics unavailable evidence

## Change
`java_diagnostics` evidence now preserves Java diagnostics runtime preparation status when JDTLS is unavailable or fails before diagnostics can be produced.

Before this change, the MCP evidence chain collapsed unavailable JDTLS into:

```text
No pending Java LSP diagnostics were available.
```

That was misleading because it hid the difference between:

- JDTLS is ready and returned no diagnostics
- JDTLS is missing
- JDTLS failed to start

Now the skipped `java_diagnostics` execution carries a compact payload with:

- `status: "unavailable"`
- `profileStatus`, such as `missing_jdtls`
- the concrete `reason`
- `totalDiagnostics: 0`

The public MCP surface remains unchanged: this is internal structured evidence on the existing `mc_develop` tool.

## RED Tests
Command before implementation:

```bash
pnpm exec vitest run apps/mcp-server/src/workspace-analyze-executor.test.ts apps/mcp-server/src/request-executor.test.ts apps/mcp-server/src/mcp-tools.test.ts
```

Observed failures:

```text
workspace-analyze-executor: expected summary "Java diagnostics unavailable: Java LSP profile is missing_jdtls."
received "No pending Java LSP diagnostics were available."

request-executor: expected payload.status "unavailable"
received payload undefined

mcp-tools: expected structured content to include missing_jdtls reason
received skipped Java diagnostics without runtime preparation payload
```

These failures verified that the old behavior lost the real unavailable reason.

## Real MCP Return Value
Command:

```bash
pnpm exec tsx tmp/java-diagnostics-unavailable-mcp-real-output.ts
```

Fresh output excerpt:

```json
{
  "text": {
    "type": "text",
    "text": "Selected: none\nRoute: java_diagnostics -> workspace_source -> docs_lookup\nExecuted: candidate-1-java_diagnostics, candidate-2-workspace_source, candidate-3-docs_lookup"
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
        "candidate-2-workspace_source",
        "candidate-3-docs_lookup"
      ],
      "contextCandidateIds": [],
      "skippedCandidateIds": [
        "candidate-1-java_diagnostics",
        "candidate-2-workspace_source",
        "candidate-3-docs_lookup"
      ]
    },
    "executions": [
      {
        "candidateId": "candidate-1-java_diagnostics",
        "routeStep": "java_diagnostics",
        "preferredTool": "workspace.analyze",
        "status": "skipped",
        "attempted": true,
        "summary": "Java diagnostics unavailable: Java LSP profile is missing_jdtls.",
        "payload": {
          "source": "workspace_analyze",
          "mode": "java_diagnostics",
          "status": "unavailable",
          "profileStatus": "missing_jdtls",
          "reason": "Java LSP profile is missing_jdtls.",
          "totalDiagnostics": 0,
          "files": [],
          "truncated": false
        }
      }
    ]
  }
}
```

The request still falls through to later evidence candidates, but the first execution now tells the agent why diagnostics are unavailable.

## Verification Commands
```bash
pnpm exec tsx tmp/java-diagnostics-unavailable-mcp-real-output.ts
pnpm exec vitest run apps/mcp-server/src/workspace-analyze-executor.test.ts apps/mcp-server/src/request-executor.test.ts apps/mcp-server/src/mcp-tools.test.ts
pnpm exec tsc -b apps/mcp-server --pretty false
pnpm --filter @mcpskill/mcp-server test
pnpm typecheck
pnpm test
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
git diff --check
```

## Current Results
- `pnpm exec tsx tmp/java-diagnostics-unavailable-mcp-real-output.ts`: returned `candidate-1-java_diagnostics` as skipped with `profileStatus: "missing_jdtls"` and the concrete reason.
- Targeted regression command: 3 test files passed, 10 tests passed.
- `pnpm exec tsc -b apps/mcp-server --pretty false`: passed.
- `pnpm --filter @mcpskill/mcp-server test`: 26 test files passed, 69 tests passed.
- `pnpm typecheck`: `tsc -b --pretty false` passed.
- `pnpm test`: 74 test files passed, 233 tests passed.
- 500-line source/test check: no files reported.
- Go residual check: no files reported.
- `git diff --check`: no output.
