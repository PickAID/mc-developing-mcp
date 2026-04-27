# TypeScript Agent Runtime Default Route Bootstrap Verification
Date: 2026-04-21
Author: m1hono
Status: PASS

## Required Evidence
- RED test exists before `agent-runtime` bootstrap starts attaching a default route plan
- `AgentRuntimeBootstrap` contract can carry the default route plan
- `agent-runtime` attaches `defaultRoutePlan` only when a workspace root is provided
- legacy string bootstrap compatibility remains intact
- focused package/app verification passes
- root typecheck passes
- root `pnpm test` passes
- Go-tree checksum baseline still matches

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts
pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts
pnpm exec vitest run packages/agent-harness/src/route.test.ts packages/agent-harness/src/scenario.test.ts
pnpm exec tsc -b packages/shared-types packages/agent-harness apps/agent-runtime
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
pnpm exec tsc -b
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e '...direct bootstrap sampling script...'
```

## Command Results

### RED: `pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts`
- Exit code: `1`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

❯ apps/agent-runtime/src/bootstrap.test.ts (2 tests | 1 failed) 14ms
  ✓ buildAgentRuntimeBootstrap > keeps the legacy string bootstrap API compatible 1ms
  × buildAgentRuntimeBootstrap > attaches detected workspace context and a default route plan when a workspace root is provided 13ms
    → expected undefined to deeply equal { Object (scenario, reasons, ...) }

FAIL  apps/agent-runtime/src/bootstrap.test.ts > buildAgentRuntimeBootstrap > attaches detected workspace context and a default route plan when a workspace root is provided
AssertionError: expected undefined to deeply equal { Object (scenario, reasons, ...) }

- Expected:
{
  "defaultRoutingScenario": "project_symbol",
  "reasons": [
    "workspace descriptor reports a Java mod workspace",
    "default project-symbol routing should inspect workspace source before docs",
  ],
  "scenario": "java-mod-workspace",
  "steps": [
    "workspace_source",
    "docs_lookup",
  ],
}

+ Received:
undefined
```

### GREEN: `pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 14ms

Test Files  1 passed (1)
     Tests  2 passed (2)
Start at  06:13:10
Duration  784ms (transform 103ms, setup 0ms, collect 136ms, tests 14ms, environment 0ms, prepare 200ms)
```

### Harness regression guard: `pnpm exec vitest run packages/agent-harness/src/route.test.ts packages/agent-harness/src/scenario.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms

Test Files  2 passed (2)
     Tests  17 passed (17)
Start at  06:13:10
Duration  683ms (transform 48ms, setup 0ms, collect 70ms, tests 5ms, environment 0ms, prepare 276ms)
```

### Focused build: `pnpm exec tsc -b packages/shared-types packages/agent-harness apps/agent-runtime`
- Exit code: `0`
- stdout/stderr: no output

### Focused suite: `pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ tests/monorepo/foundation.test.ts (2 tests) 4ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 8ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 1ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 10ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 54ms
✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 20ms

Test Files  8 passed (8)
     Tests  35 passed (35)
Start at  06:13:39
Duration  564ms (transform 453ms, setup 0ms, collect 833ms, tests 100ms, environment 1ms, prepare 968ms)
```

### Root typecheck: `pnpm exec tsc -b`
- Exit code: `0`
- stdout/stderr: no output

### Root tests: `pnpm test`
- Exit code: `0`

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> vitest run

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms
✓ tests/monorepo/foundation.test.ts (2 tests) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 1ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 4ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 7ms
✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 14ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 39ms

Test Files  8 passed (8)
     Tests  35 passed (35)
Start at  06:13:40
Duration  423ms (transform 226ms, setup 0ms, collect 435ms, tests 70ms, environment 1ms, prepare 377ms)
```

### Go checksum baseline: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Output pattern: all checked entries returned `: OK`
- Sample lines:

```text
testdata/scenarios/modpack_external_crash/logs/latest.log: OK
```

## Direct Bootstrap Sample

### `./node_modules/.bin/tsx -e '...direct bootstrap sampling script...'`
- Exit code: `0`

```json
{
  "appId": "agent-runtime",
  "harnessPackage": "@mcpskill/agent-harness",
  "workspaceKind": "java-mod",
  "runtime": {
    "minecraftVersion": "1.20.1",
    "loader": "forge",
    "loaderVersion": "47.2.0",
    "source": "workspace-detect",
    "confidence": "high"
  },
  "defaultRoutePlan": {
    "scenario": "java-mod-workspace",
    "reasons": [
      "workspace descriptor reports a Java mod workspace",
      "default project-symbol routing should inspect workspace source before docs"
    ],
    "defaultRoutingScenario": "project_symbol",
    "steps": [
      "workspace_source",
      "docs_lookup"
    ]
  }
}
```

## Observed Values
- Legacy string calls to `buildAgentRuntimeBootstrap("/tmp/...")` remain synchronous and still return no `workspaceContext` and no `defaultRoutePlan`.
- Structured `workspace` bootstraps now attach both the raw detected `workspaceContext` and the harness-facing `defaultRoutePlan`.
- The bootstrap route plan is not guessed independently; it is derived by calling the existing `agent-harness` default route builder on the resolved `workspaceContext`.
- The new route-plan contract lives in `shared-types`, so `agent-runtime` can expose the field without creating a package cycle.
- This slice still does not add request-intent branching, fallback execution, docs injection, or tool orchestration.
