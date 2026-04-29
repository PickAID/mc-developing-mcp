# JarJar Nested Read Verification
Date: 2026-04-29
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`

## Result
JarJar support now includes direct file reads, not only search.

- `jar-source-adapter` exposes `readNestedArchiveContentFile`.
- The reader accepts an outer jar path, an embedded jar path, and an inner relative path.
- The reader applies the shared nested jar size cap before loading the embedded jar.
- It returns embedded jar metadata when available.
- `mod_archive_content` recognizes `nested.jar!/path/inside.json` requests.
- The MCP public surface remains one tool, `mc_develop`.

## RED Output
Adapter RED command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/nested-archive-read.test.ts
```

Initial failure:

```text
FAIL packages/jar-source-adapter/src/nested-archive-read.test.ts
Error: Cannot find module './nested-archive-read.js'
```

MCP RED command:

```bash
pnpm --filter @mcpskill/jar-source-adapter build && pnpm exec vitest run apps/mcp-server/src/mod-archive-content-executor.test.ts -t "reads selected files from JarJar"
```

Initial MCP failure:

```text
Expected mode: "read_nested" and content from data/demo/recipes/nested_gear.json.
Actual mode: "read"
Actual summary: "Could not read data/demo/recipes/nested_gear.json from selected mod archive."
```

## Real MCP Return Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Creates a temp workspace with:
# - mods/outer-mod.jar containing META-INF/jarjar/nested-content.jar
# - nested-content.jar containing fabric.mod.json and data/demo/recipes/nested_gear.json
# Calls mc_develop with:
# Read META-INF/jarjar/nested-content.jar!/data/demo/recipes/nested_gear.json from mods/outer-mod.jar.
TS
```

Output:

```json
{
  "toolNames": [
    "mc_develop"
  ],
  "text": {
    "type": "text",
    "text": "Selected: candidate-2-mod_archive_content (mod_archive_content, context.query)\nRoute: workspace_source -> mod_archive_content -> docs_lookup\nExecuted: candidate-1-workspace_source, candidate-2-mod_archive_content\nSummary: Read data/demo/recipes/nested_gear.json from nested mod archive."
  },
  "selectedEvidence": {
    "candidateId": "candidate-2-mod_archive_content",
    "routeStep": "mod_archive_content",
    "preferredTool": "context.query",
    "status": "selected",
    "attempted": true,
    "summary": "Read data/demo/recipes/nested_gear.json from nested mod archive.",
    "payload": {
      "source": "mod_archive_content",
      "mode": "read_nested",
      "requestedPath": "data/demo/recipes/nested_gear.json",
      "sourceArchive": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-real-jarjar-read-WGbzIf/mods/outer-mod.jar",
      "embeddedArchivePath": "META-INF/jarjar/nested-content.jar",
      "embeddedArchiveMetadata": {
        "loader": "fabric",
        "modId": "nested_content",
        "name": "Nested Content",
        "version": "2.0.0",
        "metadataPath": "fabric.mod.json"
      },
      "entry": {
        "relativePath": "data/demo/recipes/nested_gear.json",
        "domain": "data",
        "sizeBytes": 30
      },
      "content": "{\"result\":\"demo:nested_gear\"}\n"
    }
  }
}
```

## Package Test Output
Command:

```bash
pnpm --filter @mcpskill/jar-source-adapter test
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/java-source-archive.test.ts (1 test) 5ms
 ✓ packages/jar-source-adapter/src/mod-archives.test.ts (1 test) 3ms
 ✓ packages/jar-source-adapter/src/nested-archive-read.test.ts (2 tests) 5ms
 ✓ packages/jar-source-adapter/src/class-owner.test.ts (3 tests) 5ms
 ✓ packages/jar-source-adapter/src/archive-content.test.ts (4 tests) 16ms
 ✓ packages/jar-source-adapter/src/archive-set.test.ts (3 tests) 13ms

 Test Files  6 passed (6)
      Tests  14 passed (14)
   Start at  19:01:36
   Duration  272ms (transform 133ms, setup 0ms, collect 257ms, tests 49ms, environment 0ms, prepare 427ms)
```

## Targeted Test Output
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mod-archive-content-executor.test.ts apps/mcp-server/src/request-executor.test.ts packages/jar-source-adapter/src/nested-archive-read.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/nested-archive-read.test.ts (2 tests) 5ms
 ✓ apps/mcp-server/src/mod-archive-content-executor.test.ts (7 tests) 26ms
 ✓ apps/mcp-server/src/request-executor.test.ts (5 tests) 30ms

 Test Files  3 passed (3)
      Tests  14 passed (14)
   Start at  19:04:54
   Duration  624ms (transform 250ms, setup 0ms, collect 542ms, tests 60ms, environment 0ms, prepare 197ms)
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

 Test Files  86 passed (86)
      Tests  271 passed (271)
   Start at  19:05:19
   Duration  2.38s (transform 2.72s, setup 0ms, collect 11.74s, tests 5.65s, environment 11ms, prepare 5.59s)
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

## Review Follow-up
Subagent review found two issues after the first green run:

- Direct nested reads loaded the embedded jar before enforcing a nested jar size cap.
- The adapter unit test leaked its temporary test directory.

Fixes applied:

- Added `DEFAULT_MAX_NESTED_ARCHIVE_BYTES` as a shared adapter limit and checked it before reading embedded jar content.
- Added adapter temp directory cleanup.
- Added an oversized embedded jar regression test.

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
