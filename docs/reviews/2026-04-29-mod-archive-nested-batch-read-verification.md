# Mod Archive Nested Batch Read Verification
Date: 2026-04-29
Author: m1hono
Scope: `apps/mcp-server`, `@mcpskill/jar-source-adapter`

## Result
The MCP can now read multiple selected files from one JarJar nested archive in a single request.

- Explicit `nested.jar!/path` requests are parsed as a batch up to 8 entries.
- Multiple readable nested text paths return `mode: "read_nested_many"`.
- The adapter reads the outer jar and selected nested jar once per embedded archive group.
- Single nested-file reads still return `mode: "read_nested"`.
- Existing JarJar list/search and oversized nested-jar skip behavior remain compatible.

## RED Output
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mod-archive-nested-batch-read.test.ts
```

Initial failure:

```text
Expected mode: "read_nested_many" with two nested files.
Actual mode: "read_nested"
Actual summary: "Read data/demo/recipes/nested_gear.json from nested mod archive."
```

## Real MCP Return Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Creates a temp workspace with:
# - mods/outer-mod.jar
# - META-INF/jarjar/nested-content.jar inside the outer jar
# - data/demo/recipes/nested_gear.json inside the nested jar
# - assets/demo/lang/en_us.json inside the nested jar
# Calls mc_develop request execution with two nested jar paths.
TS
```

Output:

```json
{
  "selectedEvidence": {
    "candidateId": "candidate-2-mod_archive_content",
    "routeStep": "mod_archive_content",
    "provenance": "mod_archive_content",
    "preferredTool": "context.query",
    "tier": "primary",
    "pathHints": [
      "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-real-nested-batch-MIvGi7/mods/outer-mod.jar"
    ],
    "queryHint": "Read META-INF/jarjar/nested-content.jar!/data/demo/recipes/nested_gear.json and META-INF/jarjar/nested-content.jar!/assets/demo/lang/en_us.json from mods/outer-mod.jar.",
    "attempted": true,
    "status": "selected",
    "summary": "Read 2 nested mod archive entrie(s).",
    "payload": {
      "source": "mod_archive_content",
      "mode": "read_nested_many",
      "sourceArchive": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-real-nested-batch-MIvGi7/mods/outer-mod.jar",
      "requestedPaths": [
        "META-INF/jarjar/nested-content.jar!/data/demo/recipes/nested_gear.json",
        "META-INF/jarjar/nested-content.jar!/assets/demo/lang/en_us.json"
      ],
      "files": [
        {
          "embeddedArchivePath": "META-INF/jarjar/nested-content.jar",
          "embeddedArchiveMetadata": {
            "loader": "fabric",
            "modId": "nested_content",
            "name": "Nested Content",
            "version": "2.0.0",
            "metadataPath": "fabric.mod.json"
          },
          "requestedPath": "data/demo/recipes/nested_gear.json",
          "entry": {
            "relativePath": "data/demo/recipes/nested_gear.json",
            "domain": "data",
            "sizeBytes": 30
          },
          "content": "{\"result\":\"demo:nested_gear\"}\n"
        },
        {
          "embeddedArchivePath": "META-INF/jarjar/nested-content.jar",
          "embeddedArchiveMetadata": {
            "loader": "fabric",
            "modId": "nested_content",
            "name": "Nested Content",
            "version": "2.0.0",
            "metadataPath": "fabric.mod.json"
          },
          "requestedPath": "assets/demo/lang/en_us.json",
          "entry": {
            "relativePath": "assets/demo/lang/en_us.json",
            "domain": "assets",
            "sizeBytes": 40
          },
          "content": "{\"item.demo.nested_gear\":\"Nested Gear\"}\n"
        }
      ],
      "truncated": false
    }
  }
}
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

## Targeted Test Output
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mod-archive-nested-batch-read.test.ts apps/mcp-server/src/mod-archive-content-executor.test.ts apps/mcp-server/src/mod-archive-nested-list.test.ts packages/jar-source-adapter/src/nested-archive-read.test.ts packages/jar-source-adapter/src/nested-archive-list.test.ts packages/jar-source-adapter/src/archive-set.test.ts apps/mcp-server/src/request-executor.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/nested-archive-list.test.ts (1 test) 4ms
 ✓ packages/jar-source-adapter/src/nested-archive-read.test.ts (2 tests) 5ms
 ✓ packages/jar-source-adapter/src/archive-set.test.ts (3 tests) 16ms
 ✓ apps/mcp-server/src/mod-archive-nested-list.test.ts (2 tests) 2ms
 ✓ apps/mcp-server/src/mod-archive-nested-batch-read.test.ts (1 test) 9ms
 ✓ apps/mcp-server/src/mod-archive-content-executor.test.ts (11 tests) 46ms
 ✓ apps/mcp-server/src/request-executor.test.ts (5 tests) 28ms

 Test Files  7 passed (7)
      Tests  25 passed (25)
   Start at  21:30:09
   Duration  749ms (transform 499ms, setup 0ms, collect 1.17s, tests 108ms, environment 1ms, prepare 578ms)
```

## Final Guardrails
Commands:

```bash
git diff --check
find apps packages tests -path '*/node_modules' -prune -o -path '*/dist' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './.git' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Output:

```text
# All three commands exited 0 and emitted no output.
```

## Final Test Output
Command:

```bash
pnpm test
```

Output:

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b && vitest run

 Test Files  91 passed (91)
      Tests  284 passed (284)
   Start at  21:30:40
   Duration  3.23s (transform 4.70s, setup 0ms, collect 19.10s, tests 7.60s, environment 9ms, prepare 6.38s)
```
