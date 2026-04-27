# TypeScript Agent Harness Task Brief Verification
Date: 2026-04-21
Author: m1hono
Status: PASS

## Scope
- add a request-aware `task brief` layer on top of workspace snapshot, authoring policy, and task-route logic
- keep bootstrap contracts unchanged
- make prompt injection consume task intent and task route directly
- expose task-level prompt fragments for later MCP/runtime request handling

## Files
- `packages/shared-types/src/runtime.ts`
- `packages/agent-harness/src/task-brief.ts`
- `packages/agent-harness/src/task-brief.test.ts`
- `packages/agent-harness/src/index.ts`
- `packages/agent-harness/package.json`

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run packages/agent-harness/src/task-brief.test.ts
pnpm exec tsc -b
pnpm --filter @mcpskill/agent-harness test
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts packages/agent-harness/src/task-brief.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e "import { buildHarnessTaskBrief } from './packages/agent-harness/src/index.ts'; import { detectWorkspace } from './packages/workspace-detector/src/detect.ts'; void (async () => { const descriptor = await detectWorkspace('./testdata/scenarios/modpack_kubejs'); const brief = buildHarnessTaskBrief({ workspaceRoot: descriptor.root, detectorPackage: '@mcpskill/workspace-detector', descriptor }, 'Add a KubeJS startup_scripts recipe for this modpack.'); console.log(JSON.stringify({ intent: brief.intent, taskRoute: brief.taskRoute, preferredTools: brief.preferredTools, promptFragments: brief.promptFragments.filter((fragment) => fragment.id.startsWith('task_') || fragment.id === 'kubejs_authoring_policy') }, null, 2)); })();"
./node_modules/.bin/tsx -e "import { buildHarnessTaskBrief } from './packages/agent-harness/src/index.ts'; import { detectWorkspace } from './packages/workspace-detector/src/detect.ts'; void (async () => { const descriptor = await detectWorkspace('./testdata/scenarios/modpack_external_crash'); const brief = buildHarnessTaskBrief({ workspaceRoot: descriptor.root, detectorPackage: '@mcpskill/workspace-detector', descriptor }, 'The server crashes on startup and latest.log shows an exception in a mod.'); console.log(JSON.stringify({ intent: brief.intent, taskRoute: brief.taskRoute, preferredTools: brief.preferredTools, promptFragments: brief.promptFragments.filter((fragment) => fragment.id.startsWith('task_')) }, null, 2)); })();"
```

## Command Results

### Initial RED: `pnpm exec vitest run packages/agent-harness/src/task-brief.test.ts`
- Exit code: `1`
- Cause: task brief intentionally preserved base brief fragments, but the new test asserted an exact prompt fragment array instead of containment

```text
❯ packages/agent-harness/src/task-brief.test.ts (2 tests | 2 failed) 10ms
  × buildHarnessTaskBrief > builds a crash-triage task brief with log-first routing 8ms
    → expected { snapshot: { …(7) }, …(6) } to match object { intent: { …(2) }, …(3) }
  × buildHarnessTaskBrief > builds a KubeJS task brief with authoring policy and ProbeJS-first routing 1ms
    → expected { snapshot: { …(7) }, …(6) } to match object { …(5) }

FAIL  packages/agent-harness/src/task-brief.test.ts > buildHarnessTaskBrief > builds a crash-triage task brief with log-first routing
AssertionError: expected { snapshot: { …(7) }, …(6) } to match object { intent: { …(2) }, …(3) }

- Expected
+ Received

