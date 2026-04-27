# Workspace Analyze Log Files Verification
Date: 2026-04-28
Author: m1hono
Scope: `apps/mcp-server` crash-log execution path for `workspace.analyze`

## Change
`workspace.analyze` now has an internal executor for the existing `log_files` route.

The executor is intentionally narrow. It does not try to perform full crash diagnosis. It turns local logs into compact crash signals that the agent can use for the next source/JAR query:

- exception classes
- stack-frame class references
- actionable class references after filtering Java and vanilla Minecraft packages
- per-log read budget and truncation metadata

This preserves the progressive MCP surface: the tool route stays `workspace.analyze -> source.bundle/context.query`, instead of exposing many small crash-log tools.

## RED Test
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/workspace-analyze-executor.test.ts
```

Observed failure before implementation:

```text
Error: Cannot find module './workspace-analyze-executor.js'
```

This proved `log_files` was planned by the harness but had no real executor.

## Implemented Behavior
- Reads discovered `descriptor.logPaths` and candidate path hints.
- Caps analysis to 4 log files.
- Reads only the last 256 KiB per log file to avoid token and I/O waste.
- Extracts `*Exception` / `*Error` qualified classes.
- Extracts Java stack frames with class name, method, source file, and line number.
- Filters actionable classes by ignoring `java.*`, `javax.*`, `jdk.*`, `sun.*`, `net.minecraft.*`, and `com.mojang.*`.

## Real Return Value
Command:

```bash
pnpm exec tsx tmp/workspace-analyze-log-smoke.ts
```

Observed result excerpt:

```json
{
  "candidate": {
    "id": "candidate-1-log_files",
    "routeStep": "log_files",
    "preferredTool": "workspace.analyze",
    "reason": "Inspect concrete crash logs before source or docs."
  },
  "result": {
    "matched": true,
    "summary": "Extracted 2 actionable crash class reference(s) from 1 log file(s).",
    "payload": {
      "source": "workspace_analyze",
      "mode": "log_files",
      "logFiles": [
        {
          "signalCount": 4,
          "truncated": false
        }
      ],
      "signals": {
        "exceptionClasses": ["java.lang.IllegalStateException"],
        "classReferences": [
          "com.example.external.SomeExternalClass",
          "com.example.project.LocalCaller",
          "net.minecraft.server.MinecraftServer"
        ],
        "actionableClassReferences": [
          "com.example.external.SomeExternalClass",
          "com.example.project.LocalCaller"
        ],
        "stackFrames": [
          {
            "className": "com.example.external.SomeExternalClass",
            "methodName": "handle",
            "sourceFile": "SomeExternalClass.java",
            "lineNumber": 42
          },
          {
            "className": "com.example.project.LocalCaller",
            "methodName": "call",
            "sourceFile": "LocalCaller.java",
            "lineNumber": 18
          }
        ]
      },
      "truncated": false
    }
  }
}
```

## Verification Commands
```bash
pnpm exec vitest run apps/mcp-server/src/workspace-analyze-executor.test.ts
pnpm typecheck
pnpm --filter @mcpskill/mcp-server test
pnpm test
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

## Current Results
- `pnpm exec vitest run apps/mcp-server/src/workspace-analyze-executor.test.ts`: 1 test passed.
- `pnpm typecheck`: `tsc -b --pretty false` passed.
- `pnpm --filter @mcpskill/mcp-server test`: 18 test files passed, 49 tests passed.
- `pnpm test`: 66 test files passed, 210 tests passed.
- 500-line source/test check: no files reported.
- Go residual check: no files reported.
