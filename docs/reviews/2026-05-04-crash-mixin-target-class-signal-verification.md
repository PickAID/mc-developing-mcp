# Crash Mixin Target Class Signal Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice extracts target classes from Mixin apply failure log lines:

```text
Mixin apply failed demo.mixins.json:CompatMixin -> com.example.compat.TargetApi: org.spongepowered.asm.mixin.injection.throwables.InvalidInjectionException
```

The purpose is to keep modpack crash triage on local evidence. When the crash
log names a non-vanilla Mixin target class, the MCP can forward that class
through the existing `actionableClassReferences` pipeline and let the later
mod-archive class-owner lookup identify which local JAR owns it.

## Red
Focused red test:

```bash
pnpm vitest run apps/mcp-server/src/crash-log-signals.test.ts -t "Mixin apply target"
```

Observed failure before implementation:

```text
× parseCrashSignals > extracts Mixin apply target classes for archive owner lookup
  → expected classReferences/actionableClassReferences to include:
    com.example.compat.TargetApi

actual classReferences:
  []

actual actionableClassReferences:
  []
```

## Green
Focused green:

```bash
pnpm vitest run apps/mcp-server/src/crash-log-signals.test.ts -t "Mixin apply target"
```

Result:

```text
✓ apps/mcp-server/src/crash-log-signals.test.ts (1 test) 2ms

Test Files  1 passed (1)
Tests  1 passed (1)
```

Parser plus workspace analyzer regression:

```bash
pnpm vitest run apps/mcp-server/src/crash-log-signals.test.ts apps/mcp-server/src/workspace-analyze-executor.test.ts
```

Result:

```text
✓ apps/mcp-server/src/crash-log-signals.test.ts (1 test) 2ms
✓ apps/mcp-server/src/workspace-analyze-executor.test.ts (5 tests) 18ms

Test Files  2 passed (2)
Tests  6 passed (6)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  125 passed (125)
Tests  409 passed (409)
```

Repository guards:

```bash
git diff --check
find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './.git' -prune -o -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Result: no output from all three guard commands.

Line count check:

```text
191 apps/mcp-server/src/crash-log-signals.ts
22 apps/mcp-server/src/crash-log-signals.test.ts
309 apps/mcp-server/src/workspace-analyze-executor.ts
310 apps/mcp-server/src/workspace-analyze-executor.test.ts
```

## Actual Return Value
Command:

```bash
pnpm tsx -e '...executeMcpServerWorkspaceAnalyze Mixin apply fixture...'
```

Return value:

```json
{
  "matched": true,
  "summary": "Extracted 1 actionable crash class reference(s) from 1 log file(s).",
  "payload": {
    "source": "workspace_analyze",
    "mode": "log_files",
    "logFiles": [
      {
        "path": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-actual-mixin-target-eISJ4A/logs/latest.log",
        "sizeBytes": 156,
        "readBytes": 156,
        "signalCount": 2,
        "truncated": false
      }
    ],
    "signals": {
      "exceptionClasses": [
        "org.spongepowered.asm.mixin.injection.throwables.InvalidInjectionException"
      ],
      "resourceLocations": [],
      "resourcePaths": [],
      "classReferences": [
        "com.example.compat.TargetApi"
      ],
      "actionableClassReferences": [
        "com.example.compat.TargetApi"
      ],
      "stackFrames": []
    },
    "truncated": false
  }
}
```

## Notes
- This does not add a new public MCP tool.
- Vanilla targets such as `net.minecraft.*` still get filtered out of
  `actionableClassReferences` by the existing ignored-prefix policy.
- Root-level `*.mixins.json` archive search is intentionally left for a separate
  metadata-domain slice, because that changes JAR search domain scope.
