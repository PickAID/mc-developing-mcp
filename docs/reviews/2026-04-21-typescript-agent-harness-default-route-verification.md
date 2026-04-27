# TypeScript Agent Harness Default Route Verification
Date: 2026-04-21
Author: m1hono
Status: PASS

## Required Evidence
- RED test exists and fails before the route helper is implemented
- `agent-harness` consumes `defaultRoutingScenario` into a minimal default route plan
- route steps stay intentionally small and scenario-driven
- package-level `pnpm --filter @mcpskill/agent-harness test` works after the script fix
- focused package build/test verification passes
- root typecheck passes
- root `pnpm test` passes
- Go-tree checksum baseline still matches

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run packages/agent-harness/src/route.test.ts
pnpm exec vitest run packages/agent-harness/src/route.test.ts
pnpm exec vitest run packages/agent-harness/src/scenario.test.ts
pnpm exec tsc -b packages/shared-types packages/runtime-manager packages/agent-harness packages/workspace-detector apps/agent-runtime apps/mcp-server
pnpm --filter @mcpskill/agent-harness test
pnpm --filter @mcpskill/agent-harness test
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
pnpm exec tsc -b
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e '...direct default-route sampling script...'
```

## Command Results

### RED: `pnpm exec vitest run packages/agent-harness/src/route.test.ts`
- Exit code: `1`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

FAIL  packages/agent-harness/src/route.test.ts [ packages/agent-harness/src/route.test.ts ]
Error: Cannot find module './route.js' imported from '/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness/src/route.test.ts'
 ❯ packages/agent-harness/src/route.test.ts:9:1
      7| } from "@mcpskill/shared-types";
      8|
      9| import {
       | ^
     10|   buildHarnessDefaultRoute,
     11|   buildHarnessDefaultRouteFromBootstrap

Caused by: Error: Failed to load url ./route.js (resolved id: ./route.js) in /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness/src/route.test.ts. Does the file exist?

Test Files  1 failed (1)
     Tests  no tests
Start at  05:58:52
Duration  417ms (transform 20ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 56ms)
```

### Initial GREEN: `pnpm exec vitest run packages/agent-harness/src/route.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms

Test Files  1 passed (1)
     Tests  6 passed (6)
Start at  06:01:24
Duration  669ms (transform 77ms, setup 0ms, collect 70ms, tests 2ms, environment 0ms, prepare 321ms)
```

### Regression guard: `pnpm exec vitest run packages/agent-harness/src/scenario.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/agent-harness/src/scenario.test.ts (11 tests) 5ms

Test Files  1 passed (1)
     Tests  11 passed (11)
Start at  06:01:24
Duration  700ms (transform 27ms, setup 0ms, collect 24ms, tests 5ms, environment 0ms, prepare 275ms)
```

### Initial focused build attempt: `pnpm exec tsc -b packages/shared-types packages/runtime-manager packages/agent-harness packages/workspace-detector apps/agent-runtime apps/mcp-server`
- Exit code: `2`

```text
packages/agent-harness/src/route.ts(34,21): error TS2339: Property 'defaultRoutingScenario' does not exist on type 'HarnessScenarioDetection'.
  Property 'defaultRoutingScenario' does not exist on type '{ scenario: "unknown-workspace"; reasons: string[]; }'.
```

### Focused build: `pnpm exec tsc -b packages/shared-types packages/runtime-manager packages/agent-harness packages/workspace-detector apps/agent-runtime apps/mcp-server`
- Exit code: `0`
- stdout/stderr: no output

### Initial package test script attempt: `pnpm --filter @mcpskill/agent-harness test`
- Exit code: `1`

```text
> @mcpskill/agent-harness@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness
> vitest run src/*.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness

No test files found, exiting with code 1

filter: src/route.test.ts, src/scenario.test.ts
include: tests/**/*.test.ts, apps/**/*.test.ts, packages/**/*.test.ts
```

### Fixed package test script: `pnpm --filter @mcpskill/agent-harness test`
- Exit code: `0`

```text
> @mcpskill/agent-harness@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness
> vitest run --root ../.. packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms

Test Files  2 passed (2)
     Tests  17 passed (17)
Start at  06:05:49
Duration  740ms (transform 100ms, setup 0ms, collect 102ms, tests 5ms, environment 0ms, prepare 186ms)
```

### Focused suite: `pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ tests/monorepo/foundation.test.ts (2 tests) 3ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 57ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 10ms
✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 18ms

Test Files  8 passed (8)
     Tests  35 passed (35)
Start at  06:05:49
Duration  889ms (transform 333ms, setup 0ms, collect 762ms, tests 97ms, environment 1ms, prepare 727ms)
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

✓ tests/monorepo/foundation.test.ts (2 tests) 1ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 3ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 3ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 6ms
✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 12ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 35ms

Test Files  8 passed (8)
     Tests  35 passed (35)
Start at  06:06:12
Duration  340ms (transform 283ms, setup 0ms, collect 499ms, tests 64ms, environment 1ms, prepare 460ms)
```

### Go checksum baseline: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Output pattern: all checked entries returned `: OK`
- Sample lines:

```text
testdata/scenarios/modpack_external_crash/logs/latest.log: OK
```

## Direct Return Samples

### `./node_modules/.bin/tsx -e '...direct default-route sampling script...'`
- Exit code: `0`

```json
{
  "unknown": {
    "scenario": "unknown-workspace",
    "reasons": [
      "workspace context is unavailable"
    ],
    "steps": []
  },
  "java": {
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
  "kubejs": {
    "scenario": "kubejs-workspace",
    "reasons": [
      "workspace descriptor reports KubeJS or ProbeJS support",
      "default KubeJS routing should inspect ProbeJS or d.ts context before docs"
    ],
    "defaultRoutingScenario": "kubejs_script",
    "steps": [
      "probejs_types",
      "docs_lookup"
    ]
  },
  "datapack": {
    "scenario": "datapack-workspace",
    "reasons": [
      "workspace descriptor reports datapack content",
      "default datapack routing should inspect datapack files before docs"
    ],
    "defaultRoutingScenario": "datapack_lookup",
    "steps": [
      "datapack_files",
      "docs_lookup"
    ]
  },
  "modpack": {
    "scenario": "modpack-workspace",
    "reasons": [
      "workspace descriptor reports a modpack workspace",
      "default project-symbol routing should inspect workspace source before docs"
    ],
    "defaultRoutingScenario": "project_symbol",
    "steps": [
      "workspace_source",
      "docs_lookup"
    ]
  },
  "bootstrap": {
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
- `buildHarnessDefaultRoute()` now turns the existing scenario detection result into a stable minimal route plan instead of leaving `defaultRoutingScenario` unused.
- `project_symbol` currently maps to `["workspace_source", "docs_lookup"]`.
- `kubejs_script` currently maps to `["probejs_types", "docs_lookup"]`.
- `datapack_lookup` currently maps to `["datapack_files", "docs_lookup"]`.
- `unknown-workspace` intentionally returns no route steps instead of inventing a fallback route.
- `buildHarnessDefaultRouteFromBootstrap(...)` stays a thin adapter over `{ workspaceContext?: ... }`.
- The slice remains intentionally small: no request-intent planner, no tool executor, no docs injector, and no crash-log branch was added here.
