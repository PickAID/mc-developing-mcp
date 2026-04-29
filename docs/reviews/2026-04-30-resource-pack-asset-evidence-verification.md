# Resource-Pack Asset Evidence Verification
Date: 2026-04-30
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`, `@mcpskill/service-profile`

## Result
- Mod archive `assets/**` entries now support neutral asset-kind classification.
- SQLite mod archive entry index stores `asset_kind` and returns aggregate summaries.
- MCP inventory output exposes `assetResourceSummary` only as counts-only metadata.
- Runtime service-profile guidance is guarded against long UI/design methodology.
- No new public MCP tool was added.

## RED Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-entry-index.test.ts
```

Output:

```text
❯ packages/jar-source-adapter/src/mod-archive-entry-index.test.ts (3 tests | 1 failed) 21ms
  ✓ queryCachedModArchiveEntries > reuses a SQLite entry index when archive fingerprints match 11ms
  ✓ queryCachedModArchiveEntries > rebuilds a stale SQLite entry index when archive fingerprints change 3ms
  × queryCachedModArchiveEntries > classifies selected asset resources without default path dumping 6ms
    → expected { entries: [], archiveCount: 1, …(3) } to match object { entries: [], entryCount: 4, …(2) }

- Expected
+ Received

  {
-   "assetSummary": {
-     "byKind": {
-       "atlas": 1,
-       "font": 1,
-       "gui_sprite": 1,
-       "gui_texture": 1,
-     },
-     "uiAssetCount": 4,
-   },
    "entries": [],
-   "entryCount": 4,
+   "entryCount": 5,
    "truncated": true,
  }
```

Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mod-archive-persistent-inventory.test.ts
```

Output:

```text
❯ apps/mcp-server/src/mod-archive-persistent-inventory.test.ts (3 tests | 1 failed) 42ms
  ✓ persistent mod archive inventory > reuses the runtime SQLite inventory cache across MCP requests 12ms
  ✓ persistent mod archive inventory > refreshes the runtime SQLite inventory cache when requested 15ms
  × persistent mod archive inventory > summarizes selected asset resources without dumping paths 15ms
    → expected { …(12) } to match object { Object (payload) }

- Expected
+ Received

  {
    "payload": {
-     "assetResourceSummary": {
-       "byKind": {
-         "atlas": 1,
-         "font": 1,
-         "gui_sprite": 1,
-         "gui_texture": 1,
-       },
-       "tokenPolicy": "counts_only",
-       "uiAssetCount": 4,
-     },
      "mode": "inventory",
    },
  }
```

## GREEN Output
Command:

```bash
pnpm typecheck
```

Output:

```text
> @mcpskill/workspace@ typecheck /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b --pretty false
```

Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-entry-index.test.ts apps/mcp-server/src/mod-archive-persistent-inventory.test.ts packages/service-profile/src/profile.test.ts
```

Output:

```text
✓ packages/jar-source-adapter/src/mod-archive-entry-index.test.ts (3 tests) 22ms
✓ packages/service-profile/src/profile.test.ts (1 test) 13ms
✓ apps/mcp-server/src/mod-archive-persistent-inventory.test.ts (3 tests) 33ms

Test Files  3 passed (3)
     Tests  7 passed (7)
```

## Real MCP Sample
Sample action:

```text
Created a temp workspace with mods/asset-mod.jar containing:
- assets/demo/textures/gui/widgets.png
- assets/demo/textures/gui/sprites/button/normal.png
- assets/demo/atlases/gui.json
- assets/demo/font/ui.json

Called executeMcpServerRequest with:
"List mod archive inventory and resource-pack GUI assets."
```

Actual selected evidence payload:

```json
{
  "uiAssetCount": 4,
  "byKind": {
    "atlas": 1,
    "font": 1,
    "gui_sprite": 1,
    "gui_texture": 1
  },
  "tokenPolicy": "counts_only"
}
```

## Line Guard
Command:

```bash
wc -l packages/jar-source-adapter/src/mod-archive-entry-index.ts packages/jar-source-adapter/src/mod-archive-asset-kind.ts packages/jar-source-adapter/src/mod-archive-entry-index-schema.ts apps/mcp-server/src/mod-archive-inventory.ts apps/mcp-server/src/mod-archive-persistent-inventory.test.ts packages/service-profile/src/profile.test.ts
```

Output:

```text
451 packages/jar-source-adapter/src/mod-archive-entry-index.ts
 54 packages/jar-source-adapter/src/mod-archive-asset-kind.ts
 61 packages/jar-source-adapter/src/mod-archive-entry-index-schema.ts
121 apps/mcp-server/src/mod-archive-inventory.ts
283 apps/mcp-server/src/mod-archive-persistent-inventory.test.ts
164 packages/service-profile/src/profile.test.ts
```
