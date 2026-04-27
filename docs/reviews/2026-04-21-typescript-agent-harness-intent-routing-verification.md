# TypeScript Agent Harness Intent Routing Verification
Date: 2026-04-21
Author: m1hono
Status: PASS

## Scope
- add request-text intent detection for harness tasks
- add task-route planning on top of snapshot data
- support three specialized intents in the first slice:
  - `crash_triage`
  - `kubejs_authoring`
  - `datapack_lookup`
- keep bootstrap contracts unchanged and expose the new layer as opt-in harness helpers

## Files
- `packages/shared-types/src/runtime.ts`
- `packages/agent-harness/src/intent.ts`
- `packages/agent-harness/src/intent.test.ts`
- `packages/agent-harness/src/task-route.ts`
- `packages/agent-harness/src/task-route.test.ts`
- `packages/agent-harness/src/index.ts`
- `packages/agent-harness/package.json`

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec vitest run packages/agent-harness/src/intent.test.ts
pnpm exec vitest run packages/agent-harness/src/task-route.test.ts
pnpm exec tsc -b
pnpm exec tsc -b
pnpm --filter @mcpskill/agent-harness test
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
./node_modules/.bin/tsx -e "import { buildHarnessSnapshot, buildHarnessTaskRoute } from './packages/agent-harness/src/index.ts'; import { detectWorkspace } from './packages/workspace-detector/src/detect.ts'; void (async () => { const descriptor = await detectWorkspace('./testdata/scenarios/modpack_external_crash'); const snapshot = buildHarnessSnapshot({ workspaceRoot: descriptor.root, detectorPackage: '@mcpskill/workspace-detector', descriptor }); const route = buildHarnessTaskRoute(snapshot, 'The server crashes on startup and latest.log shows an exception in a mod.'); console.log(JSON.stringify({ workspaceKind: snapshot.workspaceKind, logPathCount: snapshot.facts.logPathCount, intent: route.intent, steps: route.steps, preferredTools: route.preferredTools }, null, 2)); })();"
./node_modules/.bin/tsx -e "import { buildHarnessSnapshot, buildHarnessTaskRoute } from './packages/agent-harness/src/index.ts'; import { detectWorkspace } from './packages/workspace-detector/src/detect.ts'; void (async () => { const descriptor = await detectWorkspace('./testdata/scenarios/modpack_kubejs'); const snapshot = buildHarnessSnapshot({ workspaceRoot: descriptor.root, detectorPackage: '@mcpskill/workspace-detector', descriptor }); const route = buildHarnessTaskRoute(snapshot, 'Add a KubeJS startup_scripts recipe for this modpack.'); console.log(JSON.stringify({ workspaceKind: snapshot.workspaceKind, hasKubeJS: snapshot.facts.hasKubeJS, hasProbeJS: snapshot.facts.hasProbeJS, intent: route.intent, steps: route.steps, preferredTools: route.preferredTools }, null, 2)); })();"
./node_modules/.bin/tsx -e "import { buildHarnessSnapshot, buildHarnessTaskRoute } from './packages/agent-harness/src/index.ts'; import { detectWorkspace } from './packages/workspace-detector/src/detect.ts'; void (async () => { const descriptor = await detectWorkspace('./testdata/scenarios/datapack_project'); const snapshot = buildHarnessSnapshot({ workspaceRoot: descriptor.root, detectorPackage: '@mcpskill/workspace-detector', descriptor }); const route = buildHarnessTaskRoute(snapshot, 'Why does this datapack worldgen biome json fail to load from pack.mcmeta?'); console.log(JSON.stringify({ workspaceKind: snapshot.workspaceKind, hasDatapack: snapshot.facts.hasDatapack, datapackRootCount: snapshot.facts.datapackRootCount, intent: route.intent, steps: route.steps, preferredTools: route.preferredTools }, null, 2)); })();"
```

## Command Results

### RED: `pnpm exec vitest run packages/agent-harness/src/intent.test.ts`
- Exit code: `1`

```text
FAIL  packages/agent-harness/src/intent.test.ts [ packages/agent-harness/src/intent.test.ts ]
Error: Cannot find module './intent.js' imported from '/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness/src/intent.test.ts'
 ❯ packages/agent-harness/src/intent.test.ts:8:1

Caused by: Error: Failed to load url ./intent.js (resolved id: ./intent.js) in /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness/src/intent.test.ts. Does the file exist?

Test Files  1 failed (1)
     Tests  no tests
Start at  21:43:34
Duration  645ms (transform 45ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 131ms)
```

### RED: `pnpm exec vitest run packages/agent-harness/src/task-route.test.ts`
- Exit code: `1`

```text
FAIL  packages/agent-harness/src/task-route.test.ts [ packages/agent-harness/src/task-route.test.ts ]
Error: Cannot find module './task-route.js' imported from '/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness/src/task-route.test.ts'
 ❯ packages/agent-harness/src/task-route.test.ts:8:1

Caused by: Error: Failed to load url ./task-route.js (resolved id: ./task-route.js) in /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness/src/task-route.test.ts. Does the file exist?

Test Files  1 failed (1)
     Tests  no tests
Start at  21:43:34
Duration  646ms (transform 40ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 153ms)
```

### Build failure after implementation: `pnpm exec tsc -b`
- Exit code: `2`

```text
packages/shared-types/src/runtime.ts(124,15): error TS2304: Cannot find name 'RuntimeConfidence'.
```

### GREEN: `pnpm exec vitest run packages/agent-harness/src/intent.test.ts`
- Exit code: `0`

```text
✓ packages/agent-harness/src/intent.test.ts (4 tests) 2ms

