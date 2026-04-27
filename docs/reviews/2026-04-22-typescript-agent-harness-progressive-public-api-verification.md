# TypeScript Agent Harness Progressive Public API Verification
Date: 2026-04-22
Author: m1hono
Status: PASS

## Scope
- reduce `@mcpskill/agent-harness` public exports to a progressive minimal surface
- add `@mcpskill/agent-harness/internal` for app-layer composition needs
- move `agent-runtime` and `mcp-server` to the internal subpath instead of the public root
- verify the package still supports the current request-planning chain without widening the public API again

## Files
- `packages/agent-harness/src/public-api.test.ts`
- `packages/agent-harness/src/index.ts`
- `packages/agent-harness/src/internal.ts`
- `packages/agent-harness/package.json`
- `apps/agent-runtime/src/bootstrap.ts`
- `apps/mcp-server/src/request-context.ts`

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run packages/agent-harness/src/public-api.test.ts
pnpm exec tsc -b
pnpm --filter @mcpskill/agent-harness test
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts packages/agent-harness/src/task-brief.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/agent-harness/src/public-api.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts apps/mcp-server/src/request-context.test.ts apps/mcp-server/src/request-plan.test.ts apps/mcp-server/src/public-api.test.ts
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e "import * as api from './packages/agent-harness/src/index.ts'; console.log(JSON.stringify(Object.keys(api).sort(), null, 2));"
./node_modules/.bin/tsx -e \"import { buildHarnessTaskBrief } from './packages/agent-harness/src/index.ts'; import { detectWorkspace } from './packages/workspace-detector/src/detect.ts'; void (async () => { const descriptor = await detectWorkspace('./testdata/scenarios/modpack_kubejs'); const brief = buildHarnessTaskBrief({ workspaceRoot: descriptor.root, detectorPackage: '@mcpskill/workspace-detector', descriptor }, 'Add a KubeJS startup_scripts recipe for this modpack.'); console.log(JSON.stringify({ exports: ['AGENT_HARNESS_PACKAGE', 'buildHarnessSnapshot', 'buildHarnessTaskBrief'], intent: brief.intent, taskRoute: brief.taskRoute, promptFragments: brief.promptFragments.map((fragment) => fragment.id) }, null, 2)); })();\"
printf '%s\n' 'apps/agent-runtime/src/bootstrap.ts' && sed -n '1,40p' apps/agent-runtime/src/bootstrap.ts
printf '%s\n' 'apps/mcp-server/src/request-context.ts' && sed -n '1,40p' apps/mcp-server/src/request-context.ts
```

## Command Results

### RED: `pnpm exec vitest run packages/agent-harness/src/public-api.test.ts`
- Exit code: `1`
- Cause: the package root exported too many low-level helpers directly

```text
FAIL  packages/agent-harness/src/public-api.test.ts > @mcpskill/agent-harness public api > keeps the package entrypoint progressive and minimal
AssertionError: expected [ 'AGENT_HARNESS_PACKAGE', …(18) ] to deeply equal [ 'AGENT_HARNESS_PACKAGE', …(2) ]

- Expected
+ Received

  [
    "AGENT_HARNESS_PACKAGE",
+   "buildHarnessAuthoringPolicy",
+   "buildHarnessAuthoringPolicyFromBootstrap",
+   "buildHarnessBrief",
+   "buildHarnessBriefFromBootstrap",
+   "buildHarnessBriefFromSnapshot",
+   "buildHarnessDefaultRoute",
+   "buildHarnessDefaultRouteFromBootstrap",
    "buildHarnessSnapshot",
+   "buildHarnessSnapshotFromBootstrap",
    "buildHarnessTaskBrief",
+   "buildHarnessTaskBriefFromBootstrap",
+   "buildHarnessTaskBriefFromSnapshot",
+   "buildHarnessTaskRoute",
+   "buildHarnessTaskRouteFromSnapshot",
+   "detectHarnessScenario",
+   "detectHarnessScenarioFromBootstrap",
+   "detectHarnessTaskIntent",
+   "detectHarnessTaskIntentFromSnapshot",
  ]
```

### GREEN: `pnpm exec vitest run packages/agent-harness/src/public-api.test.ts`
- Exit code: `0`

```text
✓ packages/agent-harness/src/public-api.test.ts (1 test) 1ms

Test Files  1 passed (1)
     Tests  1 passed (1)
