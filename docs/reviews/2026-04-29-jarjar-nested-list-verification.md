# JarJar Nested List Verification
Date: 2026-04-29
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`

## Result
JarJar support now includes direct nested archive listing.

- `jar-source-adapter` exposes `listNestedArchiveContent`.
- The lister accepts an outer jar path, an embedded jar path, selected content domains, and a result limit.
- It applies the shared nested jar size cap before loading the embedded jar.
- It returns embedded jar metadata when available.
- `mod_archive_content` recognizes explicit `nested.jar!` listing requests.
- Normal outer jar listing still uses `mode: "list"` and is not routed to nested listing.
- A parser-level regression test now requires an explicit `!` marker before nested listing can trigger.
- The MCP public surface remains one tool, `mc_develop`.

## RED Output
Adapter RED command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/nested-archive-list.test.ts
```

Initial failure:

```text
FAIL packages/jar-source-adapter/src/nested-archive-list.test.ts
Error: Cannot find module './nested-archive-list.js'
```

MCP RED command:

```bash
pnpm exec vitest run apps/mcp-server/src/mod-archive-content-executor.test.ts -t "lists selected domains from JarJar"
```

Initial MCP failure:

```text
Expected mode: "list_nested" with data/demo/recipes/nested_gear.json.
Actual mode: "list"
Actual entries: []
Actual summary: "Listed 0 mod archive entrie(s)."
```

## Real MCP Return Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Creates a temp workspace with:
# - mods/outer-mod.jar containing META-INF/jarjar/nested-content.jar
# - nested-content.jar containing fabric.mod.json, data/demo/recipes/nested_gear.json, and assets/demo/lang/en_us.json
# Calls mc_develop request execution with:
# List data entries in META-INF/jarjar/nested-content.jar! from mods/outer-mod.jar.
TS
```

Output:

```json
{
  "selectedEvidence": {
    "candidateId": "candidate-2-mod_archive_content",
    "routeStep": "mod_archive_content",
    "preferredTool": "context.query",
    "status": "selected",
    "summary": "Listed 1 nested mod archive entrie(s).",
    "payload": {
      "source": "mod_archive_content",
      "mode": "list_nested",
      "domains": [
        "data"
      ],
      "sourceArchive": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-real-jarjar-list-KcweJn/mods/outer-mod.jar",
      "embeddedArchivePath": "META-INF/jarjar/nested-content.jar",
      "embeddedArchiveMetadata": {
        "loader": "fabric",
        "modId": "nested_content",
        "name": "Nested Content",
        "version": "2.0.0",
        "metadataPath": "fabric.mod.json"
      },
      "entries": [
        {
          "relativePath": "data/demo/recipes/nested_gear.json",
          "domain": "data",
          "sizeBytes": 30
        }
      ],
      "truncated": false
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

 ✓ packages/jar-source-adapter/src/mod-archives.test.ts (1 test) 7ms
 ✓ packages/jar-source-adapter/src/java-source-archive.test.ts (1 test) 9ms
 ✓ packages/jar-source-adapter/src/nested-archive-list.test.ts (1 test) 10ms
 ✓ packages/jar-source-adapter/src/archive-content.test.ts (4 tests) 32ms
 ✓ packages/jar-source-adapter/src/nested-archive-read.test.ts (2 tests) 8ms
 ✓ packages/jar-source-adapter/src/class-owner.test.ts (3 tests) 9ms
 ✓ packages/jar-source-adapter/src/archive-set.test.ts (3 tests) 21ms

 Test Files  7 passed (7)
      Tests  15 passed (15)
   Start at  19:11:55
   Duration  537ms (transform 223ms, setup 0ms, collect 600ms, tests 97ms, environment 1ms, prepare 960ms)
```

## Targeted Test Output
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mod-archive-content-executor.test.ts apps/mcp-server/src/request-executor.test.ts apps/mcp-server/src/mod-archive-nested-list.test.ts packages/jar-source-adapter/src/nested-archive-list.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/nested-archive-list.test.ts (1 test) 4ms
 ✓ apps/mcp-server/src/mod-archive-nested-list.test.ts (2 tests) 1ms
 ✓ apps/mcp-server/src/mod-archive-content-executor.test.ts (8 tests) 30ms
 ✓ apps/mcp-server/src/request-executor.test.ts (5 tests) 35ms

 Test Files  4 passed (4)
      Tests  16 passed (16)
   Start at  19:15:09
   Duration  650ms (transform 245ms, setup 0ms, collect 661ms, tests 69ms, environment 0ms, prepare 292ms)
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

## Workspace Test
Command:

```bash
pnpm test
```

Output summary:

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b && vitest run

 Test Files  88 passed (88)
      Tests  275 passed (275)
   Start at  19:15:15
   Duration  2.69s (transform 3.59s, setup 0ms, collect 14.03s, tests 6.27s, environment 10ms, prepare 6.00s)
```

## Guardrails
Command:

```bash
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Output: no source/test files over 500 lines.

Command:

```bash
find . -path './node_modules' -prune -o -path './.git' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Output: no Go source/module files found.

Command:

```bash
git diff --check
```

Output: no whitespace errors.
