# TypeScript MCP Server Request Handler Verification
Date: 2026-04-22
Author: m1hono
Status: PASS

## Scope
- add the first internal execution layer after `evidence-plan`
- execute ordered evidence candidates through injected tool executors without widening the package public API
- record per-candidate execution status, fallback selection, and request trace for later transport integration

## Files
- `apps/mcp-server/src/request-handler.ts`
- `apps/mcp-server/src/request-handler.test.ts`
- `apps/mcp-server/package.json`

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run apps/mcp-server/src/request-handler.test.ts
pnpm exec tsc -b
pnpm --filter @mcpskill/mcp-server test
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts packages/agent-harness/src/task-brief.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/agent-harness/src/public-api.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts apps/mcp-server/src/request-context.test.ts apps/mcp-server/src/request-plan.test.ts apps/mcp-server/src/evidence-plan.test.ts apps/mcp-server/src/request-handler.test.ts apps/mcp-server/src/public-api.test.ts
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e "import { buildMcpServerBootstrap, buildMcpServerRequestPlan } from './apps/mcp-server/src/index.ts'; import { buildMcpServerEvidencePlan } from './apps/mcp-server/src/evidence-plan.ts'; import { executeMcpServerRequestHandler } from './apps/mcp-server/src/request-handler.ts'; void (async () => { const bootstrap = await buildMcpServerBootstrap({ runtimeRoot: '/tmp/mcpskill-runtime', workspace: { workspaceRoot: './testdata/scenarios/modpack_kubejs' } }); const evidencePlan = buildMcpServerEvidencePlan(buildMcpServerRequestPlan(bootstrap, 'Add a KubeJS startup_scripts recipe for this modpack.')); const result = await executeMcpServerRequestHandler({ evidencePlan, executors: { 'context.query': ({ candidate }) => ({ matched: candidate.routeStep === 'probejs_types', summary: candidate.routeStep === 'probejs_types' ? 'Loaded ProbeJS declarations for the target recipe.' : 'Docs were not needed.', payload: { source: candidate.routeStep === 'probejs_types' ? 'probejs' : 'docs' } }) } }); console.log(JSON.stringify({ selectedEvidence: result.selectedEvidence, trace: result.trace, executions: result.executions }, null, 2)); })();"
./node_modules/.bin/tsx -e "import { buildMcpServerBootstrap, buildMcpServerRequestPlan } from './apps/mcp-server/src/index.ts'; import { buildMcpServerEvidencePlan } from './apps/mcp-server/src/evidence-plan.ts'; import { executeMcpServerRequestHandler } from './apps/mcp-server/src/request-handler.ts'; void (async () => { const bootstrap = await buildMcpServerBootstrap({ runtimeRoot: '/tmp/mcpskill-runtime', workspace: { workspaceRoot: './testdata/scenarios/modpack_external_crash' } }); const evidencePlan = buildMcpServerEvidencePlan(buildMcpServerRequestPlan(bootstrap, 'The server crashes on startup and latest.log shows an exception in a mod.')); const result = await executeMcpServerRequestHandler({ evidencePlan, executors: { 'workspace.analyze': () => ({ matched: false, summary: 'latest.log did not isolate the offending mod.' }), 'source.bundle': () => { throw new Error('jar source unavailable'); }, 'context.query': () => ({ matched: true, summary: 'Resolved against the offline docs index.', payload: { source: 'docs', matchedVersion: '1.20.1' } }) } }); console.log(JSON.stringify({ selectedEvidence: result.selectedEvidence, trace: result.trace, executions: result.executions }, null, 2)); })();"
```

## Command Results

### Direct request-handler test
- Command: `pnpm exec vitest run apps/mcp-server/src/request-handler.test.ts`
- Exit code: `0`

```text
✓ apps/mcp-server/src/request-handler.test.ts (2 tests) 6ms

Test Files  1 passed (1)
     Tests  2 passed (2)
