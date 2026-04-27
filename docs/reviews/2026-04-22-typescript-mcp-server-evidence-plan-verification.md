# TypeScript MCP Server Evidence Plan Verification
Date: 2026-04-22
Author: m1hono
Status: PASS

## Scope
- add the first internal context-assembly layer after `request-plan`
- turn ordered route steps into structured evidence candidates with provenance, preferred tool, cost, and fallback tier
- keep the feature internal to `apps/mcp-server` instead of widening the package public API

## Files
- `apps/mcp-server/src/evidence-plan.ts`
- `apps/mcp-server/src/evidence-plan.test.ts`
- `apps/mcp-server/package.json`

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run apps/mcp-server/src/evidence-plan.test.ts
pnpm exec tsc -b
pnpm --filter @mcpskill/mcp-server test
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts packages/agent-harness/src/task-brief.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/agent-harness/src/public-api.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts apps/mcp-server/src/request-context.test.ts apps/mcp-server/src/request-plan.test.ts apps/mcp-server/src/evidence-plan.test.ts apps/mcp-server/src/public-api.test.ts
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e "import { buildMcpServerBootstrap, buildMcpServerRequestPlan } from './apps/mcp-server/src/index.ts'; import { buildMcpServerEvidencePlan } from './apps/mcp-server/src/evidence-plan.ts'; void (async () => { const bootstrap = await buildMcpServerBootstrap({ runtimeRoot: '/tmp/mcpskill-runtime', workspace: { workspaceRoot: './testdata/scenarios/modpack_kubejs' } }); const requestPlan = buildMcpServerRequestPlan(bootstrap, 'Add a KubeJS startup_scripts recipe for this modpack.'); const evidencePlan = buildMcpServerEvidencePlan(requestPlan); console.log(JSON.stringify({ trace: evidencePlan.trace, candidates: evidencePlan.candidates }, null, 2)); })();"
./node_modules/.bin/tsx -e "import { buildMcpServerBootstrap, buildMcpServerRequestPlan } from './apps/mcp-server/src/index.ts'; import { buildMcpServerEvidencePlan } from './apps/mcp-server/src/evidence-plan.ts'; void (async () => { const bootstrap = await buildMcpServerBootstrap({ runtimeRoot: '/tmp/mcpskill-runtime', workspace: { workspaceRoot: './testdata/scenarios/modpack_external_crash' } }); const requestPlan = buildMcpServerRequestPlan(bootstrap, 'The server crashes on startup and latest.log shows an exception in a mod.'); const evidencePlan = buildMcpServerEvidencePlan(requestPlan); console.log(JSON.stringify({ trace: evidencePlan.trace, candidates: evidencePlan.candidates }, null, 2)); })();"
```

## Command Results

### Direct evidence-plan test
- Command: `pnpm exec vitest run apps/mcp-server/src/evidence-plan.test.ts`
- Exit code: `0`

```text
✓ apps/mcp-server/src/evidence-plan.test.ts (2 tests) 4ms

Test Files  1 passed (1)
     Tests  2 passed (2)
Start at  04:12:03
Duration  481ms (transform 62ms, setup 0ms, collect 81ms, tests 4ms, environment 0ms, prepare 69ms)
```

### TypeScript build
- Command: `pnpm exec tsc -b`
- Exit code: `0`
- stdout/stderr: empty

### RED then GREEN: package suite found a real cwd-sensitive test bug
- Command: `pnpm --filter @mcpskill/mcp-server test`
- Initial exit code: `1`
- Cause: `apps/mcp-server/src/evidence-plan.test.ts` used `./testdata/...` paths relative to process cwd, which failed under package-local execution

```text
FAIL  apps/mcp-server/src/evidence-plan.test.ts > buildMcpServerEvidencePlan > assembles ProbeJS-first evidence candidates for KubeJS authoring requests
AssertionError: expected { appId: 'mcp-server', …(3) } to match object { appId: 'mcp-server', …(2) }

- Expected
+ Received

  {
    "appId": "mcp-server",
-   "candidates": [
-     {
-       "id": "candidate-1-probejs_types",
-       "routeStep": "probejs_types"
-     }
-   ],
+   "candidates": [],
    "trace": {
-     "candidateIds": [
-       "candidate-1-probejs_types"
-     ],
+     "candidateIds": [],
    }
  }
```

- Fix: resolve scenario roots from `import.meta.url` instead of the package cwd

### Package suite after path fix
- Command: `pnpm --filter @mcpskill/mcp-server test`
- Exit code: `0`

```text
> @mcpskill/mcp-server@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps/mcp-server
> vitest run --root ../.. apps/mcp-server/src/bootstrap.test.ts apps/mcp-server/src/request-context.test.ts apps/mcp-server/src/request-plan.test.ts apps/mcp-server/src/evidence-plan.test.ts apps/mcp-server/src/public-api.test.ts

✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 6ms
✓ apps/mcp-server/src/public-api.test.ts (1 test) 2ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 9ms
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 13ms
✓ apps/mcp-server/src/evidence-plan.test.ts (2 tests) 9ms

Test Files  5 passed (5)
     Tests  9 passed (9)
