# TypeScript Bootstrap Workspace Context Verification
Date: 2026-04-21
Author: m1hono
Status: PASS

## Required Evidence
- `agent-runtime` legacy string bootstrap API remains compatible
- `agent-runtime` bootstrap attaches detected workspace context when a workspace root is provided
- `mcp-server` legacy string bootstrap API remains compatible
- `mcp-server` bootstrap attaches detected workspace context when a workspace root is provided
- focused app/runtime/detector verification passes
- root typecheck passes
- root `pnpm test` passes
- Go-tree checksum baseline matches at verification time

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm install
pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
pnpm exec tsc -b packages/shared-types packages/runtime-manager packages/agent-harness packages/workspace-detector apps/agent-runtime apps/mcp-server
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
pnpm exec tsc -b
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
pnpm exec tsx -e '...direct bootstrap sampling script...'
```

## Command Results

### `pnpm install`
- Exit code: `0`

```text
Scope: all 15 workspace projects
Progress: resolved 0, reused 1, downloaded 0, added 0
Already up to date
Progress: resolved 106, reused 57, downloaded 0, added 0, done

Done in 1.8s using pnpm v10.8.0
```

### `pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 5ms
✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 11ms

Test Files  2 passed (2)
     Tests  4 passed (4)
Start at  03:27:57
Duration  412ms (transform 53ms, setup 0ms, collect 90ms, tests 15ms, environment 0ms, prepare 99ms)
```

### `pnpm exec tsc -b packages/shared-types packages/runtime-manager packages/agent-harness packages/workspace-detector apps/agent-runtime apps/mcp-server`
- Exit code: `0`
- stdout/stderr: no output

### `pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ tests/monorepo/foundation.test.ts (2 tests) 5ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 10ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 9ms
✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 17ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 51ms

Test Files  6 passed (6)
     Tests  18 passed (18)
Start at  03:28:11
Duration  718ms (transform 654ms, setup 0ms, collect 1.11s, tests 95ms, environment 1ms, prepare 615ms)
```

### `pnpm exec tsc -b`
- Exit code: `0`
- stdout/stderr: no output

### `pnpm test`
- Exit code: `0`

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> vitest run

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/runtime-manager/src/policy.test.ts (1 test) 2ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 2ms
✓ tests/monorepo/foundation.test.ts (2 tests) 2ms
✓ apps/mcp-server/src/bootstrap.test.ts (2 tests) 9ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 53ms
✓ apps/agent-runtime/src/bootstrap.test.ts (2 tests) 16ms

Test Files  6 passed (6)
     Tests  18 passed (18)
Start at  03:28:12
Duration  490ms (transform 304ms, setup 0ms, collect 613ms, tests 84ms, environment 1ms, prepare 384ms)
```

### `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Output pattern: all checked entries returned `: OK`
- Sample lines:

```text
testdata/scenarios/modpack_external_crash/logs/latest.log: OK
```

## Direct Bootstrap Samples

### `buildAgentRuntimeBootstrap({ runtimeRoot, workspace })`

```json
{
  "appId": "agent-runtime",
  "runtimePolicy": {
    "mode": "managed-first",
    "allowSystemFallback": false,
    "runtimeRoot": "/tmp/mcpskill-runtime"
  },
  "harnessPackage": "@mcpskill/agent-harness",
  "traceEnabled": true,
  "workspaceContext": {
    "detectorPackage": "@mcpskill/workspace-detector",
    "descriptor": {
      "kind": "java-mod",
      "hasGradle": true,
      "hasJavaSource": true,
      "currentRuntime": {
        "minecraftVersion": "1.20.1",
        "loader": "forge",
        "loaderVersion": "47.2.0",
        "confidence": "high"
      }
    }
  }
}
```

### `buildMcpServerBootstrap({ runtimeRoot, workspace })`

```json
{
  "appId": "mcp-server",
  "runtimePolicy": {
    "mode": "managed-first",
    "allowSystemFallback": false,
    "runtimeRoot": "/tmp/mcpskill-runtime"
  },
  "corePackages": [
    "@mcpskill/runtime-manager",
    "@mcpskill/shared-types",
    "@mcpskill/workspace-detector"
  ],
  "workspaceContext": {
    "detectorPackage": "@mcpskill/workspace-detector",
    "descriptor": {
      "kind": "unknown",
      "hasDatapack": true,
      "currentRuntime": {
        "minecraftVersion": "1.20.1",
        "confidence": "medium"
      }
    }
  }
}
```

## Observed Values

- Legacy string calls to `buildAgentRuntimeBootstrap("/tmp/...")` and `buildMcpServerBootstrap("/tmp/...")` remain compatible and still return synchronous bootstrap objects without `workspaceContext`.
- Both bootstraps also now accept a structured `workspace` input for app-side detection wiring.
- When a workspace root is provided, both bootstraps now attach a `workspaceContext` containing the original `workspaceRoot`, the detector package id, and the resolved `WorkspaceDescriptor`.
- `agent-runtime` bootstrap consumed a Forge Gradle workspace and surfaced `kind="java-mod"`, `loader="forge"`, `minecraftVersion="1.20.1"`, and `confidence="high"` through `workspaceContext.descriptor.currentRuntime`.
- `mcp-server` bootstrap consumed a datapack-only workspace and surfaced `hasDatapack=true`, `minecraftVersion="1.20.1"`, and `confidence="medium"` without inventing a loader.
- The focused foundation/runtime-manager/workspace-detector/bootstrap suite stayed green after the app-side wiring change.
- The pre-existing Go tree under `cmd/`, `internal/`, and `testdata/` still matched the recorded checksum baseline at verification time.
