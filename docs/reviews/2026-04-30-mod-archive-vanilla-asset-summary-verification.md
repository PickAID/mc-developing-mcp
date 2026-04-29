# Mod Archive Vanilla Asset Summary Verification
Date: 2026-04-30
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`

## Result
- Mod archive entry index now classifies general vanilla asset roots, not only GUI-oriented assets.
- Supported counted asset roots now include blockstates, models, textures, lang, atlas, font, items, equipment, particles, post_effect, shaders, sounds, texts, and waypoint_style.
- Existing GUI-specific kinds remain compatible as `gui_texture` and `gui_sprite`.
- `assetResourceSummary` now includes `assetEntryCount` for all indexed asset kinds and keeps `uiAssetCount` for the previous UI-focused subset.
- MCP inventory output remains counts-only; no asset path list is emitted by default.

## RED Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-entry-index.test.ts apps/mcp-server/src/mod-archive-persistent-inventory.test.ts
```

Output:

```text
❯ packages/jar-source-adapter/src/mod-archive-entry-index.test.ts (4 tests | 1 failed) 26ms
  × queryCachedModArchiveEntries > summarizes vanilla asset roots from mod archives without path dumping 6ms
    → expected { entries: [], archiveCount: 1, …(4) } to match object { entries: [], …(2) }

- Expected
+ Received

  {
    "assetSummary": {
-     "assetEntryCount": 4,
      "byKind": {
-       "blockstates": 1,
        "lang": 1,
-       "models": 1,
-       "textures": 1,
      },
      "uiAssetCount": 1,
    },
    "entries": [],
    "truncated": true,
```

```text
❯ apps/mcp-server/src/mod-archive-persistent-inventory.test.ts (4 tests | 1 failed) 38ms
  × persistent mod archive inventory > summarizes vanilla asset roots from mod archives without dumping paths 8ms
    → expected { …(12) } to match object { Object (payload) }

- Expected
+ Received

  {
    "payload": {
      "assetResourceSummary": {
-       "assetEntryCount": 7,
        "byKind": {
          "atlas": 1,
-         "blockstates": 1,
          "font": 1,
          "gui_sprite": 1,
          "gui_texture": 1,
-         "models": 1,
-         "textures": 1,
        },
        "tokenPolicy": "counts_only",
      },
      "mode": "inventory",
    },
```

## GREEN Output
Command:

```bash
pnpm typecheck && pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-entry-index.test.ts apps/mcp-server/src/mod-archive-persistent-inventory.test.ts
```

Output:

```text
✓ packages/jar-source-adapter/src/mod-archive-entry-index.test.ts (4 tests) 29ms
✓ apps/mcp-server/src/mod-archive-persistent-inventory.test.ts (4 tests) 38ms

Test Files  2 passed (2)
     Tests  8 passed (8)
```

Command:

```bash
pnpm test
```

Output:

```text
Test Files  97 passed (97)
     Tests  305 passed (305)
```

## Real MCP Return Value
Sample action:

```text
Created a temp workspace with mods/asset-mod.jar containing:
- fabric.mod.json
- assets/demo/blockstates/gear.json
- assets/demo/models/block/gear.json
- assets/demo/textures/block/gear.png
- assets/demo/lang/en_us.json

Called executeMcpServerRequest with:
"List mod archive inventory and resource assets."
```

Actual selected return fields:

```json
{
  "summary": "Listed 1 mod archive inventory entrie(s).",
  "mode": "inventory",
  "entryIndex": {
    "archiveCount": 1,
    "entryCount": 4,
    "truncated": true,
    "cache": {
      "archiveFingerprintCount": 1,
      "archiveHits": 0,
      "archiveMisses": 1,
      "archiveStale": 0,
      "archiveRefreshes": 0
    }
  },
  "assetResourceSummary": {
    "assetEntryCount": 4,
    "uiAssetCount": 1,
    "byKind": {
      "blockstates": 1,
      "lang": 1,
      "models": 1,
      "textures": 1
    },
    "tokenPolicy": "counts_only"
  }
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
457 packages/jar-source-adapter/src/mod-archive-entry-index.ts
 91 packages/jar-source-adapter/src/mod-archive-asset-kind.ts
289 packages/jar-source-adapter/src/mod-archive-entry-index.test.ts
336 apps/mcp-server/src/mod-archive-persistent-inventory.test.ts
121 apps/mcp-server/src/mod-archive-inventory.ts
```