Start at  04:10:19
Duration  592ms (transform 281ms, setup 0ms, collect 722ms, tests 39ms, environment 1ms, prepare 325ms)
```

### Focused regression
- Exit code: `0`

```text
✓ packages/agent-harness/src/policy.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 4ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 6ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 8ms
✓ tests/monorepo/foundation.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 10ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 3ms
✓ packages/agent-harness/src/public-api.test.ts (1 test) 3ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 54ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 2ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 9ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 8ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 24ms
✓ apps/mcp-server/src/public-api.test.ts (1 test) 1ms
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 33ms
✓ apps/mcp-server/src/evidence-plan.test.ts (2 tests) 22ms

Test Files  19 passed (19)
     Tests  63 passed (63)
Start at  04:10:55
Duration  1.06s (transform 1.27s, setup 0ms, collect 4.02s, tests 196ms, environment 2ms, prepare 2.98s)
```

### Root tests
- Command: `pnpm test`
- Exit code: `0`

```text
✓ packages/agent-harness/src/route.test.ts (6 tests) 3ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 5ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 4ms
✓ tests/monorepo/foundation.test.ts (2 tests) 7ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 9ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/public-api.test.ts (1 test) 5ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 61ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 8ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 11ms
✓ apps/mcp-server/src/public-api.test.ts (1 test) 1ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 48ms
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 17ms
✓ apps/mcp-server/src/evidence-plan.test.ts (2 tests) 22ms

Test Files  19 passed (19)
     Tests  63 passed (63)
Start at  04:10:55
Duration  1.12s (transform 1.31s, setup 0ms, collect 4.15s, tests 211ms, environment 5ms, prepare 4.12s)
```

### Go baseline checksum
- Command: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Result: every checked entry returned `OK`

## Direct Runtime Samples

### KubeJS evidence plan on `testdata/scenarios/modpack_kubejs`
- Exit code: `0`

```json
{
  "trace": {
    "routeSteps": [
      "probejs_types",
      "docs_lookup"
    ],
    "candidateIds": [
      "candidate-1-probejs_types",
      "candidate-2-docs_lookup"
    ],
    "fallbackCandidateIds": [
      "candidate-2-docs_lookup"
    ]
  },
  "candidates": [
    {
      "id": "candidate-1-probejs_types",
      "priority": 1,
      "tier": "primary",
      "routeStep": "probejs_types",
      "provenance": "probejs_types",
      "preferredTool": "context.query",
      "estimatedCost": "low",
      "reliability": "high",
      "reason": "Inspect ProbeJS or d.ts context before broader docs.",
      "pathHints": [
        "./testdata/scenarios/modpack_kubejs/.probejs",
        "./testdata/scenarios/modpack_kubejs/kubejs/probe"
      ],
      "queryHint": "Add a KubeJS startup_scripts recipe for this modpack."
    },
    {
      "id": "candidate-2-docs_lookup",
      "priority": 2,
      "tier": "fallback",
      "routeStep": "docs_lookup",
      "provenance": "docs",
      "preferredTool": "context.query",
      "estimatedCost": "medium",
      "reliability": "medium",
      "reason": "Use docs only after exact workspace or typed evidence.",
      "pathHints": [],
      "queryHint": "Add a KubeJS startup_scripts recipe for this modpack."
    }
  ]
}
```

### Crash-triage evidence plan on `testdata/scenarios/modpack_external_crash`
- Exit code: `0`

```json
{
  "trace": {
    "routeSteps": [
      "log_files",
      "workspace_source",
      "docs_lookup"
    ],
    "candidateIds": [
      "candidate-1-log_files",
      "candidate-2-workspace_source",
      "candidate-3-docs_lookup"
    ],
    "fallbackCandidateIds": [
      "candidate-3-docs_lookup"
    ]
  },
  "candidates": [
    {
      "id": "candidate-1-log_files",
      "priority": 1,
      "tier": "primary",
      "routeStep": "log_files",
      "provenance": "logs",
      "preferredTool": "workspace.analyze",
      "estimatedCost": "low",
      "reliability": "high",
      "reason": "Inspect concrete crash logs before source or docs.",
      "pathHints": [
        "/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/testdata/scenarios/modpack_external_crash/logs/latest.log"
      ],
      "queryHint": "The server crashes on startup and latest.log shows an exception in a mod."
    },
    {
      "id": "candidate-2-workspace_source",
      "priority": 2,
      "tier": "primary",
      "routeStep": "workspace_source",
      "provenance": "workspace_source",
      "preferredTool": "source.bundle",
      "estimatedCost": "medium",
      "reliability": "high",
      "reason": "Inspect exact workspace source or build files before docs.",
      "pathHints": [
        "/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/testdata/scenarios/modpack_external_crash/build.gradle"
      ],
      "queryHint": "The server crashes on startup and latest.log shows an exception in a mod."
    },
    {
      "id": "candidate-3-docs_lookup",
      "priority": 3,
      "tier": "fallback",
      "routeStep": "docs_lookup",
      "provenance": "docs",
      "preferredTool": "context.query",
      "estimatedCost": "medium",
      "reliability": "medium",
      "reason": "Use docs only after exact workspace or typed evidence.",
      "pathHints": [],
      "queryHint": "The server crashes on startup and latest.log shows an exception in a mod."
    }
  ]
}
```

## Observed Behavior
- `request-plan` now feeds a deterministic evidence layer instead of stopping at prompt text and route trace.
- exact or typed evidence stays primary, while `docs_lookup` is now explicitly marked as fallback.
- the evidence layer already carries the shape later handler code needs: provenance, tool choice, path hints, cost, and reliability.
- this slice still does not invoke tools or rank returned shards yet.