Start at  16:00:03
Duration  448ms (transform 68ms, setup 0ms, collect 87ms, tests 6ms, environment 0ms, prepare 63ms)
```

### TypeScript build
- Command: `pnpm exec tsc -b`
- Exit code: `0`
- stdout/stderr: empty

### Package suite
- Command: `pnpm --filter @mcpskill/mcp-server test`
- Exit code: `0`

```text
> @mcpskill/mcp-server@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps/mcp-server
> vitest run --root ../.. apps/mcp-server/src/bootstrap.test.ts apps/mcp-server/src/request-context.test.ts apps/mcp-server/src/request-plan.test.ts apps/mcp-server/src/evidence-plan.test.ts apps/mcp-server/src/request-handler.test.ts apps/mcp-server/src/public-api.test.ts

✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 5ms
✓ apps/mcp-server/src/public-api.test.ts (1 test) 1ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 6ms
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 11ms
✓ apps/mcp-server/src/evidence-plan.test.ts (2 tests) 10ms
✓ apps/mcp-server/src/request-handler.test.ts (2 tests) 8ms

Test Files  6 passed (6)
     Tests  11 passed (11)
Start at  16:00:25
Duration  345ms (transform 154ms, setup 0ms, collect 488ms, tests 41ms, environment 0ms, prepare 342ms)
```

### Focused regression suite
- Command: `pnpm exec vitest run ...`
- Exit code: `0`

```text
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 5ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 4ms
✓ packages/agent-harness/src/public-api.test.ts (1 test) 5ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 11ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 118ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 15ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 11ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 35ms
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 20ms
✓ apps/mcp-server/src/evidence-plan.test.ts (2 tests) 11ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms
✓ apps/mcp-server/src/request-handler.test.ts (2 tests) 11ms
✓ tests/monorepo/foundation.test.ts (2 tests) 2ms
✓ apps/mcp-server/src/public-api.test.ts (1 test) 1ms

Test Files  20 passed (20)
     Tests  65 passed (65)
Start at  16:00:36
Duration  1.01s (transform 874ms, setup 0ms, collect 2.89s, tests 260ms, environment 2ms, prepare 2.65s)
```

### Root tests
- Command: `pnpm test`
- Exit code: `0`

```text
✓ tests/monorepo/foundation.test.ts (2 tests) 3ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 3ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 5ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 4ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/public-api.test.ts (1 test) 2ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 3ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 58ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 13ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 21ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 7ms
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 10ms
✓ apps/mcp-server/src/evidence-plan.test.ts (2 tests) 8ms
✓ apps/mcp-server/src/request-handler.test.ts (2 tests) 7ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 2ms
✓ apps/mcp-server/src/public-api.test.ts (1 test) 1ms

Test Files  20 passed (20)
     Tests  65 passed (65)
