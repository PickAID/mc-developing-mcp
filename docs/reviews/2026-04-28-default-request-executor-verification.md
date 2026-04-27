# Default Request Executor Verification
Date: 2026-04-28
Author: m1hono
Scope: `apps/mcp-server` default execution pipeline for agentic MCP requests

## Change
`executeMcpServerRequest` now provides a default internal executor layer above the existing request plan and evidence plan.

This keeps the public MCP surface progressive while removing the need for callers to manually wire executor maps for the common path:

- `workspace.analyze` executes `log_files`
- `context.query` executes docs, ProbeJS, and mod archive content routes
- `source.bundle` executes datapack, workspace source, Gradle source archive, Gradle dependency archive, and on-demand vanilla source routes

The key behavior in this pass is context chaining. Crash-log evidence can now be treated as context instead of final evidence, then passed into the next route. For a modpack crash, actionable stack-frame classes from `latest.log` are injected into the following `mod_archive_content` lookup so the MCP can identify which local mod JAR owns the class.

## RED Test
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/request-executor.test.ts
```

Observed failure before implementation:

```text
Error: Cannot find module './request-executor.js'
```

After adding the first implementation, the test reached the behavior layer and failed because selected execution still included unexecuted skipped candidates. The executor was adjusted to stop returning those entries after selection, which keeps the returned context token-efficient.

## Implemented Behavior
- Builds `McpServerRequestPlan` from bootstrap and request text.
- Builds `McpServerEvidencePlan` from the request plan.
- Registers default internal executors for `workspace.analyze`, `source.bundle`, and `context.query`.
- Exposes only the high-level `executeMcpServerRequest` entrypoint from `@mcpskill/mcp-server`, without exposing lower-level executor builders.
- Uses `buildLocalSourcePackageRecipeExecutor()` as the default source package recipe executor.
- Records actionable crash-log evidence as `status: "context"` when a later candidate can use it.
- Enriches later candidate query text with crash-log class references.
- Stops execution once primary or fallback evidence is selected.

## Real Return Value
Command:

```bash
pnpm exec tsx /tmp/mcpskill-request-executor-real-output.ts
```

Observed result excerpt:

```json
{
  "routeSteps": [
    "log_files",
    "mod_archive_content",
    "workspace_source",
    "docs_lookup"
  ],
  "trace": {
    "executedCandidateIds": [
      "candidate-1-log_files",
      "candidate-2-mod_archive_content"
    ],
    "contextCandidateIds": ["candidate-1-log_files"],
    "failedCandidateIds": [],
    "skippedCandidateIds": [],
    "selectedCandidateId": "candidate-2-mod_archive_content",
    "fallbackUsed": false
  },
  "executions": [
    {
      "candidateId": "candidate-1-log_files",
      "routeStep": "log_files",
      "preferredTool": "workspace.analyze",
      "status": "context",
      "attempted": true,
      "summary": "Extracted 1 actionable crash class reference(s) from 1 log file(s).",
      "payload": {
        "source": "workspace_analyze",
        "mode": "log_files",
        "signals": {
          "exceptionClasses": ["java.lang.IllegalStateException"],
          "classReferences": ["com.example.problem.CrashHandler"],
          "actionableClassReferences": ["com.example.problem.CrashHandler"],
          "stackFrames": [
            {
              "className": "com.example.problem.CrashHandler",
              "methodName": "tick",
              "sourceFile": "CrashHandler.java",
              "lineNumber": 42
            }
          ]
        },
        "truncated": false
      }
    },
    {
      "candidateId": "candidate-2-mod_archive_content",
      "routeStep": "mod_archive_content",
      "preferredTool": "context.query",
      "status": "selected",
      "attempted": true,
      "summary": "Located 1 class owner match(es) in mod archives.",
      "payload": {
        "source": "mod_archive_content",
        "mode": "class_owner",
        "requestedClasses": ["com.example.problem.CrashHandler"],
        "matches": [
          {
            "requestedClassName": "com.example.problem.CrashHandler",
            "binaryName": "com.example.problem.CrashHandler",
            "relativePath": "com/example/problem/CrashHandler.class",
            "sizeBytes": 4,
            "matchKind": "exact"
          }
        ],
        "searchedArchives": 1,
        "truncated": false
      }
    }
  ],
  "selectedEvidence": {
    "candidateId": "candidate-2-mod_archive_content",
    "status": "selected"
  }
}
```

## Verification Commands
```bash
pnpm exec vitest run apps/mcp-server/src/request-executor.test.ts
pnpm typecheck
pnpm --filter @mcpskill/mcp-server test
pnpm test
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

## Current Results
- `pnpm exec vitest run apps/mcp-server/src/request-executor.test.ts`: 1 test passed.
- `pnpm exec vitest run apps/mcp-server/src/public-api.test.ts apps/mcp-server/src/request-executor.test.ts`: 2 test files passed, 2 tests passed.
- `pnpm typecheck`: `tsc -b --pretty false` passed.
- `pnpm --filter @mcpskill/mcp-server test`: 20 test files passed, 52 tests passed.
- `pnpm test`: 68 test files passed, 213 tests passed.
- 500-line source/test check: no files reported.
- Go residual check: no files reported.
