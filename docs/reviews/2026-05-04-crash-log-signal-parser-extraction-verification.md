# Crash Log Signal Parser Extraction Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice is a maintainability refactor. The crash log parsing, merging, and
summary logic moved out of `workspace-analyze-executor.ts` into
`crash-log-signals.ts`.

The goal is to keep the executor responsible for orchestration and file IO,
while making crash parsing independently extensible for later Mixin, Fabric
Loader, NeoForge, and resource-loading crash patterns.

## Before
Line counts before extraction:

```text
478 apps/mcp-server/src/workspace-analyze-executor.ts
310 apps/mcp-server/src/workspace-analyze-executor.test.ts
```

Problem: adding more crash patterns would push the executor toward the 500-line
limit and mix unrelated responsibilities in one file.

## After
Line counts after extraction:

```text
309 apps/mcp-server/src/workspace-analyze-executor.ts
180 apps/mcp-server/src/crash-log-signals.ts
310 apps/mcp-server/src/workspace-analyze-executor.test.ts
```

## Verification
Focused regression:

```bash
pnpm vitest run apps/mcp-server/src/workspace-analyze-executor.test.ts
```

Result:

```text
✓ apps/mcp-server/src/workspace-analyze-executor.test.ts (5 tests) 18ms

Test Files  1 passed (1)
Tests  5 passed (5)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  124 passed (124)
Tests  408 passed (408)
```

Repository guards:

```bash
git diff --check
find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './.git' -prune -o -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Result: no output from all three guard commands.

## Actual Return Value
Command:

```bash
pnpm tsx -e '...parseCrashSignals NoSuchMethodError fixture...'
```

Return value:

```json
{
  "summary": "Extracted 1 actionable crash class reference(s) from 1 log file(s).",
  "signals": {
    "exceptionClasses": [
      "java.lang.NoSuchMethodError"
    ],
    "resourceLocations": [],
    "resourcePaths": [],
    "classReferences": [
      "com.example.api.EnergyApi",
      "net.minecraft.server.MinecraftServer"
    ],
    "actionableClassReferences": [
      "com.example.api.EnergyApi"
    ],
    "stackFrames": []
  }
}
```

## Notes
- No behavior was intentionally changed in this refactor.
- `workspace-analyze-executor.ts` now imports crash parsing as a cohesive module
  instead of owning every regex and merge helper.
- This keeps later crash-pattern additions from bloating the executor.
