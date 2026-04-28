# Java Diagnostics Runtime Lifecycle Verification
Date: 2026-04-29
Author: m1hono
Scope: `apps/mcp-server` Java diagnostics runtime cleanup

## Change
`createMcpSkillServer()` now owns the Java diagnostics runtime lifecycle.

When a server is created through the package API or stdio entrypoint:

- a Java diagnostics runtime is created if one is not injected
- the same runtime is passed to `registerMcpServerTools()`
- `server.close()` stops the runtime through `stopAll()`
- sequential and concurrent `server.close()` calls share one cleanup path
- repeated `server.close()` calls do not call `stopAll()` more than once

This prevents process-backed JDTLS managers from surviving after an MCP server is closed.

The public MCP surface remains unchanged:

- still one public tool: `mc_develop`
- no new tool input fields
- no new public package exports

## RED Test
Command before implementation:

```bash
pnpm exec vitest run apps/mcp-server/src/mcp-server.test.ts
```

Observed failure:

```text
createMcpSkillServer > stops the Java diagnostics runtime when the server closes
expected +0 to be 1
```

The failing assertion showed that `server.close()` did not call `javaDiagnosticsRuntime.stopAll()`.

Additional RED command before the concurrent-close fix:

```bash
pnpm exec vitest run apps/mcp-server/src/mcp-server.test.ts -t "awaits Java diagnostics cleanup for concurrent server closes"
```

Observed failure:

```text
expected true to be false
```

The failing assertion showed that a second `server.close()` call could resolve before Java diagnostics cleanup finished.

## Real Lifecycle Output
Command:

```bash
pnpm exec tsx tmp/java-diagnostics-runtime-close-real-output.ts
```

Observed output:

```json
{
  "sequential": {
    "closeRequests": 2,
    "stopCalls": 1
  },
  "concurrent": {
    "secondCloseSettledBeforeRelease": false,
    "stopCalls": 1
  }
}
```

This confirms cleanup is idempotent from the public server object used by local MCP clients.
It also confirms concurrent close callers do not observe completion before `stopAll()` completes.

## Verification Commands
```bash
pnpm exec tsx tmp/java-diagnostics-runtime-close-real-output.ts
pnpm exec vitest run apps/mcp-server/src/mcp-server.test.ts
pnpm exec tsc -b apps/mcp-server --pretty false
pnpm --filter @mcpskill/mcp-server test
pnpm typecheck
pnpm test
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
git diff --check
```

## Current Results
`pnpm exec tsx tmp/java-diagnostics-runtime-close-real-output.ts`

```json
{
  "sequential": {
    "closeRequests": 2,
    "stopCalls": 1
  },
  "concurrent": {
    "secondCloseSettledBeforeRelease": false,
    "stopCalls": 1
  }
}
```

`pnpm exec vitest run apps/mcp-server/src/mcp-server.test.ts`

```text
Test Files  1 passed (1)
Tests       3 passed (3)
```

`pnpm exec tsc -b apps/mcp-server --pretty false`

```text
exit code 0
```

`pnpm --filter @mcpskill/mcp-server test`

```text
Test Files  26 passed (26)
Tests       71 passed (71)
```

`pnpm typecheck`

```text
exit code 0
```

`pnpm test`

```text
Test Files  74 passed (74)
Tests       235 passed (235)
```

500-line source/test guard:

```text
no files reported
```

Go cleanup guard:

```text
no files reported
```

`git diff --check`

```text
exit code 0
```
