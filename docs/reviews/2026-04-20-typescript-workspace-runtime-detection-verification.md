# TypeScript Workspace Runtime Detection Verification
Date: 2026-04-20
Author: m1hono
Status: PASS

## Required Evidence
- detector package tests pass
- phase-1 foundation tests still pass
- root typecheck passes
- root `pnpm test` passes
- Go-tree checksum baseline matches at verification time
- `detectWorkspace()` sample return values were captured on this machine

## Commands
```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm install
pnpm exec vitest run packages/workspace-detector/src/detect.test.ts
pnpm exec tsc -b packages/shared-types packages/workspace-detector
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
pnpm exec tsc -b
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
pnpm exec tsx -e '...direct detectWorkspace sampling script...'
```

## Command Results

### `pnpm install`
- Exit code: `0`

```text
Scope: all 15 workspace projects
Progress: resolved 0, reused 1, downloaded 0, added 0
Already up to date
Progress: resolved 106, reused 57, downloaded 0, added 0, done

Done in 366ms using pnpm v10.8.0
```

### `pnpm exec vitest run packages/workspace-detector/src/detect.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/workspace-detector/src/detect.test.ts (9 tests) 22ms

Test Files  1 passed (1)
     Tests  9 passed (9)
Start at  01:32:46
Duration  522ms (transform 55ms, setup 0ms, collect 54ms, tests 22ms, environment 0ms, prepare 83ms)
```

### `pnpm exec tsc -b packages/shared-types packages/workspace-detector`
- Exit code: `0`
- stdout/stderr: no output

### `pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts`
- Exit code: `0`

```text
RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ tests/monorepo/foundation.test.ts (2 tests) 1ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 1ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms
✓ apps/mcp-server/src/bootstrap.test.ts (1 test) 1ms
✓ apps/agent-runtime/src/bootstrap.test.ts (1 test) 1ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 25ms

Test Files  6 passed (6)
     Tests  16 passed (16)
Start at  01:33:12
Duration  325ms (transform 151ms, setup 0ms, collect 222ms, tests 31ms, environment 1ms, prepare 379ms)
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

✓ tests/monorepo/foundation.test.ts (2 tests) 1ms
✓ packages/runtime-manager/src/policy.test.ts (1 test) 1ms
✓ packages/runtime-manager/src/layout.test.ts (2 tests) 1ms
✓ apps/agent-runtime/src/bootstrap.test.ts (1 test) 1ms
✓ apps/mcp-server/src/bootstrap.test.ts (1 test) 1ms
✓ packages/workspace-detector/src/detect.test.ts (9 tests) 36ms

Test Files  6 passed (6)
     Tests  16 passed (16)
Start at  01:33:28
Duration  376ms (transform 141ms, setup 0ms, collect 217ms, tests 43ms, environment 1ms, prepare 329ms)
```

### `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Exit code: `0`
- Output pattern: all checked entries returned `: OK`
- Sample lines:

```text
testdata/scenarios/modpack_external_crash/logs/latest.log: OK
```

## Direct `detectWorkspace()` Samples

### Forge Gradle workspace

```json
{
  "kind": "java-mod",
  "hasGradle": true,
  "hasJavaSource": true,
  "currentRuntime": {
    "minecraftVersion": "1.20.1",
    "loader": "forge",
    "loaderVersion": "47.2.0",
    "source": "workspace-detect",
    "confidence": "high"
  }
}
```

### Conflicting Forge and NeoForge evidence

```json
{
  "kind": "java-mod",
  "currentRuntime": {
    "source": "unknown",
    "confidence": "unknown",
    "candidates": [
      {
        "minecraftVersion": "1.21.1",
        "loader": "neoforge",
        "loaderVersion": "21",
        "confidence": "high"
      },
      {
        "minecraftVersion": "1.20.1",
        "loader": "forge",
        "loaderVersion": "47.2.0",
        "confidence": "high"
      }
    ]
  }
}
```

### Datapack-only partial runtime

```json
{
  "kind": "unknown",
  "hasDatapack": true,
  "currentRuntime": {
    "minecraftVersion": "1.20.1",
    "source": "workspace-detect",
    "confidence": "medium"
  }
}
```

### Prism instance hint only

```json
{
  "kind": "unknown",
  "currentRuntime": {
    "source": "workspace-detect",
    "confidence": "low",
    "evidence": [
      {
        "kind": "prism-instance-root",
        "value": "LostCivilization",
        "weight": "low",
        "structured": false
      }
    ]
  }
}
```

## Observed Values

- `detectWorkspace()` returned `kind="java-mod"` with `loader="forge"` and `confidence="high"` for a Forge Gradle workspace that also had `mods.toml`.
- Conflicting Forge and NeoForge strong evidence returned `source="unknown"` and `confidence="unknown"` while keeping both high-confidence candidates visible.
- High-confidence evidence that agreed on Minecraft version and loader but disagreed on incompatible loader build numbers also returned `confidence="unknown"` instead of silently picking one candidate.
- `pack.mcmeta` with `pack_format=15` produced a version-only partial runtime result and did not invent a loader.
- Prism instance layout contributed a low-confidence hint only; it did not invent version or loader values.
- `detectWorkspace("")` now throws `root must not be empty` instead of silently resolving to the current working directory.
- Nested paths such as `instances/<name>/minecraft/config` no longer receive `prism-instance-root` evidence.
- Non-directory or inaccessible log helper paths are now treated as best-effort misses and do not abort workspace detection.
- The existing phase-1 foundation, runtime-manager, and bootstrap tests stayed green after adding `workspace-detector`.
- The pre-existing Go tree under `cmd/`, `internal/`, and `testdata/` still matched the recorded checksum baseline at verification time.
