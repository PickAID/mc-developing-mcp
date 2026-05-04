# Mod Archive Asset Kind Entry Index Verification

Date: 2026-05-05
Author: m1hono

## Scope

This slice adds bounded `assets/**` entry listing to the existing mod archive
inventory path. It mirrors the datapack `dataKinds` entry filter already present
for recipes/tags/worldgen, without adding a public MCP tool.

Implemented behavior:

- inventory requests can infer selected asset kinds such as `models`,
  `blockstates`, `textures`, `lang`, `font`, and `sounds`;
- selected asset-kind requests query the persistent SQLite entry index with
  `domains: ["assets"]` and `assetKinds`;
- broad asset inventory remains counts-only by default;
- explicit asset-kind entry requests return bounded compact
  `assetResourceEntries`.

## TDD Record

RED before implementation:

```text
$ pnpm exec vitest run apps/mcp-server/src/mod-archive-persistent-inventory.test.ts -t "lists bounded model asset entries"

❯ apps/mcp-server/src/mod-archive-persistent-inventory.test.ts (5 tests | 1 failed | 4 skipped)

Expected:
assetResourceSummary.assetEntryCount = 1
assetResourceEntries = [
  {
    "archiveRelativePath": "mods/asset-mod.jar",
    "assetKind": "models",
    "relativePath": "assets/demo/models/block/gear.json"
  }
]

Received:
assetResourceSummary.assetEntryCount = 7
assetResourceEntries missing
```

GREEN focused verification:

```text
$ pnpm exec vitest run apps/mcp-server/src/mod-archive-persistent-inventory.test.ts apps/mcp-server/src/mod-archive-data-summary.test.ts packages/jar-source-adapter/src/mod-archive-entry-index.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/jar-source-adapter/src/mod-archive-entry-index.test.ts (7 tests) 33ms
✓ apps/mcp-server/src/mod-archive-data-summary.test.ts (2 tests) 23ms
✓ apps/mcp-server/src/mod-archive-persistent-inventory.test.ts (5 tests) 41ms

Test Files  3 passed (3)
Tests       14 passed (14)
Duration    684ms
```

## Actual Returned Value

Smoke command:

```sh
$ pnpm exec tsx <<'TS'
# Creates a temp modpack workspace with mods/asset-mod.jar containing:
# - assets/demo/models/block/gear.json
# - assets/demo/blockstates/gear.json
# - assets/demo/textures/block/gear.png
#
# Then runs:
# "List mod archive inventory and model asset entries for this modpack."
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
      "databasePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-runtime-asset-return-bC6rli/caches/mod-archives/mod-archive-inventory.sqlite",
      "archiveFingerprintCount": 1,
      "archiveHits": 0,
      "archiveMisses": 1,
      "archiveStale": 0,
      "archiveRefreshes": 0
    }
  },
  "assetResourceSummary": {
    "assetEntryCount": 1,
    "uiAssetCount": 0,
    "byKind": {
      "models": 1
    },
    "tokenPolicy": "counts_only"
  },
  "assetResourceEntries": [
    {
      "archiveRelativePath": "mods/asset-mod.jar",
      "relativePath": "assets/demo/models/block/gear.json",
      "assetKind": "models"
    }
  ]
}
```

## Notes

This is intentionally narrower than full resource search. It only lists bounded
indexed paths when a request names a concrete asset kind.
