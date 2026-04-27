# TypeScript Agent Harness Structured KubeJS Policy Verification
Date: 2026-04-21
Author: m1hono
Status: PASS

## Scope
- extract KubeJS authoring rules into a dedicated `policy.ts`
- add a structured `authoringPolicy` contract to harness snapshot and brief
- make KubeJS tool preference derive from structured policy instead of hard-coded brief-only branching
- propagate the policy through `agent-runtime` bootstrap
- keep package-level verification and direct runtime sampling evidence in the review

## Files
- `packages/shared-types/src/runtime.ts`
- `packages/agent-harness/src/policy.ts`
- `packages/agent-harness/src/policy.test.ts`
- `packages/agent-harness/src/snapshot.ts`
- `packages/agent-harness/src/snapshot.test.ts`
- `packages/agent-harness/src/brief.ts`
- `packages/agent-harness/src/brief.test.ts`
- `packages/agent-harness/src/index.ts`
- `packages/agent-harness/package.json`
- `apps/agent-runtime/src/bootstrap.test.ts`

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run packages/agent-harness/src/policy.test.ts
pnpm exec vitest run packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts
pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts
pnpm exec tsc -b
pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts
pnpm --filter @mcpskill/agent-harness test
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e "import { buildHarnessSnapshot, buildHarnessBrief } from './packages/agent-harness/src/index.ts'; import { detectWorkspace } from './packages/workspace-detector/src/detect.ts'; void (async () => { const workspaceRoot = './testdata/scenarios/modpack_kubejs'; const descriptor = await detectWorkspace(workspaceRoot); const workspaceContext = { workspaceRoot: descriptor.root, detectorPackage: '@mcpskill/workspace-detector', descriptor }; const snapshot = buildHarnessSnapshot(workspaceContext); const brief = buildHarnessBrief(workspaceContext); console.log(JSON.stringify({ descriptor: { kind: descriptor.kind, hasGradle: descriptor.hasGradle, hasKubeJS: descriptor.hasKubeJS, hasProbeJS: descriptor.hasProbeJS, hasDatapack: descriptor.hasDatapack }, snapshot, brief }, null, 2)); })();"
./node_modules/.bin/tsx -e "import { buildAgentRuntimeBootstrap } from './apps/agent-runtime/src/bootstrap.ts'; void (async () => { const bootstrap = await buildAgentRuntimeBootstrap({ runtimeRoot: '/tmp/mcpskill-runtime', workspace: { workspaceRoot: './testdata/scenarios/modpack_kubejs' } }); console.log(JSON.stringify({ workspaceKind: bootstrap.workspaceContext?.descriptor.kind, routePlan: bootstrap.defaultRoutePlan, authoringPolicy: bootstrap.harnessBrief?.authoringPolicy, preferredTools: bootstrap.harnessBrief?.preferredTools, promptFragments: bootstrap.harnessBrief?.promptFragments }, null, 2)); })();"
```

## Command Results

### RED: `pnpm exec vitest run packages/agent-harness/src/policy.test.ts`
- Exit code: `1`

```text
FAIL  packages/agent-harness/src/policy.test.ts [ packages/agent-harness/src/policy.test.ts ]
Error: Cannot find module './policy.js' imported from '/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness/src/policy.test.ts'
 ❯ packages/agent-harness/src/policy.test.ts:9:1

Caused by: Error: Failed to load url ./policy.js (resolved id: ./policy.js) in /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness/src/policy.test.ts. Does the file exist?

Test Files  1 failed (1)
     Tests  no tests
Start at  19:56:36
Duration  442ms (transform 46ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 73ms)
```

### RED: `pnpm exec vitest run packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts`
- Exit code: `1`

```text
❯ packages/agent-harness/src/brief.test.ts (3 tests | 1 failed) 9ms
  ✓ buildHarnessBrief > builds an unknown-workspace brief when no workspace context is available 1ms
  ✓ buildHarnessBrief > builds a Java-mod brief with source-first tool guidance 1ms
  × buildHarnessBrief > consumes bootstrap-shaped input through a brief adapter helper 6ms
    → expected { snapshot: { …(6) }, …(3) } to match object { snapshot: { …(2) }, …(3) }

FAIL  packages/agent-harness/src/brief.test.ts > buildHarnessBrief > consumes bootstrap-shaped input through a brief adapter helper
AssertionError: expected { snapshot: { …(6) }, …(3) } to match object { snapshot: { …(2) }, …(3) }

- Expected
+ Received

