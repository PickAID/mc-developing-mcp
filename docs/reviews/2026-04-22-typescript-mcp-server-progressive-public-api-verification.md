# TypeScript MCP Server Progressive Public API Verification
Date: 2026-04-22
Author: m1hono
Status: PASS

## Scope
- reduce `@mcpskill/mcp-server` public exports to a progressive two-step API
- keep lower-level request-context and prompt-assembly helpers internal to the package
- verify this design aligns with already implemented repo patterns instead of inventing a new style

## Files
- `apps/mcp-server/src/public-api.test.ts`
- `apps/mcp-server/src/index.ts`
- `apps/mcp-server/package.json`

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run apps/mcp-server/src/public-api.test.ts
pnpm exec tsc -b
pnpm --filter @mcpskill/mcp-server test
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts packages/agent-harness/src/task-brief.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts apps/mcp-server/src/request-context.test.ts apps/mcp-server/src/request-plan.test.ts apps/mcp-server/src/public-api.test.ts
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e "import * as api from './apps/mcp-server/src/index.ts'; console.log(JSON.stringify(Object.keys(api).sort(), null, 2));"
./node_modules/.bin/tsx -e \"import { buildMcpServerBootstrap, buildMcpServerRequestPlan } from './apps/mcp-server/src/index.ts'; void (async () => { const bootstrap = await buildMcpServerBootstrap({ runtimeRoot: '/tmp/mcpskill-runtime', workspace: { workspaceRoot: './testdata/scenarios/modpack_kubejs' } }); const plan = buildMcpServerRequestPlan(bootstrap, 'Add a KubeJS startup_scripts recipe for this modpack.'); console.log(JSON.stringify({ exports: ['buildMcpServerBootstrap', 'buildMcpServerRequestPlan'], trace: plan.trace, preferredTools: plan.toolGuidance.preferredTools }, null, 2)); })();\"
printf '%s\n' 'apps/agent-runtime/src/index.ts' && sed -n '1,80p' apps/agent-runtime/src/index.ts
printf '%s\n' 'apps/mcp-server/src/index.ts' && sed -n '1,80p' apps/mcp-server/src/index.ts
printf '%s\n' 'packages/agent-harness/src/index.ts' && sed -n '1,220p' packages/agent-harness/src/index.ts
```

## Command Results

### RED: `pnpm exec vitest run apps/mcp-server/src/public-api.test.ts`
- Exit code: `1`
- Cause: the package entrypoint exposed too many helpers for external callers

```text
FAIL  apps/mcp-server/src/public-api.test.ts > @mcpskill/mcp-server public api > keeps the package entrypoint progressive and minimal
AssertionError: expected [ 'buildMcpServerBootstrap', …(5) ] to deeply equal [ 'buildMcpServerBootstrap', …(1) ]

- Expected
+ Received

  [
    "buildMcpServerBootstrap",
+   "buildMcpServerPromptAssembly",
+   "buildMcpServerRequestContext",
+   "buildMcpServerRequestContextFromBootstrap",
    "buildMcpServerRequestPlan",
+   "buildMcpServerRequestPlanFromBootstrap",
  ]
```

### GREEN: `pnpm exec vitest run apps/mcp-server/src/public-api.test.ts`
- Exit code: `0`

```text
✓ apps/mcp-server/src/public-api.test.ts (1 test) 2ms

Test Files  1 passed (1)
     Tests  1 passed (1)
Start at  02:34:07
Duration  439ms (transform 93ms, setup 0ms, collect 139ms, tests 2ms, environment 0ms, prepare 80ms)
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
> vitest run --root ../.. apps/mcp-server/src/bootstrap.test.ts apps/mcp-server/src/request-context.test.ts apps/mcp-server/src/request-plan.test.ts apps/mcp-server/src/public-api.test.ts

✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 6ms
✓ apps/mcp-server/src/public-api.test.ts (1 test) 1ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 4ms
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 6ms

Test Files  4 passed (4)
     Tests  7 passed (7)
Start at  02:34:31
Duration  275ms (transform 108ms, setup 0ms, collect 345ms, tests 17ms, environment 0ms, prepare 163ms)
```

### Focused regression
- Exit code: `0`

```text
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
✓ tests/monorepo/foundation.test.ts (2 tests) 2ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 3ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 33ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 45ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 6ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 6ms
✓ apps/mcp-server/src/public-api.test.ts (1 test) 2ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 18ms
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 22ms

