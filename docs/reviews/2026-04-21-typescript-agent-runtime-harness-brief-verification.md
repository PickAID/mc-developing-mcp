# TypeScript Agent Runtime Harness Brief Verification
Date: 2026-04-21
Author: m1hono
Status: PASS

## Required Evidence
- RED tests exist before the harness brief builder and bootstrap field are implemented
- the harness brief contains stable harness tool names
- the harness brief contains prompt injection fragments derived from workspace state
- `agent-runtime` attaches `harnessBrief` only when `workspace` input is present
- package-level `pnpm --filter @mcpskill/agent-harness test` remains green
- focused suite passes
- root typecheck passes
- root `pnpm test` passes
- Go-tree checksum baseline still matches

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run packages/agent-harness/src/brief.test.ts
pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts
pnpm exec vitest run packages/agent-harness/src/brief.test.ts
pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts
pnpm --filter @mcpskill/agent-harness test
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
pnpm exec tsc -b
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e '...direct harness brief sampling script...'
```

## Command Results

### RED: `pnpm exec vitest run packages/agent-harness/src/brief.test.ts`
- Exit code: `1`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

FAIL  packages/agent-harness/src/brief.test.ts [ packages/agent-harness/src/brief.test.ts ]
Error: Cannot find module './brief.js' imported from '/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness/src/brief.test.ts'
 ❯ packages/agent-harness/src/brief.test.ts:9:1
      7| } from "@mcpskill/shared-types";
      8|
      9| import {
       | ^
     10|   buildHarnessBrief,
     11|   buildHarnessBriefFromBootstrap

Caused by: Error: Failed to load url ./brief.js (resolved id: ./brief.js) in /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness/src/brief.test.ts. Does the file exist?

Test Files  1 failed (1)
     Tests  no tests
Start at  16:09:03
Duration  411ms (transform 22ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 91ms)
```

### RED: `pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts`
- Exit code: `1`

```text
❯ apps/agent-runtime/src/bootstrap.test.ts (2 tests | 1 failed) 14ms
  ✓ buildAgentRuntimeBootstrap > keeps the legacy string bootstrap API compatible 1ms
  × buildAgentRuntimeBootstrap > attaches detected workspace context, route data, and a harness brief when a workspace root is provided 13ms
    → expected undefined to match object { snapshot: { …(2) }, …(3) }
```

### GREEN: `pnpm exec vitest run packages/agent-harness/src/brief.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/agent-harness/src/brief.test.ts (3 tests) 9ms

Test Files  1 passed (1)
     Tests  3 passed (3)
Start at  17:02:05
Duration  875ms (transform 104ms, setup 0ms, collect 180ms, tests 9ms, environment 0ms, prepare 197ms)
```

### GREEN: `pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 20ms

Test Files  1 passed (1)
     Tests  2 passed (2)
Start at  17:05:57
Duration  752ms (transform 117ms, setup 0ms, collect 143ms, tests 20ms, environment 0ms, prepare 160ms)
```

### Package suite: `pnpm --filter @mcpskill/agent-harness test`
- Exit code: `0`

```text
> @mcpskill/agent-harness@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness
> vitest run --root ../.. packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 4ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 3ms

Test Files  4 passed (4)
     Tests  23 passed (23)
Start at  17:02:06
Duration  538ms (transform 166ms, setup 0ms, collect 281ms, tests 14ms, environment 0ms, prepare 424ms)
```

### Focused suite: `pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/agent-harness/src/brief.test.ts (3 tests) 2ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 5ms
✓ tests/monorepo/foundation.test.ts (2 tests) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 54ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 7ms
✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 16ms

Test Files  10 passed (10)
     Tests  41 passed (41)
Start at  17:06:23
Duration  1.08s (transform 817ms, setup 0ms, collect 1.64s, tests 94ms, environment 1ms, prepare 2.37s)
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

✓ tests/monorepo/foundation.test.ts (2 tests) 3ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 4ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 4ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 4ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 6ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 45ms
✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 16ms

Test Files  10 passed (10)
     Tests  41 passed (41)
Start at  17:06:23
Duration  1.08s (transform 1.13s, setup 0ms, collect 2.03s, tests 91ms, environment 1ms, prepare 2.49s)
```

### Go checksum baseline: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Output pattern: all checked entries returned `: OK`
- Sample lines:

```text
testdata/scenarios/modpack_external_crash/logs/latest.log: OK
```

## Direct Bootstrap Sample

### `./node_modules/.bin/tsx -e '...direct harness brief sampling script...'`
- Exit code: `0`

```json
{
  "harnessBrief": {
    "availableTools": [
      "workspace.analyze",
      "source.bundle",
      "context.query",
      "migration.analyze"
    ],
    "preferredTools": [
      "source.bundle",
      "context.query",
      "workspace.analyze"
    ],
    "promptFragments": [
      {
        "id": "workspace_summary",
        "text": "Workspace summary: kind=java-mod; runtime=forge 1.20.1; gradle=yes; java=yes; kubejs=no; probejs=no; datapack=no."
      },
      {
        "id": "route_policy",
        "text": "Default route: project_symbol via workspace_source -> docs_lookup."
      },
      {
        "id": "tool_policy",
        "text": "Preferred tools: source.bundle -> context.query -> workspace.analyze. Use migration.analyze only for explicit version migration requests."
      }
    ]
  }
}
```

## Observed Values
- `harnessBrief` now explicitly carries the stable harness tool names `workspace.analyze`, `source.bundle`, `context.query`, and `migration.analyze`.
- `harnessBrief.promptFragments` now provides prompt injection-ready text for workspace summary, route policy, and tool policy.
- `agent-runtime` now exposes the three progressively higher-level layers together: raw `workspaceContext`, structured `harnessSnapshot`, and prompt/tool-facing `harnessBrief`.
- The recommended tools are scenario-sensitive while the available tool set stays stable.
- This slice still does not execute tools, mutate prompts at runtime, or inject retrieved docs shards.