Start at  03:17:50
Duration  296ms (transform 35ms, setup 0ms, collect 37ms, tests 1ms, environment 0ms, prepare 58ms)
```

### TypeScript build
- Command: `pnpm exec tsc -b`
- Exit code: `0`
- stdout/stderr: empty

### Package suite
- Command: `pnpm --filter @mcpskill/agent-harness test`
- Exit code: `0`

```text
> @mcpskill/agent-harness@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness
> vitest run --root ../.. packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts packages/agent-harness/src/task-brief.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/agent-harness/src/public-api.test.ts

✓ packages/agent-harness/src/policy.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 3ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/public-api.test.ts (1 test) 1ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 3ms

Test Files  9 passed (9)
     Tests  37 passed (37)
Start at  03:18:09
Duration  341ms (transform 241ms, setup 0ms, collect 408ms, tests 22ms, environment 1ms, prepare 637ms)
```

### Focused regression
- Exit code: `0`

```text
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 1ms
✓ tests/monorepo/foundation.test.ts (2 tests) 1ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 4ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 4ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 4ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 56ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 11ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 24ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 12ms
✓ apps/mcp-server/src/public-api.test.ts (1 test) 2ms
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 13ms
✓ packages/agent-harness/src/public-api.test.ts (1 test) 1ms

Test Files  18 passed (18)
     Tests  61 passed (61)
Start at  03:18:30
Duration  490ms (transform 572ms, setup 0ms, collect 1.58s, tests 147ms, environment 2ms, prepare 1.38s)
```

### Root tests
- Command: `pnpm test`
- Exit code: `0`

```text
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 3ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ tests/monorepo/foundation.test.ts (2 tests) 3ms
✓ packages/agent-harness/src/public-api.test.ts (1 test) 1ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 4ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 9ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 45ms
✓ apps/mcp-server/src/public-api.test.ts (1 test) 1ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 7ms
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 10ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 18ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms

Test Files  18 passed (18)
     Tests  61 passed (61)
Start at  03:18:31
Duration  393ms (transform 589ms, setup 0ms, collect 1.51s, tests 117ms, environment 1ms, prepare 1.14s)
```

### Go baseline checksum
- Command: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Result: every checked entry returned `OK`

## Direct Runtime Samples

### Current `@mcpskill/agent-harness` public export keys
- Exit code: `0`

```json
[
  "AGENT_HARNESS_PACKAGE",
  "buildHarnessSnapshot",
  "buildHarnessTaskBrief"
]
```

### Progressive public usage sample
- Exit code: `0`

```json
{
  "exports": [
    "AGENT_HARNESS_PACKAGE",
    "buildHarnessSnapshot",
    "buildHarnessTaskBrief"
  ],
  "intent": {
    "id": "kubejs_authoring",
    "confidence": "high",
    "reasons": [
      "request text mentions KubeJS scripting keywords",
      "workspace snapshot exposes KubeJS or ProbeJS signals"
    ]
  },
  "taskRoute": {
    "intent": {
      "id": "kubejs_authoring",
      "confidence": "high",
      "reasons": [
        "request text mentions KubeJS scripting keywords",
        "workspace snapshot exposes KubeJS or ProbeJS signals"
      ]
    },
    "reasons": [
      "KubeJS authoring should inspect ProbeJS or d.ts context before docs"
    ],
    "steps": [
      "probejs_types",
      "docs_lookup"
    ],
    "preferredTools": [
      "context.query",
      "source.bundle",
      "workspace.analyze"
    ]
  },
  "promptFragments": [
    "workspace_summary",
    "route_policy",
    "tool_policy",
    "kubejs_authoring_policy",
    "task_intent_summary",
    "task_route_policy",
    "task_tool_policy"
  ]
}
```

## Existing Logic Search Findings
- `apps/agent-runtime` now imports fine-grained builders from `@mcpskill/agent-harness/internal` and keeps its own public surface thin.
- `apps/mcp-server` now does the same for request-context construction.
- The package root is now reserved for the progressive path; the internal subpath is the explicit signal that the caller is part of the composition layer, not the normal consumption path.

### Internal consumer sample
- Exit code: `0`

```text
apps/agent-runtime/src/bootstrap.ts
import {
  buildHarnessBriefFromSnapshot,
  buildHarnessSnapshot
} from "@mcpskill/agent-harness/internal";

apps/mcp-server/src/request-context.ts
import {
  buildHarnessBriefFromSnapshot,
  buildHarnessSnapshot,
  buildHarnessTaskBriefFromSnapshot
} from "@mcpskill/agent-harness/internal";
```

## Conclusion
- The package now supports your desired shape: progressive root API, explicit internal API, and no broad helper dump on the public entrypoint.
- The implementation pattern is already aligned with the same direction used in `agent-runtime` and `mcp-server`.
- This lowers API pollution without sacrificing internal composability.
