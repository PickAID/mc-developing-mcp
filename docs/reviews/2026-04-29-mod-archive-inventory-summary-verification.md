# Mod Archive Inventory Summary Verification
Date: 2026-04-29
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`

## Result
Mod archive inventory now includes content-domain summaries for outer mod jars and one-level JarJar nested jars.

- Each inventory archive entry includes `contentSummary.fileCount`.
- `contentSummary.byDomain` reports `java`, `data`, `assets`, and `class` counts.
- Nested JarJar entries include the same summary when the embedded jar can be read as a zip.
- Invalid nested jars do not crash inventory; their summary is omitted.
- MCP `mod_archive_content` inventory responses pass the summary through unchanged.

## RED Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-inventory.test.ts
```

Initial failure:

```text
Expected contentSummary on the outer archive and nested archive.
Actual payload included archiveMetadata and nestedArchives, but no contentSummary fields.
```

## GREEN Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-inventory.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/mod-archive-inventory.test.ts (3 tests) 10ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  22:03:38
   Duration  243ms (transform 36ms, setup 0ms, collect 42ms, tests 10ms, environment 0ms, prepare 65ms)
```

## Targeted Regression Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-inventory.test.ts apps/mcp-server/src/mod-archive-content-executor.test.ts apps/mcp-server/src/request-executor.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/jar-source-adapter/src/mod-archive-inventory.test.ts (3 tests) 12ms
 ✓ apps/mcp-server/src/mod-archive-content-executor.test.ts (11 tests) 30ms
 ✓ apps/mcp-server/src/request-executor.test.ts (5 tests) 27ms

 Test Files  3 passed (3)
      Tests  19 passed (19)
   Start at  22:03:46
   Duration  625ms (transform 264ms, setup 0ms, collect 553ms, tests 69ms, environment 0ms, prepare 154ms)
```

## Real MCP Return Sample
Command:

```bash
pnpm exec tsx <<'TS'
# Creates a temp workspace with mods/outer-mod.jar.
# The outer jar contains data, assets, java, class, and one JarJar nested jar.
# The nested jar contains data and assets.
# Calls mc_develop request execution with:
# List mod archive inventory and JarJar nested jars for this modpack.
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
      "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-inventory-summary-wXahmL/mods/outer-mod.jar"
    ],
    "queryHint": "List mod archive inventory and JarJar nested jars for this modpack.",
    "attempted": true,
    "status": "selected",
    "summary": "Listed 1 mod archive inventory entrie(s).",
    "payload": {
      "source": "mod_archive_content",
      "mode": "inventory",
      "archives": [
        {
          "relativePath": "mods/outer-mod.jar",
          "source": "mods-directory",
          "archiveMetadata": {
            "loader": "fabric",
            "modId": "outer_mod",
            "name": "Outer Mod",
            "version": "1.0.0",
            "metadataPath": "fabric.mod.json"
          },
          "contentSummary": {
            "fileCount": 4,
            "byDomain": {
              "java": 1,
              "data": 1,
              "assets": 1,
              "class": 1
            }
          },
          "nestedArchives": [
            {
              "embeddedArchivePath": "META-INF/jarjar/nested-content.jar",
              "embeddedArchiveMetadata": {
                "loader": "fabric",
                "modId": "nested_content",
                "version": "2.0.0",
                "metadataPath": "fabric.mod.json"
              },
              "contentSummary": {
                "fileCount": 2,
                "byDomain": {
                  "java": 0,
                  "data": 1,
                  "assets": 1,
                  "class": 0
                }
              },
              "sizeBytes": 509
            }
          ]
        }
      ],
      "archiveCount": 1,
      "truncated": false,
      "cache": {
        "centralDirectoryHits": 0,
        "centralDirectoryMisses": 1
      }
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

## Final Test Output
Command:

```bash
pnpm test
```

Output:

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b && vitest run

 Test Files  92 passed (92)
      Tests  285 passed (285)
   Start at  22:05:06
   Duration  2.62s (transform 2.85s, setup 0ms, collect 12.83s, tests 6.65s, environment 9ms, prepare 6.02s)
```
