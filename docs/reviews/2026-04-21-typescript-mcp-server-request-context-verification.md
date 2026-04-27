# TypeScript MCP Server Request Context Verification
Date: 2026-04-21
Author: m1hono
Status: PASS

## Scope
- add a request-scoped `McpServerRequestContext` layer for `apps/mcp-server`
- compose `harnessSnapshot`, `harnessBrief`, and request-aware `taskBrief` into a single MCP-facing helper
- keep the current MCP bootstrap transport-agnostic instead of mutating server startup behavior too early
- verify package-local test execution works correctly under the monorepo `vitest` root config

## Files
- `packages/shared-types/src/runtime.ts`
- `packages/agent-harness/src/task-brief.ts`
- `apps/mcp-server/src/request-context.ts`
- `apps/mcp-server/src/request-context.test.ts`
- `apps/mcp-server/src/bootstrap.ts`
- `apps/mcp-server/src/bootstrap.test.ts`
- `apps/mcp-server/src/index.ts`
- `apps/mcp-server/package.json`
- `apps/mcp-server/tsconfig.json`

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run apps/mcp-server/src/request-context.test.ts
pnpm exec tsc -b
pnpm --filter @mcpskill/mcp-server test
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts packages/agent-harness/src/task-brief.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts apps/mcp-server/src/request-context.test.ts
pnpm exec tsc -b
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e "import { buildMcpServerBootstrap, buildMcpServerRequestContextFromBootstrap } from './apps/mcp-server/src/index.ts'; void (async () => { const bootstrap = await buildMcpServerBootstrap({ runtimeRoot: '/tmp/mcpskill-runtime', workspace: { workspaceRoot: './testdata/scenarios/modpack_kubejs' } }); const context = buildMcpServerRequestContextFromBootstrap({ workspaceContext: bootstrap.workspaceContext, requestText: 'Add a KubeJS startup_scripts recipe for this modpack.' }); console.log(JSON.stringify({ appId: context.appId, requestText: context.requestText, workspaceKind: context.harnessSnapshot.workspaceKind, routePlan: context.harnessSnapshot.routePlan, harnessPreferredTools: context.harnessBrief.preferredTools, taskIntent: context.taskBrief.intent, taskRoute: context.taskBrief.taskRoute, promptFragments: context.taskBrief.promptFragments.filter((fragment) => fragment.id === 'kubejs_authoring_policy' || fragment.id.startsWith('task_')) }, null, 2)); })();"
./node_modules/.bin/tsx -e "import { buildMcpServerBootstrap, buildMcpServerRequestContextFromBootstrap } from './apps/mcp-server/src/index.ts'; void (async () => { const bootstrap = await buildMcpServerBootstrap({ runtimeRoot: '/tmp/mcpskill-runtime', workspace: { workspaceRoot: './testdata/scenarios/modpack_external_crash' } }); const context = buildMcpServerRequestContextFromBootstrap({ workspaceContext: bootstrap.workspaceContext, requestText: 'The server crashes on startup and latest.log shows an exception in a mod.' }); console.log(JSON.stringify({ appId: context.appId, requestText: context.requestText, workspaceKind: context.harnessSnapshot.workspaceKind, facts: context.harnessSnapshot.facts, routePlan: context.harnessSnapshot.routePlan, harnessPreferredTools: context.harnessBrief.preferredTools, taskIntent: context.taskBrief.intent, taskRoute: context.taskBrief.taskRoute, promptFragments: context.taskBrief.promptFragments.filter((fragment) => fragment.id.startsWith('task_')) }, null, 2)); })();"
```

## Command Results

### Focused request-context test
- Command: `pnpm exec vitest run apps/mcp-server/src/request-context.test.ts`
- Exit code: `0`

```text
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 5ms

Test Files  1 passed (1)
     Tests  2 passed (2)
