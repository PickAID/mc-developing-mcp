# Mod Archive Data Kind Entry Index Verification

Date: 2026-05-05
Author: m1hono

## Scope

This slice lets the existing `mc_develop` mod archive inventory path list
bounded datapack `data/**` entries for a requested data kind without adding a
new public MCP tool.

Implemented behavior:

- `queryCachedModArchiveEntries` accepts `dataKinds` and applies a SQLite
  `data_kind IN (...)` filter.
- ordinary mod archive inventory still uses `limit: 0` and returns counts-only
  data/resource summaries.
- requests such as "recipe data entries" resolve a data-kind intent and return
  at most 12 compact `dataResourceEntries`.
- output entries include archive-relative path, optional embedded archive path,
  resource path, and data kind.
- the public MCP surface remains unchanged.

## TDD Record

Initial RED result recorded before implementation:

```text
$ pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-entry-index.test.ts apps/mcp-server/src/mod-archive-data-summary.test.ts

2 failed | 7 passed

packages/jar-source-adapter/src/mod-archive-entry-index.test.ts
expected entryCount: 1
received entryCount: 3

apps/mcp-server/src/mod-archive-data-summary.test.ts
expected dataEntryCount: 1 and dataResourceEntries for recipes
received dataEntryCount: 4 and no dataResourceEntries
```

Focused integration failure before rebuilding workspace package `dist`:

```text
$ pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-entry-index.test.ts apps/mcp-server/src/mod-archive-data-summary.test.ts apps/mcp-server/src/mod-archive-persistent-inventory.test.ts

✓ packages/jar-source-adapter/src/mod-archive-entry-index.test.ts (7 tests) 36ms
❯ apps/mcp-server/src/mod-archive-data-summary.test.ts (2 tests | 1 failed) 28ms
✓ apps/mcp-server/src/mod-archive-persistent-inventory.test.ts (4 tests) 42ms

Expected dataResourceEntries:
[
  {
    "archiveRelativePath": "mods/data-mod.jar",
    "dataKind": "recipes",
    "relativePath": "data/demo/recipes/gear.json"
  }
]

Received dataResourceEntries included:
[
  "data/demo/loot_tables/blocks/gear.json",
  "data/demo/recipes/gear.json",
  "data/demo/tags/items/gears.json",
  "data/demo/worldgen/biome/gear_fields.json"
]

Test Files  1 failed | 2 passed (3)
Tests       1 failed | 12 passed (13)
```

Interpretation:

- the adapter source test passed after implementation;
- MCP consumed `@mcpskill/jar-source-adapter` through package `exports`, which
  points at `dist`;
- rebuilding the package was required before MCP integration tests could observe
  the new adapter filter.

## Actual Returned Value

Smoke command:

```sh
$ pnpm exec tsx <<'TS'
# Creates a temporary modpack workspace with mods/data-mod.jar containing:
# - data/demo/recipes/gear.json
# - data/demo/tags/items/gears.json
# - data/demo/loot_tables/blocks/gear.json
# - data/demo/worldgen/biome/gear_fields.json
#
# Then runs:
# "List mod archive inventory and recipe data entries for this modpack."
TS
```

Returned value:

```json
{
  "summary": "Listed 1 mod archive inventory entrie(s).",
  "entryIndex": {
    "archiveCount": 1,
    "entryCount": 1,
    "truncated": false,
    "cache": {
      "databasePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-runtime-return-YFPhRa/caches/mod-archives/mod-archive-inventory.sqlite",
      "archiveFingerprintCount": 1,
      "archiveHits": 0,
      "archiveMisses": 1,
      "archiveStale": 0,
      "archiveRefreshes": 0
    }
  },
  "dataResourceSummary": {
    "dataEntryCount": 1,
    "registryLikeCount": 1,
    "byKind": {
      "recipes": 1
    },
    "tokenPolicy": "counts_only"
  },
  "dataResourceEntries": [
    {
      "archiveRelativePath": "mods/data-mod.jar",
      "relativePath": "data/demo/recipes/gear.json",
      "dataKind": "recipes"
    }
  ]
}
```

## Focused Verification

Package rebuild:

```text
$ pnpm --filter @mcpskill/jar-source-adapter build

> @mcpskill/jar-source-adapter@0.0.0 build /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages/jar-source-adapter
> tsc -b
```

Focused tests:

```text
$ pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-entry-index.test.ts apps/mcp-server/src/mod-archive-data-summary.test.ts apps/mcp-server/src/mod-archive-persistent-inventory.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/jar-source-adapter/src/mod-archive-entry-index.test.ts (7 tests) 39ms
✓ apps/mcp-server/src/mod-archive-data-summary.test.ts (2 tests) 22ms
✓ apps/mcp-server/src/mod-archive-persistent-inventory.test.ts (4 tests) 37ms

Test Files  3 passed (3)
Tests       13 passed (13)
Duration    689ms
```

## Full Verification

Full workspace test:

```text
$ pnpm test

Test Files  136 passed (136)
Tests       437 passed (437)
Duration    3.72s
```

Whitespace guard:

```text
$ git diff --check

# no output
```

Line-count guard:

```text
$ find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'

# no output
```

Go cleanup guard:

```text
$ find . -path './.git' -prune -o -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print

# no output
```

Focused file line counts:

```text
$ wc -l packages/jar-source-adapter/src/mod-archive-entry-index.ts apps/mcp-server/src/mod-archive-inventory.ts apps/mcp-server/src/mod-archive-data-summary.test.ts packages/jar-source-adapter/src/mod-archive-entry-index.test.ts

457 packages/jar-source-adapter/src/mod-archive-entry-index.ts
186 apps/mcp-server/src/mod-archive-inventory.ts
189 apps/mcp-server/src/mod-archive-data-summary.test.ts
432 packages/jar-source-adapter/src/mod-archive-entry-index.test.ts
1264 total
```

## Notes

The important UX boundary is preserved: broad inventory requests still return
counts only. Path listing is only enabled for explicit data-kind entry requests,
and the response is bounded.
