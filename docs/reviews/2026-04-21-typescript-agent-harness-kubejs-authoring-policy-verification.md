# TypeScript Agent Harness KubeJS Authoring Policy Verification
Date: 2026-04-21
Author: m1hono
Status: PASS

## Scope
- extend `AgentRuntimePromptFragmentId` with a KubeJS-only fragment id
- inject a KubeJS authoring policy into `harnessBrief.promptFragments`
- verify the policy encodes non-generic-JS guidance for KubeJS workspaces

## Files
- `packages/shared-types/src/runtime.ts`
- `packages/agent-harness/src/brief.ts`
- `packages/agent-harness/src/brief.test.ts`

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run packages/agent-harness/src/brief.test.ts
pnpm exec vitest run packages/agent-harness/src/brief.test.ts
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
pnpm exec tsc -b
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e "import { buildHarnessBriefFromBootstrap } from './packages/agent-harness/src/brief.ts'; const brief = buildHarnessBriefFromBootstrap({ workspaceContext: { workspaceRoot: '/tmp/kubejs-pack', detectorPackage: '@mcpskill/workspace-detector', descriptor: { root: '/tmp/kubejs-pack', kind: 'kubejs', hasGradle: false, hasKubeJS: true, hasProbeJS: true, hasJavaSource: false, hasDatapack: true, buildFiles: [], javaSourceRoots: [], datapackRoots: ['/tmp/kubejs-pack/kubejs/data'], logPaths: [], reasons: ['found kubejs scripts', 'found probejs typings'], currentRuntime: { source: 'agent-maintained', confidence: 'medium', minecraftVersion: '1.20.1', loader: 'neoforge', evidenceSources: ['workspace'], candidates: [], evidence: [] } } } }); console.log(JSON.stringify(brief, null, 2));"
```

## Command Results

### RED: `pnpm exec vitest run packages/agent-harness/src/brief.test.ts`
- Exit code: `1`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

❯ packages/agent-harness/src/brief.test.ts (3 tests | 1 failed) 6ms
  ✓ buildHarnessBrief > builds an unknown-workspace brief when no workspace context is available 1ms
  ✓ buildHarnessBrief > builds a Java-mod brief with source-first tool guidance 1ms
  × buildHarnessBrief > consumes bootstrap-shaped input through a brief adapter helper 4ms
    → expected { snapshot: { …(6) }, …(3) } to match object { snapshot: { …(2) }, …(2) }
(1 matching property omitted from actual)

FAIL  packages/agent-harness/src/brief.test.ts > buildHarnessBrief > consumes bootstrap-shaped input through a brief adapter helper
AssertionError: expected { snapshot: { …(6) }, …(3) } to match object { snapshot: { …(2) }, …(2) }
(1 matching property omitted from actual)

- Expected
+ Received

@@ -5,22 +5,19 @@
     "workspace.analyze",
   ],
   "promptFragments": [
     {
       "id": "workspace_summary",
+      "text": "Workspace summary: kind=kubejs; runtime=unavailable; gradle=no; java=no; kubejs=yes; probejs=yes; datapack=no.",
     },
     {
       "id": "route_policy",
       "text": "Default route: kubejs_script via probejs_types -> docs_lookup.",
     },
     {
       "id": "tool_policy",
       "text": "Preferred tools: context.query -> source.bundle -> workspace.analyze. Use migration.analyze only for explicit version migration requests.",
-    },
-    {
-      "id": "kubejs_authoring_policy",
-      "text": "KubeJS authoring policy:",
     },
   ],
   "snapshot": {
     "routePlan": {
       "defaultRoutingScenario": "kubejs_script",

Test Files  1 failed (1)
     Tests  1 failed | 2 passed (3)
Start at  19:15:41
Duration  497ms (transform 58ms, setup 0ms, collect 91ms, tests 6ms, environment 0ms, prepare 83ms)
```

### GREEN: `pnpm exec vitest run packages/agent-harness/src/brief.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/agent-harness/src/brief.test.ts (3 tests) 2ms

Test Files  1 passed (1)
     Tests  3 passed (3)