Start at  00:53:15
Duration  489ms (transform 113ms, setup 0ms, collect 143ms, tests 5ms, environment 0ms, prepare 105ms)
```

### TypeScript build before package-script fix
- Command: `pnpm exec tsc -b`
- Exit code: `0`
- stdout/stderr: empty

### RED: package suite exposed a real script-path bug
- Command: `pnpm --filter @mcpskill/mcp-server test`
- Initial exit code: `1`
- Cause: `apps/mcp-server/package.json` ran `vitest` from the package directory while passing monorepo-root test paths, so the package-local process could not match files under the root `vitest` include rules

```text
> @mcpskill/mcp-server@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps/mcp-server
> vitest run apps/mcp-server/src/bootstrap.test.ts apps/mcp-server/src/request-context.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps/mcp-server

No test files found, exiting with code 1

filter: apps/mcp-server/src/bootstrap.test.ts, apps/mcp-server/src/request-context.test.ts
include: tests/**/*.test.ts, apps/**/*.test.ts, packages/**/*.test.ts
```

### Fix applied
- `apps/mcp-server/package.json`
- change the test script to run `vitest` with `--root ../..` so package-local execution still uses the monorepo root and include patterns

### GREEN: package suite after script fix
- Command: `pnpm --filter @mcpskill/mcp-server test`
- Exit code: `0`

```text
> @mcpskill/mcp-server@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps/mcp-server
> vitest run --root ../.. apps/mcp-server/src/bootstrap.test.ts apps/mcp-server/src/request-context.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 4ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 5ms

Test Files  2 passed (2)
     Tests  4 passed (4)
Start at  00:54:51
Duration  234ms (transform 59ms, setup 0ms, collect 129ms, tests 9ms, environment 0ms, prepare 61ms)
```

### Focused regression
- Exit code: `0`

```text
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 5ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 1ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 3ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 1ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 2ms
✓ tests/monorepo/foundation.test.ts (2 tests) 3ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 62ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 8ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 9ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 23ms

Test Files  15 passed (15)
     Tests  57 passed (57)
Start at  00:55:05
Duration  452ms (transform 569ms, setup 0ms, collect 1.22s, tests 126ms, environment 2ms, prepare 1.06s)
```

### TypeScript build after package-script fix
- Command: `pnpm exec tsc -b`
- Exit code: `0`
- stdout/stderr: empty

### Root tests
- Command: `pnpm test`
- Exit code: `0`

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> vitest run

✓ packages/agent-harness/src/intent.test.ts (4 tests) 1ms
✓ tests/monorepo/foundation.test.ts (2 tests) 1ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 2ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 2ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 3ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 5ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 7ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 3ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 36ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 6ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 4ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 12ms

Test Files  15 passed (15)
     Tests  57 passed (57)
Start at  00:55:21
Duration  408ms (transform 530ms, setup 0ms, collect 1.33s, tests 88ms, environment 1ms, prepare 1.09s)
```

### Go baseline checksum
- Command: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Result: every checked entry returned `OK`
- Sample output:

```text
testdata/scenarios/modpack_external_crash/logs/latest.log: OK
```

## Direct Runtime Samples

### KubeJS request context on `testdata/scenarios/modpack_kubejs`
- Exit code: `0`

```json
{
  "appId": "mcp-server",
  "requestText": "Add a KubeJS startup_scripts recipe for this modpack.",
  "workspaceKind": "modpack",
  "routePlan": {
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
  "harnessPreferredTools": [
    "source.bundle",
    "context.query",
    "workspace.analyze"
  ],
  "taskIntent": {
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

### Crash-triage request context on `testdata/scenarios/modpack_external_crash`
- Exit code: `0`
- Note: this fixture still classifies as `java-mod`, because the detector only sees Gradle plus logs; the request-context layer still specializes correctly to `crash_triage`

```json
{
  "appId": "mcp-server",
  "requestText": "The server crashes on startup and latest.log shows an exception in a mod.",
  "workspaceKind": "java-mod",
  "facts": {
    "hasGradle": true,
    "hasJavaSource": false,
    "hasKubeJS": false,
    "hasProbeJS": false,
    "hasDatapack": false,
    "buildFileCount": 1,
    "javaSourceRootCount": 0,
    "datapackRootCount": 0,
    "logPathCount": 1
  },
  "routePlan": {
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
  "harnessPreferredTools": [
    "source.bundle",
    "context.query",
    "workspace.analyze"
  ],
  "taskIntent": {
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
