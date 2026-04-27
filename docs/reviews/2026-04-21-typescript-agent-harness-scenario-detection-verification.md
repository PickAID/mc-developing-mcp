# TypeScript Agent Harness Scenario Detection Verification
Date: 2026-04-21
Author: m1hono
Status: PASS

## Required Evidence
- RED test exists and fails for the missing scenario module before implementation
- `agent-harness` exports a minimal scenario detector driven by `workspaceContext.descriptor`
- scenario precedence is `modpack > kubejs > datapack > java-mod > unknown`
- scenario results encode the routing invariant in the public type surface
- bootstrap-shaped adapter is covered
- focused package build/test verification passes
- root typecheck passes
- root `pnpm test` passes
- Go-tree checksum baseline still matches

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run packages/agent-harness/src/scenario.test.ts
pnpm exec tsc -b packages/shared-types packages/runtime-manager packages/agent-harness packages/workspace-detector apps/agent-runtime apps/mcp-server
pnpm install --offline
ls -la packages/agent-harness/node_modules/@mcpskill
pnpm exec vitest run packages/agent-harness/src/scenario.test.ts
pnpm exec tsc -b packages/shared-types packages/runtime-manager packages/agent-harness packages/workspace-detector apps/agent-runtime apps/mcp-server
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
pnpm exec tsc -b
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e '...direct scenario sampling script...'
```

## Command Results

### RED: `pnpm exec vitest run packages/agent-harness/src/scenario.test.ts`
- Exit code: `1`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

FAIL  packages/agent-harness/src/scenario.test.ts [ packages/agent-harness/src/scenario.test.ts ]
Error: Cannot find module './scenario.js' imported from '/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness/src/scenario.test.ts'
 ❯ packages/agent-harness/src/scenario.test.ts:10:1
      8| } from "@mcpskill/shared-types";
      9|
     10| import {
       | ^
     11|   detectHarnessScenario,
     12|   detectHarnessScenarioFromBootstrap

Caused by: Error: Failed to load url ./scenario.js (resolved id: ./scenario.js) in /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness/src/scenario.test.ts. Does the file exist?

Test Files  1 failed (1)
     Tests  no tests
Start at  04:24:29
Duration  292ms (transform 16ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 66ms)
```

### Initial focused build attempt: `pnpm exec tsc -b packages/shared-types packages/runtime-manager packages/agent-harness packages/workspace-detector apps/agent-runtime apps/mcp-server`
- Exit code: `2`

```text
packages/agent-harness/src/scenario.ts(5,8): error TS2307: Cannot find module '@mcpskill/shared-types' or its corresponding type declarations.
```

### Dependency link refresh: `pnpm install --offline`
- Exit code: `0`

```text
Scope: all 15 workspace projects
Progress: resolved 0, reused 1, downloaded 0, added 0
Already up to date
Progress: resolved 106, reused 57, downloaded 0, added 0, done

Done in 392ms using pnpm v10.8.0
```

### Package link evidence: `ls -la packages/agent-harness/node_modules/@mcpskill`
- Exit code: `0`

```text
total 0
drwxr-xr-x@ 3 gedwen  staff  96 Apr 21 04:46 .
drwxr-xr-x@ 3 gedwen  staff  96 Apr 21 04:46 ..
lrwxr-xr-x@ 1 gedwen  staff  21 Apr 21 04:46 shared-types -> ../../../shared-types
```

### Initial GREEN: `pnpm exec vitest run packages/agent-harness/src/scenario.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/agent-harness/src/scenario.test.ts (6 tests) 2ms

Test Files  1 passed (1)
     Tests  6 passed (6)
Start at  04:44:33
Duration  303ms (transform 19ms, setup 0ms, collect 15ms, tests 2ms, environment 0ms, prepare 46ms)
```

### Post-review GREEN: `pnpm exec vitest run packages/agent-harness/src/scenario.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms

Test Files  1 passed (1)
     Tests  11 passed (11)
Start at  05:30:10
Duration  442ms (transform 38ms, setup 0ms, collect 41ms, tests 3ms, environment 0ms, prepare 55ms)
```

### Focused build: `pnpm exec tsc -b packages/shared-types packages/runtime-manager packages/agent-harness packages/workspace-detector apps/agent-runtime apps/mcp-server`
- Exit code: `0`
- stdout/stderr: no output

### Focused suite: `pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ tests/monorepo/foundation.test.ts (2 tests) 2ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 4ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 6ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 34ms
✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 18ms

Test Files  7 passed (7)
     Tests  29 passed (29)
Start at  05:30:27
Duration  483ms (transform 427ms, setup 0ms, collect 646ms, tests 67ms, environment 1ms, prepare 680ms)
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
✓ packages/runtime-manager/src/policy.test.ts (1 test) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 7ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 60ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 12ms
✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 22ms

Test Files  7 passed (7)
     Tests  29 passed (29)
Start at  05:30:34
Duration  616ms (transform 258ms, setup 0ms, collect 604ms, tests 107ms, environment 1ms, prepare 496ms)
```

### Go checksum baseline: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Output pattern: all checked entries returned `: OK`
- Sample lines:

```text
testdata/scenarios/modpack_external_crash/logs/latest.log: OK
```

## Direct Return Samples

### `./node_modules/.bin/tsx -e '...direct scenario sampling script...'`
- Exit code: `0`

```json
{
  "unknown": {
    "scenario": "unknown-workspace",
    "reasons": [
      "workspace context is unavailable"
    ]
  },
  "java": {
    "scenario": "java-mod-workspace",
    "reasons": [
      "workspace descriptor reports a Java mod workspace"
    ],
    "defaultRoutingScenario": "project_symbol"
  },
  "kubejs": {
    "scenario": "kubejs-workspace",
    "reasons": [
      "workspace descriptor reports KubeJS or ProbeJS support"
    ],
    "defaultRoutingScenario": "kubejs_script"
  },
  "datapack": {
    "scenario": "datapack-workspace",
    "reasons": [
      "workspace descriptor reports datapack content"
    ],
    "defaultRoutingScenario": "datapack_lookup"
  },
  "modpack": {
    "scenario": "modpack-workspace",
    "reasons": [
      "workspace descriptor reports a modpack workspace"
    ],
    "defaultRoutingScenario": "project_symbol"
  },
  "bootstrap": {
    "scenario": "java-mod-workspace",
    "reasons": [
      "workspace descriptor reports a Java mod workspace"
    ],
    "defaultRoutingScenario": "project_symbol"
  }
}
```

## Observed Values
- `detectHarnessScenario()` returns `unknown-workspace` when no `workspaceContext` exists.
- `descriptor.kind === "modpack"` wins even when KubeJS, ProbeJS, datapack, and Gradle signals also exist.
- KubeJS/ProbeJS support maps to `kubejs-workspace` and the existing routing scenario id `kubejs_script`.
- Datapack-only descriptors map to `datapack-workspace` with `datapack_lookup`.
- Java mod descriptors and generic Gradle/Java source signals map to `java-mod-workspace` with `project_symbol`.
- `detectHarnessScenarioFromBootstrap(...)` now accepts the minimal `{ workspaceContext?: ... }` shape and stays a thin adapter over that field.
- The public return type now encodes that every routed scenario carries a concrete `defaultRoutingScenario`, while `unknown-workspace` does not.
- The final scenario suite now locks descriptor-kind classification, flag-driven fallback classification, and the precedence edges `modpack > kubejs > datapack > java-mod > unknown`.
- The slice stayed minimal: no new planning layer, no tool routing engine, and no JDTLS/Gradle sidecar logic was introduced here.