Start at  16:00:56
Duration  658ms (transform 1.01s, setup 0ms, collect 2.35s, tests 161ms, environment 2ms, prepare 1.58s)
```

### Go baseline checksum
- Command: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Result: every checked entry returned `OK`

## Direct Runtime Samples

### KubeJS request resolves on the first primary candidate
- Exit code: `0`

```json
{
  "selectedEvidence": {
    "candidateId": "candidate-1-probejs_types",
    "routeStep": "probejs_types",
    "provenance": "probejs_types",
    "preferredTool": "context.query",
    "tier": "primary",
    "pathHints": [
      "./testdata/scenarios/modpack_kubejs/.probejs",
      "./testdata/scenarios/modpack_kubejs/kubejs/probe"
    ],
    "queryHint": "Add a KubeJS startup_scripts recipe for this modpack.",
    "attempted": true,
    "status": "selected",
    "summary": "Loaded ProbeJS declarations for the target recipe.",
    "payload": {
      "source": "probejs"
    }
  },
  "trace": {
    "routeSteps": [
      "probejs_types",
      "docs_lookup"
    ],
    "candidateIds": [
      "candidate-1-probejs_types",
      "candidate-2-docs_lookup"
    ],
    "executedCandidateIds": [
      "candidate-1-probejs_types"
    ],
    "failedCandidateIds": [],
    "skippedCandidateIds": [
      "candidate-2-docs_lookup"
    ],
    "selectedCandidateId": "candidate-1-probejs_types",
    "fallbackUsed": false
  },
  "executions": [
    {
      "candidateId": "candidate-1-probejs_types",
      "routeStep": "probejs_types",
      "provenance": "probejs_types",
      "preferredTool": "context.query",
      "tier": "primary",
      "pathHints": [
        "./testdata/scenarios/modpack_kubejs/.probejs",
        "./testdata/scenarios/modpack_kubejs/kubejs/probe"
      ],
      "queryHint": "Add a KubeJS startup_scripts recipe for this modpack.",
      "attempted": true,
      "status": "selected",
      "summary": "Loaded ProbeJS declarations for the target recipe.",
      "payload": {
        "source": "probejs"
      }
    },
    {
      "candidateId": "candidate-2-docs_lookup",
      "routeStep": "docs_lookup",
      "provenance": "docs",
      "preferredTool": "context.query",
      "tier": "fallback",
      "pathHints": [],
      "queryHint": "Add a KubeJS startup_scripts recipe for this modpack.",
      "attempted": false,
      "status": "skipped",
      "summary": "Skipped because candidate-1-probejs_types already resolved the request."
    }
  ]
}
```

### Crash request misses logs, fails on source, then selects docs fallback
- Exit code: `0`

```json
{
  "selectedEvidence": {
    "candidateId": "candidate-3-docs_lookup",
    "routeStep": "docs_lookup",
    "provenance": "docs",
    "preferredTool": "context.query",
    "tier": "fallback",
    "pathHints": [],
    "queryHint": "The server crashes on startup and latest.log shows an exception in a mod.",
    "attempted": true,
    "status": "fallback",
    "summary": "Resolved against the offline docs index.",
    "payload": {
      "source": "docs",
      "matchedVersion": "1.20.1"
    }
  },
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
    "executedCandidateIds": [
      "candidate-1-log_files",
      "candidate-2-workspace_source",
      "candidate-3-docs_lookup"
    ],
    "failedCandidateIds": [
      "candidate-2-workspace_source"
    ],
    "skippedCandidateIds": [
      "candidate-1-log_files"
    ],
    "selectedCandidateId": "candidate-3-docs_lookup",
    "fallbackUsed": true
  },
  "executions": [
    {
      "candidateId": "candidate-1-log_files",
      "routeStep": "log_files",
      "provenance": "logs",
      "preferredTool": "workspace.analyze",
      "tier": "primary",
      "pathHints": [
        "/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/testdata/scenarios/modpack_external_crash/logs/latest.log"
      ],
      "queryHint": "The server crashes on startup and latest.log shows an exception in a mod.",
      "attempted": true,
      "status": "skipped",
      "summary": "latest.log did not isolate the offending mod."
    },
    {
      "candidateId": "candidate-2-workspace_source",
      "routeStep": "workspace_source",
      "provenance": "workspace_source",
      "preferredTool": "source.bundle",
      "tier": "primary",
      "pathHints": [
        "/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/testdata/scenarios/modpack_external_crash/build.gradle"
      ],
      "queryHint": "The server crashes on startup and latest.log shows an exception in a mod.",
      "attempted": true,
      "status": "failed",
      "summary": "Executor failed for source.bundle.",
      "error": "jar source unavailable"
    },
    {
      "candidateId": "candidate-3-docs_lookup",
      "routeStep": "docs_lookup",
      "provenance": "docs",
      "preferredTool": "context.query",
      "tier": "fallback",
      "pathHints": [],
      "queryHint": "The server crashes on startup and latest.log shows an exception in a mod.",
      "attempted": true,
      "status": "fallback",
      "summary": "Resolved against the offline docs index.",
      "payload": {
        "source": "docs",
        "matchedVersion": "1.20.1"
      }
    }
  ]
}
```
