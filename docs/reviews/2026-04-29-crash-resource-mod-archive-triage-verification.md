# Crash Resource Mod Archive Triage Verification
Date: 2026-04-29
Author: m1hono
Scope: `apps/mcp-server`

## Result
Crash triage now carries resource-level log evidence into mod archive search.

- `workspace.analyze` extracts Minecraft resource locations such as `demo:gear` from logs.
- It also extracts concrete `data/...` and `assets/...` paths when logs contain them.
- `log_files` can become a context step when resource signals exist, even when no actionable Java stack frame exists.
- `mod_archive_content` receives those resource references through the request execution context and searches `mods/*.jar` across `data`, `assets`, `java`, and `class`.
- Source line references such as `SomeClass.java:42` are not treated as resource locations.

## RED Output
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/request-executor.test.ts -t "chains crash log resource ids"
```

Initial failure:

```text
FAIL apps/mcp-server/src/request-executor.test.ts > executeMcpServerRequest > chains crash log resource ids into mod archive data and asset search

Expected candidate-1-log_files to be context with signals.resourceLocations ["demo:gear"].
Actual candidate-1-log_files was skipped:
summary: "Analyzed 1 log file(s), but no actionable crash class references were found."

Expected candidate-2-mod_archive_content to search demo:gear.
Actual queries were ["during", "loading", "inspect"] and matches were [].
```

## Real MCP Return Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Creates a temp workspace with:
# - logs/latest.log containing "Failed to load recipe demo:gear"
# - mods/content-mod.jar containing data/demo/recipes/gear.json
# Calls mc_develop with requestText "The server crashes during datapack loading; inspect latest.log and mods."
TS
```

Output excerpt:

```json
{
  "toolNames": [
    "mc_develop"
  ],
  "text": {
    "type": "text",
    "text": "Selected: candidate-2-mod_archive_content (mod_archive_content, context.query)\nRoute: log_files -> mod_archive_content -> workspace_source -> docs_lookup\nExecuted: candidate-1-log_files, candidate-2-mod_archive_content\nContext: candidate-1-log_files\nSummary: Found 1 mod archive content match(es)."
  },
  "selectedEvidence": {
    "candidateId": "candidate-2-mod_archive_content",
    "routeStep": "mod_archive_content",
    "preferredTool": "context.query",
    "status": "selected",
    "attempted": true,
    "summary": "Found 1 mod archive content match(es).",
    "payload": {
      "source": "mod_archive_content",
      "domains": [
        "data",
        "assets",
        "java",
        "class"
      ],
      "queries": [
        "demo:gear",
        "during",
        "loading",
        "inspect"
      ],
      "archiveCount": 1,
      "searchedArchives": 1,
      "matches": [
        {
          "entry": {
            "relativePath": "data/demo/recipes/gear.json",
            "domain": "data",
            "sizeBytes": 23
          },
          "line": 1,
          "column": 12,
          "preview": "{\"result\":\"demo:gear\"}",
          "sourceArchive": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-real-crash-resource-CSMAmc/mods/content-mod.jar"
        }
      ],
      "skipped": [],
      "truncated": false
    }
  }
}
```

## Targeted Test Output
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/workspace-analyze-executor.test.ts apps/mcp-server/src/request-executor.test.ts apps/mcp-server/src/mod-archive-content-executor.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ apps/mcp-server/src/mod-archive-content-executor.test.ts (4 tests) 34ms
 ✓ apps/mcp-server/src/workspace-analyze-executor.test.ts (3 tests) 28ms
 ✓ apps/mcp-server/src/request-executor.test.ts (5 tests) 28ms

 Test Files  3 passed (3)
      Tests  12 passed (12)
   Start at  18:10:04
   Duration  925ms (transform 398ms, setup 0ms, collect 988ms, tests 90ms, environment 0ms, prepare 252ms)
```

## Workspace Test
Command:

```bash
pnpm test
```

Output summary:

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b && vitest run

 Test Files  84 passed (84)
      Tests  263 passed (263)
   Start at  18:10:32
   Duration  2.42s (transform 2.77s, setup 0ms, collect 12.32s, tests 6.12s, environment 8ms, prepare 5.41s)
```

## Typecheck
Command:

```bash
pnpm typecheck
```

Output:

```text
> @mcpskill/workspace@ typecheck /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b --pretty false
```

No TypeScript errors were emitted.

## Guardrails
Command:

```bash
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Output: no source/test files over 500 lines.

Command:

```bash
find . -path './node_modules' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Output: no Go source/module files found.

Command:

```bash
git diff --check
```

Output: no whitespace errors.
