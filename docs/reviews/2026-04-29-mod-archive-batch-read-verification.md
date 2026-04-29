# Mod Archive Batch Read Verification
Date: 2026-04-29
Author: m1hono
Scope: `apps/mcp-server`, `@mcpskill/jar-source-adapter`

## Result
The MCP can now read multiple selected files from the same discovered mod jar in one request.

- `mod_archive_content` recognizes multiple explicit `data/`, `assets/`, `.java`, or `.class` archive paths.
- Multiple readable text paths return `mode: "read_many"`.
- The payload includes `requestedPaths`, per-file `entry`/`content`/`cache`, and an aggregate `truncated` flag.
- The second file in the same request can reuse the existing central-directory cache.
- Single-file reads still return `mode: "read"`.
- Existing list, search, class-owner, inventory, and JarJar read/list/search routes remain unchanged.
- `mod-archive-content-executor.ts` was reduced from 485 lines to 414 by moving read/list helpers into `mod-archive-entry-operations.ts`.

## RED Output
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mod-archive-batch-read.test.ts
```

Initial failure:

```text
Expected mode: "read_many" with two files.
Actual mode: "read"
Actual summary: "Read data/demo/recipes/gear.json from selected mod archive."
```

## Real MCP Return Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Creates a temp workspace with:
# - mods/content-mod.jar containing fabric.mod.json
# - data/demo/recipes/gear.json
# - assets/demo/lang/en_us.json
# Calls mc_develop request execution with:
# Read data/demo/recipes/gear.json and assets/demo/lang/en_us.json from mods/content-mod.jar.
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
      "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-real-batch-read-IlYBJh/mods/content-mod.jar"
    ],
    "queryHint": "Read data/demo/recipes/gear.json and assets/demo/lang/en_us.json from mods/content-mod.jar.",
    "attempted": true,
    "status": "selected",
    "summary": "Read 2 mod archive entrie(s).",
    "payload": {
      "source": "mod_archive_content",
      "mode": "read_many",
      "sourceArchive": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-real-batch-read-IlYBJh/mods/content-mod.jar",
      "archiveMetadata": {
        "loader": "fabric",
        "modId": "content_mod",
        "name": "Content Mod",
        "version": "1.0.0",
        "metadataPath": "fabric.mod.json"
      },
      "requestedPaths": [
        "data/demo/recipes/gear.json",
        "assets/demo/lang/en_us.json"
      ],
      "files": [
        {
          "requestedPath": "data/demo/recipes/gear.json",
          "entry": {
            "relativePath": "data/demo/recipes/gear.json",
            "domain": "data",
            "sizeBytes": 23
          },
          "content": "{\"result\":\"demo:gear\"}\n",
          "cache": {
            "centralDirectoryHit": false,
            "textFileHit": false
          }
        },
        {
          "requestedPath": "assets/demo/lang/en_us.json",
          "entry": {
            "relativePath": "assets/demo/lang/en_us.json",
            "domain": "assets",
            "sizeBytes": 26
          },
          "content": "{\"item.demo.gear\":\"Gear\"}\n",
          "cache": {
            "centralDirectoryHit": true,
            "textFileHit": false
          }
        }
      ],
      "truncated": false
    }
  }
}
```

## Targeted Test Output
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mod-archive-batch-read.test.ts apps/mcp-server/src/mod-archive-content-executor.test.ts apps/mcp-server/src/request-executor.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ apps/mcp-server/src/mod-archive-batch-read.test.ts (1 test) 17ms
 ✓ apps/mcp-server/src/mod-archive-content-executor.test.ts (11 tests) 48ms
 ✓ apps/mcp-server/src/request-executor.test.ts (5 tests) 24ms

 Test Files  3 passed (3)
      Tests  17 passed (17)
   Start at  21:15:00
   Duration  861ms (transform 352ms, setup 0ms, collect 765ms, tests 90ms, environment 0ms, prepare 507ms)
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

 Test Files  90 passed (90)
      Tests  283 passed (283)
   Start at  21:18:23
   Duration  2.77s (transform 3.58s, setup 0ms, collect 14.45s, tests 6.90s, environment 9ms, prepare 6.04s)
```
