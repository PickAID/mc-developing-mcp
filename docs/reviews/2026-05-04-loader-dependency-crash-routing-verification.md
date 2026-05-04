# Loader Dependency Crash Routing Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice teaches crash triage to extract loader dependency mod ids from crash
logs and carry them into the existing evidence chain.

The change keeps the MCP public tool surface unchanged. It improves internal
logic only:

- `log_files` parses Fabric-style and Forge/NeoForge-style loader dependency
  crash text.
- `workspace.analyze` treats loader dependency references as actionable crash
  evidence.
- Request context appends `Crash log loader mod ids: ...` to later candidates.
- Crash routing now tries `external_mod_resolution` after log and local JAR
  evidence but before workspace source/docs.
- External mod resolution can use workspace runtime defaults for loader and
  Minecraft version when crash context only provides a mod id.

## Red
Focused red command:

```bash
pnpm vitest run apps/mcp-server/src/crash-log-signals.test.ts apps/mcp-server/src/external-mod-resolution-request.test.ts apps/mcp-server/src/request-executor-loader-dependency-crash.test.ts packages/agent-harness/src/task-route.test.ts
```

Initial failures:

```text
Test Files  4 failed (4)
Tests  5 failed | 20 passed (25)
```

Key failed values:

```text
expected signals.loaderModReferences to equal [...]
received undefined

expected query=fabric-api and minecraftVersion=1.20.1
received query="modpack crashes during startup. crash log loader ids fabric-api"
received minecraftVersion=undefined

expected request route to include external_mod_resolution after log_files
received route without external_mod_resolution
```

Full-suite red after the first implementation pass:

```bash
pnpm test
```

Result:

```text
Test Files  4 failed | 127 passed (131)
Tests  5 failed | 413 passed (418)
```

Reason: behavior was already implemented, but request plan/evidence plan/task
brief/request handler tests still expected the old crash route.

## Green
Focused green:

```bash
pnpm tsc -b && pnpm vitest run apps/mcp-server/src/crash-log-signals.test.ts apps/mcp-server/src/external-mod-resolution-request.test.ts apps/mcp-server/src/external-mod-resolution-runtime-context.test.ts apps/mcp-server/src/request-executor-loader-dependency-crash.test.ts packages/agent-harness/src/task-route.test.ts
```

Result:

```text
✓ apps/mcp-server/src/crash-log-signals.test.ts (2 tests) 3ms
✓ apps/mcp-server/src/external-mod-resolution-request.test.ts (9 tests) 3ms
✓ packages/agent-harness/src/task-route.test.ts (13 tests) 3ms
✓ apps/mcp-server/src/external-mod-resolution-runtime-context.test.ts (1 test) 8ms
✓ apps/mcp-server/src/request-executor-loader-dependency-crash.test.ts (1 test) 7ms

Test Files  5 passed (5)
Tests  26 passed (26)
```

Related old-expectation regression group:

```bash
pnpm tsc -b && pnpm vitest run apps/mcp-server/src/evidence-plan.test.ts apps/mcp-server/src/request-plan.test.ts apps/mcp-server/src/request-handler.test.ts packages/agent-harness/src/task-brief.test.ts apps/mcp-server/src/request-executor-loader-dependency-crash.test.ts
```

Result:

```text
Test Files  5 passed (5)
Tests  18 passed (18)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  131 passed (131)
Tests  418 passed (418)
```

Repository guards:

```bash
git diff --check
find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './.git' -prune -o -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Result: no output from all three guard commands.

## Actual Return Values
Command:

```bash
pnpm tsx -e 'import { parseCrashSignals } from "./apps/mcp-server/src/crash-log-signals.ts"; ...'
```

`signals.loaderModReferences`:

```json
[
  {
    "modId": "fabric-api",
    "requestedBy": "demo_addon",
    "expectedRange": "0.92.2 or later",
    "actualVersion": "missing",
    "kind": "missing_dependency"
  },
  {
    "modId": "geckolib",
    "requestedBy": "spell_mod",
    "expectedRange": "[4.4,)",
    "actualVersion": "[MISSING]",
    "kind": "missing_dependency"
  }
]
```

Runtime-context external resolution request:

```json
{
  "platform": "modrinth",
  "query": "fabric-api",
  "loader": "fabric",
  "minecraftVersion": "1.20.1"
}
```

Runtime-context external resolution result:

```json
{
  "matched": true,
  "summary": "No external mod candidates matched fabric-api.",
  "payload": {
    "source": "external_mod_resolution",
    "request": {
      "platform": "modrinth",
      "query": "fabric-api",
      "loader": "fabric",
      "minecraftVersion": "1.20.1"
    }
  }
}
```

Crash request chain:

```json
{
  "executions": [
    {
      "routeStep": "log_files",
      "status": "context",
      "signals": {
        "loaderModReferences": [
          {
            "modId": "fabric-api",
            "requestedBy": "demo_addon",
            "kind": "missing_dependency"
          }
        ]
      }
    },
    {
      "routeStep": "external_mod_resolution",
      "status": "selected",
      "candidateId": "candidate-2-external_mod_resolution"
    }
  ],
  "trace": {
    "routeSteps": [
      "log_files",
      "external_mod_resolution",
      "workspace_source",
      "docs_lookup"
    ],
    "selectedCandidateId": "candidate-2-external_mod_resolution"
  }
}
```

## Line Counts
Current relevant line counts:

```text
327 apps/mcp-server/src/crash-log-signals.ts
363 apps/mcp-server/src/request-execution-context.ts
445 apps/mcp-server/src/external-mod-resolution-request.ts
96 apps/mcp-server/src/external-mod-resolution-runtime-context.test.ts
119 apps/mcp-server/src/request-executor-loader-dependency-crash.test.ts
490 packages/agent-harness/src/task-route.test.ts
```

## Notes
- `packages/agent-harness/src/task-route.test.ts` is now 490 lines. It remains
  below the hard limit, but the next routing change should split this file
  before adding more assertions.
- External resolution still prefers local archive and Gradle dependency evidence
  inside the existing executor before API-backed resolution.