Start at  19:27:37
Duration  258ms (transform 30ms, setup 0ms, collect 31ms, tests 2ms, environment 0ms, prepare 54ms)
```

### Focused regression
Command:

```sh
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
```

- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/runtime-manager/src/policy.test.ts (1 test) 2ms
✓ tests/monorepo/foundation.test.ts (2 tests) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 5ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 3ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 46ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 10ms
✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 18ms

Test Files  10 passed (10)
     Tests  41 passed (41)
Start at  19:27:55
Duration  672ms (transform 729ms, setup 0ms, collect 1.22s, tests 94ms, environment 1ms, prepare 1.12s)
```

### TypeScript build: `pnpm exec tsc -b`
- Exit code: `0`
- stdout/stderr: empty

### Root tests: `pnpm test`
- Exit code: `0`

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> vitest run

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ tests/monorepo/foundation.test.ts (2 tests) 2ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 4ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 3ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 3ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 12ms
✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 15ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 50ms

Test Files  10 passed (10)
     Tests  41 passed (41)
Start at  19:28:16
Duration  853ms (transform 557ms, setup 0ms, collect 927ms, tests 95ms, environment 2ms, prepare 769ms)
```

### Go baseline checksum: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Result: every checked entry returned `OK`
- Sample output:

```text
testdata/scenarios/modpack_external_crash/logs/latest.log: OK
```

## Direct Method Return Sample

### `buildHarnessBriefFromBootstrap(...)` for a synthetic KubeJS workspace
- Exit code: `0`

```json
{
  "snapshot": {
    "workspaceRoot": "/tmp/kubejs-pack",
    "workspaceKind": "kubejs",
    "detectorReasons": [
      "found kubejs scripts",
      "found probejs typings"
    ],
    "currentRuntime": {
      "source": "agent-maintained",
      "confidence": "medium",
      "minecraftVersion": "1.20.1",
      "loader": "neoforge",
      "evidenceSources": [
        "workspace"
      ],
      "candidates": [],
      "evidence": []
    },
    "routePlan": {
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
    "facts": {
      "hasGradle": false,
      "hasJavaSource": false,
      "hasKubeJS": true,
      "hasProbeJS": true,
      "hasDatapack": true,
      "buildFileCount": 0,
      "javaSourceRootCount": 0,
      "datapackRootCount": 1,
      "logPathCount": 0
    }
  },
  "availableTools": [
    "workspace.analyze",
    "source.bundle",
    "context.query",
    "migration.analyze"
  ],
  "preferredTools": [
    "context.query",
    "source.bundle",
    "workspace.analyze"
  ],
  "promptFragments": [
    {
      "id": "workspace_summary",
      "text": "Workspace summary: kind=kubejs; runtime=neoforge 1.20.1; gradle=no; java=no; kubejs=yes; probejs=yes; datapack=yes."
    },
    {
      "id": "route_policy",
      "text": "Default route: kubejs_script via probejs_types -> docs_lookup."
    },
    {
      "id": "tool_policy",
      "text": "Preferred tools: context.query -> source.bundle -> workspace.analyze. Use migration.analyze only for explicit version migration requests."
    },
    {
      "id": "kubejs_authoring_policy",
      "text": "KubeJS authoring policy: treat KubeJS as Minecraft scripting infrastructure rather than generic JS, organize scripts by lifecycle and event domain, avoid arbitrary const sprawl when named functions or clear registrations read better, avoid persistent console.* logging in committed scripts, prefer explicit debug gating for temporary diagnostics, and rely on ProbeJS, workspace facts, and modding docs before generic JavaScript guesses."
    }
  ]
}
```

## Observed Behavior
- `kubejs-workspace` now emits a fourth prompt fragment dedicated to KubeJS authoring constraints.
- the injected policy explicitly forbids treating KubeJS as generic JS and pushes ProbeJS/docs-aware authoring.
- the direct sampled return shows `context.query -> source.bundle -> workspace.analyze` remains the preferred tool order for KubeJS.
- the change is additive; Java mod and unknown workspace brief behavior remained green in the same suite.