Test Files  17 passed (17)
     Tests  60 passed (60)
Start at  02:34:44
Duration  826ms (transform 1.05s, setup 0ms, collect 2.82s, tests 155ms, environment 4ms, prepare 2.55s)
```

### Root tests
- Command: `pnpm test`
- Exit code: `0`

```text
✓ packages/runtime-manager/src/policy.test.ts (1 test) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 1ms
✓ tests/monorepo/foundation.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 4ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 3ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 3ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 36ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 6ms
✓ apps/mcp-server/src/public-api.test.ts (1 test) 1ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 7ms
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 12ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 21ms

Test Files  17 passed (17)
     Tests  60 passed (60)
Start at  02:34:44
Duration  808ms (transform 1000ms, setup 0ms, collect 3.19s, tests 110ms, environment 2ms, prepare 2.70s)
```

### Go baseline checksum
- Command: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Result: every checked entry returned `OK`

## Search Findings

### Current `@mcpskill/mcp-server` public export keys
- Exit code: `0`

```json
[
  "buildMcpServerBootstrap",
  "buildMcpServerRequestPlan"
]
```

### Public progressive usage sample
- Exit code: `0`

```json
{
  "exports": [
    "buildMcpServerBootstrap",
    "buildMcpServerRequestPlan"
  ],
  "trace": {
    "workspaceKind": "modpack",
    "defaultRouteScenario": "project_symbol",
    "defaultRouteSteps": [
      "workspace_source",
      "docs_lookup"
    ],
    "taskIntent": {
      "id": "kubejs_authoring",
      "confidence": "high",
      "reasons": [
        "request text mentions KubeJS scripting keywords",
        "workspace snapshot exposes KubeJS or ProbeJS signals"
      ]
    },
    "taskRouteReasons": [
      "KubeJS authoring should inspect ProbeJS or d.ts context before docs"
    ],
    "taskRouteSteps": [
      "probejs_types",
      "docs_lookup"
    ],
    "selectedPromptFragmentIds": [
      "workspace_summary",
      "route_policy",
      "tool_policy",
      "kubejs_authoring_policy",
      "task_intent_summary",
      "task_route_policy",
      "task_tool_policy"
    ]
  },
  "preferredTools": [
    "context.query",
    "source.bundle",
    "workspace.analyze"
  ]
}
```

### Existing implemented style in repo
- Exit code: `0`

```text
apps/agent-runtime/src/index.ts
export { buildAgentRuntimeBootstrap } from "./bootstrap.js";

apps/mcp-server/src/index.ts
export { buildMcpServerBootstrap } from "./bootstrap.js";
export { buildMcpServerRequestPlan } from "./request-plan.js";

packages/agent-harness/src/index.ts
export const AGENT_HARNESS_PACKAGE = "@mcpskill/agent-harness";
export { buildHarnessDefaultRoute, buildHarnessDefaultRouteFromBootstrap } from "./route.js";
export { buildHarnessBrief, buildHarnessBriefFromBootstrap, buildHarnessBriefFromSnapshot } from "./brief.js";
export { buildHarnessAuthoringPolicy, buildHarnessAuthoringPolicyFromBootstrap } from "./policy.js";
export { detectHarnessTaskIntent, detectHarnessTaskIntentFromSnapshot } from "./intent.js";
export { buildHarnessTaskRoute, buildHarnessTaskRouteFromSnapshot } from "./task-route.js";
export { buildHarnessTaskBrief, buildHarnessTaskBriefFromBootstrap, buildHarnessTaskBriefFromSnapshot } from "./task-brief.js";
export { buildHarnessSnapshot, buildHarnessSnapshotFromBootstrap } from "./snapshot.js";
export { detectHarnessScenario, detectHarnessScenarioFromBootstrap } from "./scenario.js";
```

## Conclusion
- `apps/agent-runtime` already implemented the thin progressive entrypoint pattern.
- `apps/mcp-server` now matches that same style at the app boundary.
- `packages/agent-harness` remains intentionally wide because it is an internal composition package, not the progressive app-facing entrypoint.
- This means the answer to your requirement is yes: public usage can stay progressive while the internal chain remains layered and testable.