Test Files  1 passed (1)
     Tests  4 passed (4)
Start at  21:51:27
Duration  1.21s (transform 186ms, setup 0ms, collect 174ms, tests 2ms, environment 0ms, prepare 249ms)
```

### GREEN: `pnpm exec vitest run packages/agent-harness/src/task-route.test.ts`
- Exit code: `0`

```text
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 4ms

Test Files  1 passed (1)
     Tests  4 passed (4)
Start at  21:51:27
Duration  1.21s (transform 159ms, setup 0ms, collect 172ms, tests 4ms, environment 0ms, prepare 308ms)
```

### TypeScript build: `pnpm exec tsc -b`
- Exit code: `0`
- stdout/stderr: empty

### Package suite: `pnpm --filter @mcpskill/agent-harness test`
- Exit code: `0`

```text
> @mcpskill/agent-harness@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/agent-harness
> vitest run --root ../.. packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts

✓ packages/agent-harness/src/policy.test.ts (3 tests) 5ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 6ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 12ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 3ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms

Test Files  7 passed (7)
     Tests  34 passed (34)
Start at  21:53:01
Duration  1.03s (transform 751ms, setup 0ms, collect 1.40s, tests 32ms, environment 1ms, prepare 2.02s)
```

### Focused regression
Command:

```sh
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/agent-harness/src/scenario.test.ts packages/agent-harness/src/route.test.ts packages/agent-harness/src/policy.test.ts packages/agent-harness/src/intent.test.ts packages/agent-harness/src/task-route.test.ts packages/agent-harness/src/snapshot.test.ts packages/agent-harness/src/brief.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
```

- Exit code: `0`

```text
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 17ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 3ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 2ms
✓ tests/monorepo/foundation.test.ts (2 tests) 4ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 1ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 45ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 31ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 122ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 15ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 25ms

Test Files  13 passed (13)
     Tests  53 passed (53)
Start at  21:53:01
Duration  1.45s (transform 1.86s, setup 0ms, collect 3.84s, tests 271ms, environment 3ms, prepare 2.55s)
```

### Root tests: `pnpm test`
- Exit code: `0`

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> vitest run

✓ packages/runtime-manager/src/layout.test.ts (2 tests) 1ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 2ms
✓ packages/agent-harness/src/policy.test.ts (3 tests) 2ms
✓ packages/agent-harness/src/intent.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (4 tests) 2ms
✓ packages/agent-harness/src/route.test.ts (6 tests) 2ms
✓ packages/agent-harness/src/scenario.test.ts (11 tests) 3ms
✓ packages/agent-harness/src/snapshot.test.ts (3 tests) 2ms
✓ tests/monorepo/foundation.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/brief.test.ts (3 tests) 3ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 74ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 6ms
✓ apps/agent-runtime/src/bootstrap.test.ts (3 tests) 17ms

Test Files  13 passed (13)
     Tests  53 passed (53)
Start at  21:53:02
Duration  892ms (transform 744ms, setup 0ms, collect 1.39s, tests 118ms, environment 1ms, prepare 2.00s)
```

### Go baseline checksum: `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Result: every checked entry returned `OK`
- Sample output:

```text
testdata/scenarios/modpack_external_crash/logs/latest.log: OK
```

## Direct Runtime Samples

### Crash triage sample on `testdata/scenarios/modpack_external_crash`
- Exit code: `0`
- Note: this fixture currently classifies as `java-mod`, not `modpack`, because it only exposes Gradle + logs in the detector data. The new intent layer still specializes correctly.

```json
{
  "workspaceKind": "java-mod",
  "logPathCount": 1,
  "intent": {
    "id": "crash_triage",
    "confidence": "high",
    "reasons": [
      "request text mentions crash or log-triage keywords",
      "workspace snapshot exposes log files for crash triage"
    ]
  },
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
}
```

### KubeJS authoring sample on `testdata/scenarios/modpack_kubejs`
- Exit code: `0`

```json
{
  "workspaceKind": "modpack",
  "hasKubeJS": true,
  "hasProbeJS": true,
  "intent": {
    "id": "kubejs_authoring",
    "confidence": "high",
    "reasons": [
      "request text mentions KubeJS scripting keywords",
      "workspace snapshot exposes KubeJS or ProbeJS signals"
    ]
  },
  "steps": [
    "probejs_types",
    "docs_lookup"
  ],
  "preferredTools": [
    "context.query",
    "source.bundle",
    "workspace.analyze"
  ]
}
```

### Datapack lookup sample on `testdata/scenarios/datapack_project`
- Exit code: `0`

```json
{
  "workspaceKind": "unknown",
  "hasDatapack": true,
  "datapackRootCount": 1,
  "intent": {
    "id": "datapack_lookup",
    "confidence": "high",
    "reasons": [
      "request text mentions datapack or worldgen keywords",
      "workspace snapshot exposes datapack content"
    ]
  },
  "steps": [
    "datapack_files",
    "docs_lookup"
  ],
  "preferredTools": [
    "source.bundle",
    "context.query",
    "workspace.analyze"
  ]
}
```

## Observed Behavior
- the new layer is additive and opt-in; bootstrap contracts did not change
- task text can now override the coarse workspace-default route with a specialized plan
- `crash_triage` prioritizes logs and moves `workspace.analyze` ahead of source/doc retrieval
- `kubejs_authoring` and `datapack_lookup` now get distinct route steps even inside mixed workspaces
- direct sampling confirms the layer works on real fixtures, not just synthetic unit-test snapshots
