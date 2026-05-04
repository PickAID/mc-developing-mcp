# Crash Missing Class Log Signal Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice teaches workspace crash log analysis to extract missing runtime class
names from class loading exceptions, not only from Java stack frames.

The targeted log shapes are:

```text
java.lang.NoClassDefFoundError: com/example/api/EnergyApi
Caused by: java.lang.ClassNotFoundException: com.example.lib.Helper
```

This matters for modpack crash triage because a missing class often appears only
on the exception line. If the analyzer misses that value, the later
`mod_archive_content` class-owner lookup has no precise class query and the
agent can waste time searching project source that does not exist locally.

## Red
Focused red test:

```bash
pnpm vitest run apps/mcp-server/src/workspace-analyze-executor.test.ts -t "missing class names"
```

Observed failure before implementation:

```text
× executeMcpServerWorkspaceAnalyze > extracts missing class names from class loading exceptions
  → expected actionableClassReferences to include:
    com.example.api.EnergyApi
    com.example.lib.Helper

  actual classReferences:
    net.minecraft.server.MinecraftServer

  actual actionableClassReferences:
    []
```

## Green
Focused green:

```bash
pnpm vitest run apps/mcp-server/src/workspace-analyze-executor.test.ts -t "missing class names"
```

Result:

```text
✓ apps/mcp-server/src/workspace-analyze-executor.test.ts (4 tests | 3 skipped) 5ms

Test Files  1 passed (1)
Tests  1 passed | 3 skipped (4)
```

Workspace analyzer regression:

```bash
pnpm vitest run apps/mcp-server/src/workspace-analyze-executor.test.ts
```

Result:

```text
✓ apps/mcp-server/src/workspace-analyze-executor.test.ts (4 tests) 16ms

Test Files  1 passed (1)
Tests  4 passed (4)
```

Request execution chain regression:

```bash
pnpm vitest run apps/mcp-server/src/request-executor.test.ts -t "chains crash log signals"
```

Result:

```text
✓ apps/mcp-server/src/request-executor.test.ts (5 tests | 4 skipped) 11ms

Test Files  1 passed (1)
Tests  1 passed | 4 skipped (5)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  124 passed (124)
Tests  407 passed (407)
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
pnpm tsx -e '...executeMcpServerWorkspaceAnalyze missing-class fixture...'
```

Return value:

```json
{
  "matched": true,
  "summary": "Extracted 2 actionable crash class reference(s) from 1 log file(s).",
  "payload": {
    "source": "workspace_analyze",
    "mode": "log_files",
    "logFiles": [
      {
        "path": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-actual-crash-missing-u5q37V/logs/latest.log",
        "sizeBytes": 198,
        "readBytes": 198,
        "signalCount": 5,
        "truncated": false
      }
    ],
    "signals": {
      "exceptionClasses": [
        "java.lang.NoClassDefFoundError",
        "java.lang.ClassNotFoundException"
      ],
      "resourceLocations": [],
      "resourcePaths": [],
      "classReferences": [
        "com.example.api.EnergyApi",
        "com.example.lib.Helper",
        "net.minecraft.server.MinecraftServer"
      ],
      "actionableClassReferences": [
        "com.example.api.EnergyApi",
        "com.example.lib.Helper"
      ],
      "stackFrames": []
    },
    "truncated": false
  }
}
```

## Notes
- The parser normalizes JVM slash-form class names to binary dotted names.
- Only actionable non-Minecraft class names are forwarded for later context
  chaining.
- No new public MCP tool was added. This improves the existing crash triage
  pipeline.
