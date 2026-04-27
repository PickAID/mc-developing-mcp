# TypeScript MCP Server Request Plan Verification
Date: 2026-04-22
Author: m1hono
Status: PASS

## Scope
- add a transport-agnostic `McpServerRequestPlan` layer for `apps/mcp-server`
- assemble request-level prompt sections and prompt text from `taskBrief.promptFragments`
- expose structured tool guidance and request trace for later MCP handler wiring
- keep `request-context` as the lower-level source of truth instead of mixing planning into bootstrap

## Files
- `packages/shared-types/src/runtime.ts`
- `apps/mcp-server/src/prompt-assembly.ts`
- `apps/mcp-server/src/request-plan.ts`
- `apps/mcp-server/src/request-plan.test.ts`
- `apps/mcp-server/src/index.ts`
- `apps/mcp-server/package.json`

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run apps/mcp-server/src/request-plan.test.ts
pnpm exec tsc -b
pnpm --filter @mcpskill/mcp-server test
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts packages/agent-harness/src/task-brief.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts apps/mcp-server/src/request-context.test.ts apps/mcp-server/src/request-plan.test.ts
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e "import { buildMcpServerBootstrap, buildMcpServerRequestPlanFromBootstrap } from './apps/mcp-server/src/index.ts'; void (async () => { const bootstrap = await buildMcpServerBootstrap({ runtimeRoot: '/tmp/mcpskill-runtime', workspace: { workspaceRoot: './testdata/scenarios/modpack_kubejs' } }); const plan = buildMcpServerRequestPlanFromBootstrap({ workspaceContext: bootstrap.workspaceContext, requestText: 'Add a KubeJS startup_scripts recipe for this modpack.' }); console.log(JSON.stringify({ appId: plan.appId, requestText: plan.requestText, workspaceKind: plan.trace.workspaceKind, defaultRouteScenario: plan.trace.defaultRouteScenario, defaultRouteSteps: plan.trace.defaultRouteSteps, taskIntent: plan.trace.taskIntent, taskRouteSteps: plan.trace.taskRouteSteps, preferredTools: plan.toolGuidance.preferredTools, promptSections: plan.prompt.sections.map((section) => ({ id: section.id, title: section.title })), promptText: plan.prompt.text }, null, 2)); })();"
./node_modules/.bin/tsx -e "import { buildMcpServerBootstrap, buildMcpServerRequestPlanFromBootstrap } from './apps/mcp-server/src/index.ts'; void (async () => { const bootstrap = await buildMcpServerBootstrap({ runtimeRoot: '/tmp/mcpskill-runtime', workspace: { workspaceRoot: './testdata/scenarios/modpack_external_crash' } }); const plan = buildMcpServerRequestPlanFromBootstrap({ workspaceContext: bootstrap.workspaceContext, requestText: 'The server crashes on startup and latest.log shows an exception in a mod.' }); console.log(JSON.stringify({ appId: plan.appId, requestText: plan.requestText, workspaceKind: plan.trace.workspaceKind, defaultRouteScenario: plan.trace.defaultRouteScenario, defaultRouteSteps: plan.trace.defaultRouteSteps, taskIntent: plan.trace.taskIntent, taskRouteReasons: plan.trace.taskRouteReasons, taskRouteSteps: plan.trace.taskRouteSteps, preferredTools: plan.toolGuidance.preferredTools, promptSections: plan.prompt.sections.map((section) => ({ id: section.id, title: section.title })), promptText: plan.prompt.text }, null, 2)); })();"
```

## Command Results

### RED: `pnpm exec vitest run apps/mcp-server/src/request-plan.test.ts`
- Exit code: `1`
- Cause: the new request-plan module did not exist yet

```text
FAIL  apps/mcp-server/src/request-plan.test.ts [ apps/mcp-server/src/request-plan.test.ts ]
Error: Cannot find module './request-plan.js' imported from '/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps/mcp-server/src/request-plan.test.ts'
 ❯ apps/mcp-server/src/request-plan.test.ts:7:1
      5|
      6| import { buildMcpServerBootstrap } from "./bootstrap.js";
      7| import {
       | ^
      8|   buildMcpServerRequestPlan,
      9|   buildMcpServerRequestPlanFromBootstrap
```

### GREEN: `pnpm exec vitest run apps/mcp-server/src/request-plan.test.ts`
- Exit code: `0`

```text
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 7ms

Test Files  1 passed (1)
     Tests  2 passed (2)
Start at  02:18:26
Duration  435ms (transform 85ms, setup 0ms, collect 104ms, tests 7ms, environment 0ms, prepare 100ms)
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
> vitest run --root ../.. apps/mcp-server/src/bootstrap.test.ts apps/mcp-server/src/request-context.test.ts apps/mcp-server/src/request-plan.test.ts

✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 7ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 7ms
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 10ms

Test Files  3 passed (3)
     Tests  6 passed (6)
Start at  02:19:10
Duration  372ms (transform 103ms, setup 0ms, collect 260ms, tests 24ms, environment 1ms, prepare 137ms)
```

### Focused regression
- Exit code: `0`

```text
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 5ms
✓ tests/monorepo/foundation.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 2ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 3ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 3ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 3ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 2ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 53ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 10ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 25ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 11ms
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 16ms

Test Files  16 passed (16)
     Tests  59 passed (59)
Start at  02:19:23
Duration  989ms (transform 1.40s, setup 0ms, collect 3.09s, tests 144ms, environment 2ms, prepare 2.72s)
```

### Root tests
- Command: `pnpm test`
- Exit code: `0`

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> vitest run

✓ tests/monorepo/foundation.test.ts (2 tests) 1ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 4ms
✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 2ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 47ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 7ms
✓ apps/mcp-server/src/request-context.test.ts (2 tests) 10ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 21ms
✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 14ms

Test Files  16 passed (16)
     Tests  59 passed (59)
Start at  02:19:39
Duration  566ms (transform 886ms, setup 0ms, collect 1.81s, tests 122ms, environment 2ms, prepare 1.64s)
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

### KubeJS authoring request plan on `testdata/scenarios/modpack_kubejs`
- Exit code: `0`
- Note: the workspace still classifies as `modpack`, but the request plan correctly upgrades the task route to KubeJS-aware prompt assembly and tool order

```json
{
  "appId": "mcp-server",
  "requestText": "Add a KubeJS startup_scripts recipe for this modpack.",
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
  "taskRouteSteps": [
    "probejs_types",
    "docs_lookup"
  ],
  "preferredTools": [
    "context.query",
    "source.bundle",
    "workspace.analyze"
  ],
  "promptSections": [
    {
      "id": "request_text",
      "title": "User Request"
    },
    {
      "id": "workspace_summary",
      "title": "Workspace Summary"
    },
    {
      "id": "route_policy",
      "title": "Default Route Policy"
    },
    {
      "id": "tool_policy",
      "title": "Tool Policy"
    },
    {
      "id": "kubejs_authoring_policy",
      "title": "KubeJS Authoring Policy"
    },
    {
      "id": "task_intent_summary",
      "title": "Task Intent"
    },
    {
      "id": "task_route_policy",
      "title": "Task Route Policy"
    },
    {
      "id": "task_tool_policy",
      "title": "Task Tool Policy"
    }
  ],
  "promptText": "[User Request]\nAdd a KubeJS startup_scripts recipe for this modpack.\n\n[Workspace Summary]\nWorkspace summary: kind=modpack; runtime=unavailable; gradle=yes; java=no; kubejs=yes; probejs=yes; datapack=no.\n\n[Default Route Policy]\nDefault route: project_symbol via workspace_source -> docs_lookup.\n\n[Tool Policy]\nPreferred tools: source.bundle -> context.query -> workspace.analyze. Use migration.analyze only for explicit version migration requests.\n\n[KubeJS Authoring Policy]\nKubeJS authoring policy: treat KubeJS as Minecraft scripting infrastructure rather than generic JS, organize scripts by lifecycle and event domain, avoid arbitrary const sprawl when named functions or clear registrations read better, avoid persistent console.* logging in committed scripts, prefer explicit debug gating for temporary diagnostics, and rely on ProbeJS, workspace facts, and modding docs before generic JavaScript guesses.\n\n[Task Intent]\nTask intent: kubejs_authoring; confidence=high.\n\n[Task Route Policy]\nTask route: kubejs_authoring via probejs_types -> docs_lookup.\n\n[Task Tool Policy]\nTask tools: context.query -> source.bundle -> workspace.analyze."
}
```

### Crash-triage request plan on `testdata/scenarios/modpack_external_crash`
- Exit code: `0`

```json
{
  "appId": "mcp-server",
  "requestText": "The server crashes on startup and latest.log shows an exception in a mod.",
  "workspaceKind": "java-mod",
  "defaultRouteScenario": "project_symbol",
  "defaultRouteSteps": [
    "workspace_source",
    "docs_lookup"
  ],
  "taskIntent": {
    "id": "crash_triage",
    "confidence": "high",
    "reasons": [
      "request text mentions crash or log-triage keywords",
      "workspace snapshot exposes log files for crash triage"
    ]
  },
  "taskRouteReasons": [
    "crash triage should inspect log files before source or docs"
  ],
  "taskRouteSteps": [
    "log_files",
    "workspace_source",
    "docs_lookup"
  ],
  "preferredTools": [
    "workspace.analyze",
    "source.bundle",
    "context.query"
  ],
  "promptSections": [
    {
      "id": "request_text",
      "title": "User Request"
    },
    {
      "id": "workspace_summary",
      "title": "Workspace Summary"
    },
    {
      "id": "route_policy",
      "title": "Default Route Policy"
    },
    {
      "id": "tool_policy",
      "title": "Tool Policy"
    },
    {
      "id": "task_intent_summary",
      "title": "Task Intent"
    },
    {
      "id": "task_route_policy",
      "title": "Task Route Policy"
    },
    {
      "id": "task_tool_policy",
      "title": "Task Tool Policy"
    }
  ],
  "promptText": "[User Request]\nThe server crashes on startup and latest.log shows an exception in a mod.\n\n[Workspace Summary]\nWorkspace summary: kind=java-mod; runtime=unavailable; gradle=yes; java=no; kubejs=no; probejs=no; datapack=no.\n\n[Default Route Policy]\nDefault route: project_symbol via workspace_source -> docs_lookup.\n\n[Tool Policy]\nPreferred tools: source.bundle -> context.query -> workspace.analyze. Use migration.analyze only for explicit version migration requests.\n\n[Task Intent]\nTask intent: crash_triage; confidence=high.\n\n[Task Route Policy]\nTask route: crash_triage via log_files -> workspace_source -> docs_lookup.\n\n[Task Tool Policy]\nTask tools: workspace.analyze -> source.bundle -> context.query."
}
```

## Observed Behavior
- `prompt-assembly` now turns fragment-level guidance into stable titled sections plus one concatenated prompt string, so transport wiring no longer needs to re-invent formatting.
- `request-plan` surfaces both the default workspace route and the specialized task route at the same time, which is important for mixed modpack cases.
- crash triage now has a transport-agnostic structured proof that `log_files` takes precedence over source/docs.
- This slice still does not execute tools, rank docs shards, or enforce injection budgets yet.