@@ -9,14 +9,19 @@
     "context.query",
   ],
   "promptFragments": [
     {
       "id": "workspace_summary",
+      "text": "Workspace summary: kind=modpack; runtime=unavailable; gradle=yes; java=no; kubejs=no; probejs=no; datapack=no.",
     },
     {
       "id": "route_policy",
       "text": "Default route: project_symbol via workspace_source -> docs_lookup.",
+    },
+    {
+      "id": "tool_policy",
+      "text": "Preferred tools: source.bundle -> context.query -> workspace.analyze. Use migration.analyze only for explicit version migration requests.",
     },
     {
       "id": "task_intent_summary",
       "text": "Task intent: crash_triage; confidence=high.",
     },
```

### GREEN: `pnpm exec vitest run packages/agent-harness/src/task-brief.test.ts`
- Exit code: `0`

```text
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 3ms

Test Files  1 passed (1)
     Tests  2 passed (2)
Start at  22:27:45
Duration  475ms (transform 43ms, setup 0ms, collect 44ms, tests 3ms, environment 0ms, prepare 48ms)
```

### TypeScript build: `pnpm exec tsc -b`
- Exit code: `0`
- stdout/stderr: empty

### Package suite: `pnpm --filter @mcpskill/agent-harness test`
- Exit code: `0`

```text
> @mcpskill/agent-harness@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness
> vitest run --root ../.. packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts packages/agent-harness/src/task-brief.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts

✓ packages/agent-harness/src/route.test.ts (6 tests) 4ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 3ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 6ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 2ms

Test Files  8 passed (8)
     Tests  36 passed (36)
Start at  22:28:28
Duration  1.17s (transform 797ms, setup 0ms, collect 2.36s, tests 25ms, environment 1ms, prepare 1.88s)
```

### Focused regression
Command:

```sh
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts packages/agent-harness/src/task-brief.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
```

- Exit code: `0`

```text
✓ packages/runtime-manager/src/policy.test.ts (1 test) 2ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 5ms
✓ tests/monorepo/foundation.test.ts (2 tests) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 8ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 7ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 42ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 28ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 4ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 210ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 17ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 71ms

Test Files  14 passed (14)
     Tests  55 passed (55)
Start at  22:28:28
Duration  1.93s (transform 1.99s, setup 0ms, collect 6.67s, tests 404ms, environment 2ms, prepare 2.84s)
```

### Root tests: `pnpm test`
- Exit code: `0`

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> vitest run

✓ tests/monorepo/foundation.test.ts (2 tests) 9ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 3ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 4ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 15ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 124ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 42ms

Test Files  14 passed (14)
     Tests  55 passed (55)
Start at  22:28:29
Duration  1.80s (transform 2.72s, setup 0ms, collect 5.46s, tests 215ms, environment 1ms, prepare 4.18s)
```

### Go baseline checksum: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Result: every checked entry returned `OK`
- Sample output:

```text
testdata/scenarios/modpack_external_crash/logs/latest.log: OK
```

## Direct Runtime Samples

### KubeJS task brief sample on `testdata/scenarios/modpack_kubejs`
- Exit code: `0`

```json
{
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
  "preferredTools": [
    "context.query",
    "source.bundle",
    "workspace.analyze"
  ],
  "promptFragments": [
    {
      "id": "kubejs_authoring_policy",
      "text": "KubeJS authoring policy: treat KubeJS as Minecraft scripting infrastructure rather than generic JS, organize scripts by lifecycle and event domain, avoid arbitrary const sprawl when named functions or clear registrations read better, avoid persistent console.* logging in committed scripts, prefer explicit debug gating for temporary diagnostics, and rely on ProbeJS, workspace facts, and modding docs before generic JavaScript guesses."
    },
    {
      "id": "task_intent_summary",
      "text": "Task intent: kubejs_authoring; confidence=high."
    },
    {
      "id": "task_route_policy",
      "text": "Task route: kubejs_authoring via probejs_types -> docs_lookup."
    },
    {
      "id": "task_tool_policy",
      "text": "Task tools: context.query -> source.bundle -> workspace.analyze."
    }
  ]
}
```

### Crash triage task brief sample on `testdata/scenarios/modpack_external_crash`
- Exit code: `0`

```json
{
  "intent": {
    "id": "crash_triage",
    "confidence": "high",
    "reasons": [
      "request text mentions crash or log-triage keywords",
      "workspace snapshot exposes log files for crash triage"
    ]
  },
  "taskRoute": {
    "intent": {
      "id": "crash_triage",
      "confidence": "high",
      "reasons": [
        "request text mentions crash or log-triage keywords",
        "workspace snapshot exposes log files for crash triage"
      ]
    },
    "reasons": [
      "crash triage should inspect log files before source or docs"
    ],
    "steps": [
      "log_files",
      "workspace_source",
      "docs_lookup"
    ],
    "preferredTools": [
      "workspace.analyze",
      "source.bundle",
      "context.query"
    ]
  },
  "preferredTools": [
    "workspace.analyze",
    "source.bundle",
    "context.query"
  ],
  "promptFragments": [
    {
      "id": "task_intent_summary",
      "text": "Task intent: crash_triage; confidence=high."
    },
    {
      "id": "task_route_policy",
      "text": "Task route: crash_triage via log_files -> workspace_source -> docs_lookup."
    },
    {
      "id": "task_tool_policy",
      "text": "Task tools: workspace.analyze -> source.bundle -> context.query."
    }
  ]
}
```

## Observed Behavior
- request-aware harness data now exists as a single reusable object instead of separate intent, route, and prompt helper calls
- base workspace prompt fragments are preserved, then task-level prompt fragments are appended
- `task brief` is now the cleanest integration point for future MCP request handling because it already carries prompt-ready task policy and tool ordering