@@ -1,14 +1,6 @@
 {
-  "authoringPolicy": {
-    "preferredSignalOrder": [
-      "probejs_types",
-      "workspace_facts",
-      "modding_docs",
-    ],
-    "profile": "kubejs_script",
-  },
   "preferredTools": [
     "context.query",
     "source.bundle",
     "workspace.analyze",
   ],

FAIL  packages/agent-harness/src/snapshot.test.ts > buildHarnessSnapshot > consumes bootstrap-shaped input through a snapshot adapter helper
AssertionError: expected { …(6) } to match object { workspaceKind: 'kubejs', …(3) }

- Expected
+ Received

@@ -1,15 +1,6 @@
 {
-  "authoringPolicy": {
-    "allowPersistentConsole": false,
-    "preferredSignalOrder": [
-      "probejs_types",
-      "workspace_facts",
-      "modding_docs",
-    ],
-    "profile": "kubejs_script",
-  },
   "facts": {
     "hasKubeJS": true,
     "hasProbeJS": true,
   },

Test Files  2 failed (2)
     Tests  2 failed | 4 passed (6)
Start at  19:56:36
Duration  535ms (transform 93ms, setup 0ms, collect 119ms, tests 16ms, environment 1ms, prepare 152ms)
```

### GREEN: `pnpm exec vitest run packages/agent-harness/src/policy.test.ts`
- Exit code: `0`

```text
✓ packages/agent-harness/src/policy.test.ts (3 tests) 3ms

Test Files  1 passed (1)
     Tests  3 passed (3)
Start at  20:02:31
Duration  757ms (transform 58ms, setup 0ms, collect 40ms, tests 3ms, environment 0ms, prepare 193ms)
```

### GREEN: `pnpm exec vitest run packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts`
- Exit code: `0`

```text
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 2ms

Test Files  2 passed (2)
     Tests  6 passed (6)
Start at  20:02:31
Duration  805ms (transform 125ms, setup 0ms, collect 158ms, tests 4ms, environment 0ms, prepare 308ms)
```

### RED then GREEN: `pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts`
- Initial exit code: `1`
- Cause: `apps/agent-runtime` imports package `dist` output, so the new `agent-harness` / `shared-types` contract was not visible until rebuild

```text
❯ apps/agent-runtime/src/bootstrap.test.ts (3 tests | 1 failed) 35ms
  ✓ buildAgentRuntimeBootstrap > keeps the legacy string bootstrap API compatible 2ms
  ✓ buildAgentRuntimeBootstrap > attaches detected workspace context, route data, and a harness brief when a workspace root is provided 21ms
  × buildAgentRuntimeBootstrap > propagates KubeJS authoring policy through snapshot and brief for KubeJS workspaces 11ms
    → expected { …(6) } to match object { …(4) }

FAIL  apps/agent-runtime/src/bootstrap.test.ts > buildAgentRuntimeBootstrap > propagates KubeJS authoring policy through snapshot and brief for KubeJS workspaces
AssertionError: expected { …(6) } to match object { …(4) }

- Expected
+ Received

@@ -1,14 +1,6 @@
 {
-  "authoringPolicy": {
-    "preferredSignalOrder": [
-      "probejs_types",
-      "workspace_facts",
-      "modding_docs",
-    ],
-    "profile": "kubejs_script",
-  },
   "routePlan": {
     "defaultRoutingScenario": "kubejs_script",
     "scenario": "kubejs-workspace",
```

- Rebuild command: `pnpm exec tsc -b`
- Re-run exit code: `0`

```text
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 14ms

Test Files  1 passed (1)
     Tests  3 passed (3)
Start at  20:04:38
Duration  518ms (transform 101ms, setup 0ms, collect 131ms, tests 14ms, environment 0ms, prepare 92ms)
```

### Package suite: `pnpm --filter @mcpskill/agent-harness test`
- Exit code: `0`

```text
> @mcpskill/agent-harness@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness
> vitest run --root ../.. packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts

✓ packages/agent-harness/src/policy.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 4ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 4ms

Test Files  5 passed (5)
     Tests  26 passed (26)
Start at  20:05:50
Duration  563ms (transform 170ms, setup 0ms, collect 231ms, tests 15ms, environment 1ms, prepare 528ms)
```

### Focused regression
Command:

```sh
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
```

- Exit code: `0`

```text
✓ packages/agent-harness/src/policy.test.ts (3 tests) 4ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 3ms
✓ tests/monorepo/foundation.test.ts (2 tests) 3ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 69ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 8ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 28ms

Test Files  11 passed (11)
     Tests  45 passed (45)
Start at  20:06:12
Duration  1.02s (transform 680ms, setup 0ms, collect 1.29s, tests 125ms, environment 1ms, prepare 1.33s)
```

### TypeScript build: `pnpm exec tsc -b`
- Exit code: `0`
- stdout/stderr: empty

### Root tests: `pnpm test`
- Exit code: `0`

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> vitest run

✓ tests/monorepo/foundation.test.ts (2 tests) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 6ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 2ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 4ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 8ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 40ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 11ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 21ms

Test Files  11 passed (11)
     Tests  45 passed (45)
Start at  20:06:12
Duration  1.02s (transform 581ms, setup 0ms, collect 1.48s, tests 101ms, environment 1ms, prepare 1.34s)
```

### Go baseline checksum: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Result: every checked entry returned `OK`
- Sample output:

```text
testdata/scenarios/modpack_external_crash/logs/latest.log: OK
```

## Direct Runtime Samples

### `buildHarnessSnapshot(...)` + `buildHarnessBrief(...)` on `testdata/scenarios/modpack_kubejs`
- Exit code: `0`

```json
{
  "descriptor": {
    "kind": "modpack",
    "hasGradle": true,
    "hasKubeJS": true,
    "hasProbeJS": true,
    "hasDatapack": false
  },
  "snapshot": {
    "workspaceRoot": "/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/testdata/scenarios/modpack_kubejs",
    "workspaceKind": "modpack",
    "detectorReasons": [
      "detected Gradle build files",
      "detected KubeJS directory",
      "detected ProbeJS artifacts"
    ],
    "currentRuntime": {
      "source": "unknown",
      "confidence": "unknown",
      "evidenceSources": [],
      "candidates": [],
      "evidence": []
    },
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
    "authoringPolicy": {
      "profile": "kubejs_script",
      "runtimeModel": "minecraft_scripting",
      "structureModel": "lifecycle_domain",
      "preferredSignalOrder": [
        "probejs_types",
        "workspace_facts",
        "modding_docs"
      ],
      "preferNamedFunctions": true,
      "avoidGenericJavaScriptPatterns": true,
      "allowPersistentConsole": false,
      "requireExplicitDebugGate": true,
      "preferDocBackedAnswers": true
    },
    "facts": {
      "hasGradle": true,
      "hasJavaSource": false,
      "hasKubeJS": true,
      "hasProbeJS": true,
      "hasDatapack": false,
      "buildFileCount": 1,
      "javaSourceRootCount": 0,
      "datapackRootCount": 0,
      "logPathCount": 1
    }
  },
  "brief": {
    "authoringPolicy": {
      "profile": "kubejs_script",
      "runtimeModel": "minecraft_scripting",
      "structureModel": "lifecycle_domain",
      "preferredSignalOrder": [
        "probejs_types",
        "workspace_facts",
        "modding_docs"
      ],
      "preferNamedFunctions": true,
      "avoidGenericJavaScriptPatterns": true,
      "allowPersistentConsole": false,
      "requireExplicitDebugGate": true,
      "preferDocBackedAnswers": true
    },
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
        "text": "Workspace summary: kind=modpack; runtime=unavailable; gradle=yes; java=no; kubejs=yes; probejs=yes; datapack=no."
      },
      {
        "id": "route_policy",
        "text": "Default route: project_symbol via workspace_source -> docs_lookup."
      },
      {
        "id": "tool_policy",
        "text": "Preferred tools: source.bundle -> context.query -> workspace.analyze. Use migration.analyze only for explicit version migration requests."
      },
      {
        "id": "kubejs_authoring_policy",
        "text": "KubeJS authoring policy: treat KubeJS as Minecraft scripting infrastructure rather than generic JS, organize scripts by lifecycle and event domain, avoid arbitrary const sprawl when named functions or clear registrations read better, avoid persistent console.* logging in committed scripts, prefer explicit debug gating for temporary diagnostics, and rely on ProbeJS, workspace facts, and modding docs before generic JavaScript guesses."
      }
    ]
  }
}
```

### `buildAgentRuntimeBootstrap(...)` on `testdata/scenarios/modpack_kubejs`
- Exit code: `0`

```json
{
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
  "authoringPolicy": {
    "profile": "kubejs_script",
    "runtimeModel": "minecraft_scripting",
    "structureModel": "lifecycle_domain",
    "preferredSignalOrder": [
      "probejs_types",
      "workspace_facts",
      "modding_docs"
    ],
    "preferNamedFunctions": true,
    "avoidGenericJavaScriptPatterns": true,
    "allowPersistentConsole": false,
    "requireExplicitDebugGate": true,
    "preferDocBackedAnswers": true
  },
  "preferredTools": [
    "source.bundle",
    "context.query",
    "workspace.analyze"
  ],
  "promptFragments": [
    {
      "id": "workspace_summary",
      "text": "Workspace summary: kind=modpack; runtime=unavailable; gradle=yes; java=no; kubejs=yes; probejs=yes; datapack=no."
    },
    {
      "id": "route_policy",
      "text": "Default route: project_symbol via workspace_source -> docs_lookup."
    },
    {
      "id": "tool_policy",
      "text": "Preferred tools: source.bundle -> context.query -> workspace.analyze. Use migration.analyze only for explicit version migration requests."
    },
    {
      "id": "kubejs_authoring_policy",
      "text": "KubeJS authoring policy: treat KubeJS as Minecraft scripting infrastructure rather than generic JS, organize scripts by lifecycle and event domain, avoid arbitrary const sprawl when named functions or clear registrations read better, avoid persistent console.* logging in committed scripts, prefer explicit debug gating for temporary diagnostics, and rely on ProbeJS, workspace facts, and modding docs before generic JavaScript guesses."
    }
  ]
}
```

## Observed Behavior
- KubeJS rules are no longer brief-only strings; they now exist as a structured `authoringPolicy`.
- `kubejs-workspace` tool ordering is now derived from the policy requirement that `probejs_types` is the first preferred signal.
- mixed `modpack` workspaces keep the existing `project_symbol` default route and `source.bundle`-first tool order, but still surface the KubeJS policy and prompt fragment when KubeJS/ProbeJS signals exist.
- `agent-runtime` integration currently depends on rebuilt `dist` outputs for package imports; the verification flow now makes that explicit.
