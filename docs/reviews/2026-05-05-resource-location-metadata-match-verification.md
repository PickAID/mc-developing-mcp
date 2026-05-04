# Resource Location Metadata Match Verification

Date: 2026-05-05
Author: m1hono

## Scope

This slice lets local loose `assets/**` evidence match resource-location queries
through file metadata instead of requiring the queried id to appear inside file
contents.

Implemented behavior:

- `searchDatapackFiles` now checks per-entry resource-location metadata before
  reading file content;
- `assets/<namespace>/items/**.json` can match `namespace:item/...`;
- `assets/<namespace>/models/**` and `assets/<namespace>/textures/**` can match
  `namespace:...`;
- binary texture files can match by metadata without being read or skipped as
  binary;
- broad summaries remain counts-only.

## Focused Verification

```text
$ pnpm exec vitest run packages/datapack-adapter/src/resource-location-matches.test.ts apps/mcp-server/src/source-bundle-resource-location.test.ts apps/mcp-server/src/source-bundle-resource-root-summary.test.ts packages/datapack-adapter/src/index.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/datapack-adapter/src/resource-location-matches.test.ts (1 test) 11ms
✓ packages/datapack-adapter/src/index.test.ts (10 tests) 41ms
✓ apps/mcp-server/src/source-bundle-resource-location.test.ts (1 test) 14ms
✓ apps/mcp-server/src/source-bundle-resource-root-summary.test.ts (1 test) 14ms

Test Files  4 passed (4)
Tests       13 passed (13)
Duration    639ms
```

## Actual Returned Value

Smoke command:

```sh
$ pnpm exec tsx <<'TS'
# Creates a temp workspace with:
# - assets/demo/items/gear.json
# - assets/demo/models/item/gear.json
# - assets/demo/textures/item/gear.png
#
# Then runs:
# "Find local resource assets for demo:item/gear."
TS
```

Returned value:

```json
{
  "matched": true,
  "summary": "Resolved 3 local datapack evidence item(s).",
  "queries": [
    "demo:item/gear"
  ],
  "resourceLocationMatches": [
    {
      "relativePath": "assets/demo/items/gear.json",
      "preview": "resource-location metadata: demo:item/gear"
    },
    {
      "relativePath": "assets/demo/models/item/gear.json",
      "preview": "resource-location metadata: demo:item/gear"
    },
    {
      "relativePath": "assets/demo/textures/item/gear.png",
      "preview": "resource-location metadata: demo:item/gear"
    }
  ],
  "skipped": [],
  "resourceSummary": {
    "tokenPolicy": "counts_only",
    "rootCount": 1,
    "entryCount": 3,
    "byRootKind": {
      "workspace_assets_root": 1
    },
    "byDomain": {
      "assets": 3
    },
    "byKind": {
      "items": 1,
      "models": 1,
      "textures": 1
    },
    "byNamespace": {
      "demo": 3
    },
    "skippedCount": 0,
    "truncated": false
  }
}
```

## Notes

This does not infer missing paths. It only matches resource locations derived
from entries that already exist in the loose resource roots.
