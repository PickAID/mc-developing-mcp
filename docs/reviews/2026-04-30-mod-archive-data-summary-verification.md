# Mod Archive Datapack Data Summary Verification
Date: 2026-04-30
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`

## Result
- Added datapack data-root classification for mod archive entry indexes.
- Persists `data_kind` in the runtime SQLite mod archive entry index.
- Summarizes `data/**` entries as counts-only metadata by kind.
- MCP inventory payloads can now include `dataResourceSummary` without dumping entry paths.
- Classifies common datapack roots such as recipes, tags, loot tables, worldgen, functions, structures, and generic registry JSON.
- No new public MCP tool was added.

## RED Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-entry-index.test.ts apps/mcp-server/src/mod-archive-data-summary.test.ts
```

Initial adapter failure:

```text
FAIL packages/jar-source-adapter/src/mod-archive-entry-index.test.ts
  × queryCachedModArchiveEntries > summarizes datapack data roots from mod archives without path dumping
    → expected { entries: [], archiveCount: 1, … } to match object { entries: [], entryCount: 4, … }

- Expected
+ Received

  {
-   "dataSummary": {
-     "byKind": {
-       "loot_tables": 1,
-       "recipes": 1,
-       "tags": 1,
-       "worldgen": 1,
-     },
-     "dataEntryCount": 4,
-     "registryLikeCount": 4,
-   },
    "entries": [],
    "entryCount": 4,
    "truncated": true,
  }
```

Initial MCP failure:

```text
FAIL apps/mcp-server/src/mod-archive-data-summary.test.ts
  × mod archive datapack data summary > summarizes datapack data roots from mod archives without dumping paths
    → expected { … } to match object { payload: { ... } }

- Expected
+ Received

  {
    "payload": {
-     "dataResourceSummary": {
-       "byKind": {
-         "loot_tables": 1,
-         "recipes": 1,
-         "tags": 1,
-         "worldgen": 1,
-       },
-       "dataEntryCount": 4,
-       "registryLikeCount": 4,
-       "tokenPolicy": "counts_only",
-     },
      "mode": "inventory",
    },
  }
```

## GREEN Output
Command:

```bash
pnpm typecheck && pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-entry-index.test.ts apps/mcp-server/src/mod-archive-data-summary.test.ts
```

Output:

```text
✓ packages/jar-source-adapter/src/mod-archive-entry-index.test.ts (6 tests) 47ms
✓ apps/mcp-server/src/mod-archive-data-summary.test.ts (1 test) 26ms

Test Files  2 passed (2)
     Tests  7 passed (7)
```

Command:

```bash
pnpm test
```

Output:

```text
Test Files  100 passed (100)
     Tests  312 passed (312)
```

## Real MCP Return Value
Sample action:

```text
Created a temp workspace with mods/data-mod.jar containing:
- fabric.mod.json
- data/demo/recipes/gear.json
- data/demo/tags/items/gears.json
- data/demo/loot_tables/blocks/gear.json
- data/demo/worldgen/biome/gear_fields.json

Called mc_develop request execution with:
"List mod archive inventory, JarJar nested jars, and datapack data content."
```

Actual selected return fields:

```json
{
  "selectedCandidateId": "candidate-2-mod_archive_content",
  "status": "selected",
  "summary": "Listed 1 mod archive inventory entrie(s).",
  "mode": "inventory",
  "entryIndex": {
    "archiveCount": 1,
    "entryCount": 4,
    "truncated": true,
    "cache": {
      "databasePath": "/var/folders/mm/.../caches/mod-archives/mod-archive-inventory.sqlite",
      "archiveFingerprintCount": 1,
      "archiveHits": 0,
      "archiveMisses": 1,
      "archiveStale": 0,
      "archiveRefreshes": 0
    }
  },
  "dataResourceSummary": {
    "dataEntryCount": 4,
    "registryLikeCount": 4,
    "byKind": {
      "loot_tables": 1,
      "recipes": 1,
      "tags": 1,
      "worldgen": 1
    },
    "tokenPolicy": "counts_only"
  },
  "payloadContainsWorldgenPath": false
}
```

## Guards
Commands:

```bash
git diff --check
find apps packages tests -path '*/node_modules' -prune -o -path '*/dist' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './.git' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Output:

```text
No output.
```

Line-count spot check:

```text
435 packages/jar-source-adapter/src/mod-archive-entry-index.ts
115 packages/jar-source-adapter/src/mod-archive-entry-index-summaries.ts
 78 packages/jar-source-adapter/src/mod-archive-data-kind.ts
390 packages/jar-source-adapter/src/mod-archive-entry-index.test.ts
149 apps/mcp-server/src/mod-archive-data-summary.test.ts
129 apps/mcp-server/src/mod-archive-inventory.ts
```
