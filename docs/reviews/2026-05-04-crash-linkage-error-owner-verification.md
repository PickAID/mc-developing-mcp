# Crash Linkage Error Owner Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice extends crash log class extraction beyond stack frames and missing
class exceptions. It extracts the owner class embedded in JVM linkage error
signatures such as:

```text
java.lang.NoSuchMethodError: 'void com.example.api.EnergyApi.transfer(int)'
```

This is useful for modpack crashes caused by dependency/API version mismatch.
The log line often names the binary owner class directly, and that class can be
passed into the existing mod archive class-owner lookup without adding another
public MCP tool.

## Red
Focused red test:

```bash
pnpm vitest run apps/mcp-server/src/workspace-analyze-executor.test.ts -t "linkage error signatures"
```

Observed failure before implementation:

```text
× executeMcpServerWorkspaceAnalyze > extracts owner class names from linkage error signatures
  → expected { matched: false, ... } to match object { matched: true, ... }

actual actionableClassReferences:
  []

actual classReferences:
  net.minecraft.server.MinecraftServer
```

## Green
Focused green:

```bash
pnpm vitest run apps/mcp-server/src/workspace-analyze-executor.test.ts -t "linkage error signatures"
```

Result:

```text
✓ apps/mcp-server/src/workspace-analyze-executor.test.ts (5 tests | 4 skipped) 5ms

Test Files  1 passed (1)
Tests  1 passed | 4 skipped (5)
```

Workspace analyzer regression:

```bash
pnpm vitest run apps/mcp-server/src/workspace-analyze-executor.test.ts
```

Result:

```text
✓ apps/mcp-server/src/workspace-analyze-executor.test.ts (5 tests) 17ms

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

Line count check:

```text
478 apps/mcp-server/src/workspace-analyze-executor.ts
310 apps/mcp-server/src/workspace-analyze-executor.test.ts
```

## Actual Return Value
Command:

```bash
pnpm tsx -e '...executeMcpServerWorkspaceAnalyze NoSuchMethodError fixture...'
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
        "path": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-actual-linkage-owner-2eZltj/logs/latest.log",
        "sizeBytes": 148,
        "readBytes": 148,
        "signalCount": 3,
        "truncated": false
      }
    ],
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
    },
    "truncated": false
  }
}
```

## Notes
- Linkage owner extraction currently covers `NoSuchMethodError` and
  `NoSuchFieldError` signatures that include a binary owner class followed by
  `.` or `#`.
- The extracted owner flows through the existing `actionableClassReferences`
  pipeline, so later request execution can reuse the existing class-owner JAR
  lookup.
- No new public MCP tool was added.
