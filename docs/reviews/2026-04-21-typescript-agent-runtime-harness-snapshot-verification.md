# TypeScript Agent Runtime Harness Snapshot Verification
Date: 2026-04-21
Author: m1hono
Status: PASS

## Required Evidence
- RED tests exist before the harness snapshot builder and bootstrap field are implemented
- `shared-types` exposes a stable harness snapshot contract
- `agent-harness` can build a compact snapshot from `workspaceContext`
- `agent-runtime` attaches `harnessSnapshot` only when `workspace` input is present
- package-level `pnpm --filter @mcpskill/agent-harness test` remains green
- focused suite passes
- root typecheck passes
- root `pnpm test` passes
- Go-tree checksum baseline still matches

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run packages/agent-harness/src/snapshot.test.ts
pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts
pnpm exec vitest run packages/agent-harness/src/snapshot.test.ts
pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts
pnpm --filter @mcpskill/agent-harness test
pnpm exec tsc -b packages/shared-types packages/agent-harness apps/agent-runtime
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/snapshot.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
pnpm exec tsc -b
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e '...direct harness snapshot sampling script...'
```

## Command Results

### RED: `pnpm exec vitest run packages/agent-harness/src/snapshot.test.ts`
- Exit code: `1`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

FAIL  packages/agent-harness/src/snapshot.test.ts [ packages/agent-harness/src/snapshot.test.ts ]
Error: Cannot find module './snapshot.js' imported from '/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness/src/snapshot.test.ts'
 ❯ packages/agent-harness/src/snapshot.test.ts:9:1
      7| } from "@mcpskill/shared-types";
      8|
      9| import {
       | ^
     10|   buildHarnessSnapshot,
     11|   buildHarnessSnapshotFromBootstrap

Caused by: Error: Failed to load url ./snapshot.js (resolved id: ./snapshot.js) in /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness/src/snapshot.test.ts. Does the file exist?

Test Files  1 failed (1)
     Tests  no tests
Start at  06:36:45
Duration  631ms (transform 34ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 190ms)
```

### RED: `pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts`
- Exit code: `1`

```text
❯ apps/agent-runtime/src/bootstrap.test.ts (2 tests | 1 failed) 20ms
  ✓ buildAgentRuntimeBootstrap > keeps the legacy string bootstrap API compatible 1ms
  × buildAgentRuntimeBootstrap > attaches detected workspace context, a default route plan, and a harness snapshot when a workspace root is provided 17ms
    → expected undefined to match object { …(4) }

FAIL  apps/agent-runtime/src/bootstrap.test.ts > buildAgentRuntimeBootstrap > attaches detected workspace context, a default route plan, and a harness snapshot when a workspace root is provided
AssertionError: expected undefined to match object { …(4) }
```

### GREEN: `pnpm exec vitest run packages/agent-harness/src/snapshot.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 3ms

Test Files  1 passed (1)
     Tests  3 passed (3)
Start at  15:38:31
Duration  901ms (transform 49ms, setup 0ms, collect 68ms, tests 3ms, environment 0ms, prepare 162ms)
```

### GREEN: `pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 14ms

Test Files  1 passed (1)
     Tests  2 passed (2)
Start at  15:38:31
Duration  998ms (transform 79ms, setup 0ms, collect 129ms, tests 14ms, environment 0ms, prepare 121ms)
```

### Package suite: `pnpm --filter @mcpskill/agent-harness test`
- Exit code: `0`

```text
> @mcpskill/agent-harness@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness
> vitest run --root ../.. packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/snapshot.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 12ms

Test Files  3 passed (3)
     Tests  20 passed (20)
Start at  15:38:31
Duration  896ms (transform 86ms, setup 0ms, collect 136ms, tests 17ms, environment 0ms, prepare 410ms)
```

### Focused build: `pnpm exec tsc -b packages/shared-types packages/agent-harness apps/agent-runtime`
- Exit code: `0`
- stdout/stderr: no output

### Focused suite: `pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/snapshot.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/agent-harness/src/scenario.test.ts (11 tests) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 1ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 1ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ tests/monorepo/foundation.test.ts (2 tests) 1ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 5ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 39ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 7ms
✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 12ms

Test Files  9 passed (9)
     Tests  38 passed (38)
Start at  15:39:22
Duration  774ms (transform 419ms, setup 0ms, collect 825ms, tests 72ms, environment 1ms, prepare 1.10s)
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

✓ tests/monorepo/foundation.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 2ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 41ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 6ms
✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 13ms

Test Files  9 passed (9)
     Tests  38 passed (38)
Start at  15:39:22
Duration  774ms (transform 499ms, setup 0ms, collect 917ms, tests 73ms, environment 1ms, prepare 1.38s)
```

### Go checksum baseline: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Output pattern: all checked entries returned `: OK`
- Sample lines:

```text
testdata/scenarios/modpack_external_crash/logs/latest.log: OK
```

## Direct Bootstrap Sample

### `./node_modules/.bin/tsx -e '...direct harness snapshot sampling script...'`
- Exit code: `0`

```json
{
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
  },
  "harnessSnapshot": {
    "workspaceKind": "java-mod",
    "detectorReasons": [
      "detected Gradle build files",
      "detected Java source roots"
    ],
    "routePlan": {
      "scenario": "java-mod-workspace",
      "defaultRoutingScenario": "project_symbol",
      "steps": [
        "workspace_source",
        "docs_lookup"
      ]
    },
    "facts": {
      "hasGradle": true,
      "hasJavaSource": true,
      "hasKubeJS": false,
      "hasProbeJS": false,
      "hasDatapack": false,
      "buildFileCount": 1,
      "javaSourceRootCount": 1,
      "datapackRootCount": 0,
      "logPathCount": 0
    }
  }
}
```

## Observed Values
- `shared-types` now exposes an additive `AgentRuntimeHarnessSnapshot` contract plus compact `facts` counts/flags.
- `buildHarnessSnapshot()` reduces `workspaceContext.descriptor` into a smaller agent-facing object instead of forcing later layers to traverse the whole descriptor.
- `buildAgentRuntimeBootstrap({ workspace })` now attaches three aligned fields: raw `workspaceContext`, `defaultRoutePlan`, and the derived `harnessSnapshot`.
- Legacy string bootstrap calls remain unchanged and still return neither `workspaceContext`, `defaultRoutePlan`, nor `harnessSnapshot`.
- This slice still does not execute the route plan, build prompt text, inject docs, or select tools dynamically.
