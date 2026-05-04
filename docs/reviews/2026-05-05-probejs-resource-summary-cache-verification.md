# ProbeJS Resource Summary Cache Verification

Date: 2026-05-05
Author: m1hono

## Scope

This slice adds an internal MCP cache for parsed ProbeJS resource summaries used
by `probejs_types`.

Implemented behavior:

- repeated KubeJS/ProbeJS semantic requests can reuse parsed
  snippets/items/registries/classes/resources instead of reading and parsing the
  same ProbeJS files again;
- cache keys include workspace root, semantic query options, resource query
  terms, and discovered ProbeJS resource file fingerprints;
- fingerprints include relative path, source kind, root kind, size, and mtime;
- changing a ProbeJS resource file invalidates the cached resource summary,
  including same-size changes within the same second when mtime differs;
- the public MCP surface remains unchanged.

This cache is intentionally separate from the TypeScript language-service
project cache. The language-service cache answers symbol/quick-info/completion
work; this new cache answers ProbeJS resource inventory extraction.

## Actual Returned Value

Smoke command:

```sh
$ pnpm exec tsx <<'TS'
// Creates a temporary KubeJS workspace with:
// - kubejs/server_scripts/main.js
// - .probe/server/events.d.ts
// - .vscode/item-attributes.json
//
// Then runs createMcpServerProbeJsTypesExecutor three times:
// 1. first request
// 2. repeated same request
// 3. same request after item-attributes.json changes
TS
```

Returned shape:

```json
{
  "first": {
    "matched": true,
    "summary": "Resolved ItemEvents.foodEaten from ProbeJS TypeScript language service.",
    "cacheHit": false,
    "probeResourceCacheHit": false,
    "symbol": "ItemEvents.foodEaten",
    "itemEntries": [
      {
        "sourceKind": "item",
        "extractorId": "vscode-item-attributes-json-v1",
        "sourceFormat": "vscode-item-attributes-json",
        "confidence": 0.9,
        "name": "minecraft:stone",
        "value": "minecraft:stone",
        "file": ".vscode/item-attributes.json",
        "metadata": {
          "label": "Stone"
        }
      }
    ],
    "resourceSummary": {
      "counts": {
        "snippet": 0,
        "item": 1,
        "registry": 0,
        "fluid": 0,
        "tag": 0,
        "language_key": 0,
        "class": 0
      },
      "discoveredFiles": 2,
      "searchedFiles": 1,
      "unknownCount": 0,
      "truncated": false
    }
  },
  "second": {
    "matched": true,
    "summary": "Resolved ItemEvents.foodEaten from ProbeJS TypeScript language service.",
    "cacheHit": true,
    "probeResourceCacheHit": true,
    "symbol": "ItemEvents.foodEaten",
    "itemEntries": [
      {
        "name": "minecraft:stone",
        "value": "minecraft:stone",
        "file": ".vscode/item-attributes.json"
      }
    ]
  },
  "afterChange": {
    "matched": true,
    "summary": "Resolved ItemEvents.foodEaten from ProbeJS TypeScript language service.",
    "cacheHit": true,
    "probeResourceCacheHit": false,
    "symbol": "ItemEvents.foodEaten",
    "itemEntries": [
      {
        "name": "minecraft:stone",
        "value": "minecraft:stone",
        "file": ".vscode/item-attributes.json"
      }
    ]
  },
  "cacheSize": 2
}
```

Interpretation:

- `cacheHit` is the existing TypeScript language project cache.
- `probeResourceCacheHit` is the new parsed ProbeJS resource summary cache.
- After the item attribute file changes, language-service cache remains hot but
  resource summary cache correctly misses and refreshes.

## TDD Record

RED focused failure before implementation:

```text
$ pnpm exec vitest run apps/mcp-server/src/probejs-resource-cache.test.ts

Test Files  1 failed (1)
Tests       no tests

Error: Cannot find module './probejs-resource-summary-cache.js' imported from
apps/mcp-server/src/probejs-resource-cache.test.ts
```

Review follow-up:

```text
Read-only review identified that second-level mtime truncation could reuse stale
cache entries for same-size file rewrites within the same second.

Follow-up fix:
- use full `mtimeMs` in ProbeJS resource file fingerprints;
- update the invalidation test to rewrite `item-attributes.json` with the same
  byte size and same-second different millisecond mtime;
- assert the refreshed result returns label "Slate" with
  `probeResourceCacheHit=false`.
```

GREEN focused verification after implementation:

```text
$ pnpm exec vitest run packages/kubejs-types-adapter/src/discovery.test.ts packages/kubejs-types-adapter/src/summary.test.ts packages/kubejs-types-adapter/src/summary-filter.test.ts apps/mcp-server/src/probejs-types-executor.test.ts apps/mcp-server/src/probejs-resource-cache.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/kubejs-types-adapter/src/summary-filter.test.ts (2 tests) 19ms
✓ packages/kubejs-types-adapter/src/discovery.test.ts (5 tests) 23ms
✓ packages/kubejs-types-adapter/src/summary.test.ts (8 tests) 32ms
✓ apps/mcp-server/src/probejs-resource-cache.test.ts (2 tests) 260ms
✓ apps/mcp-server/src/probejs-types-executor.test.ts (6 tests) 561ms

Test Files  5 passed (5)
Tests       23 passed (23)
Duration    1.07s
```

## Full Verification

Full workspace test:

```text
$ pnpm test

Test Files  136 passed (136)
Tests       435 passed (435)
Duration    3.88s
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
$ wc -l apps/mcp-server/src/probejs-types-executor.ts apps/mcp-server/src/probejs-resource-summary-cache.ts apps/mcp-server/src/probejs-resource-cache.test.ts packages/kubejs-types-adapter/src/discovery.ts packages/kubejs-types-adapter/src/types.ts

422 apps/mcp-server/src/probejs-types-executor.ts
138 apps/mcp-server/src/probejs-resource-summary-cache.ts
153 apps/mcp-server/src/probejs-resource-cache.test.ts
158 packages/kubejs-types-adapter/src/discovery.ts
155 packages/kubejs-types-adapter/src/types.ts
1026 total
```

## Notes

This is a memory cache, not a persistent privacy-sensitive ProbeJS database.
Persistent caches for full modpack item/registry inventories should still live
in the MCP-owned runtime cache layer, not in `mdm-sources` and not in the public
resource package repository.

Residual risk: the cache key requires a lightweight ProbeJS resource discovery
pass before deciding hit/miss. That is still cheaper than re-reading and parsing
the matched JSON/text resources, but a future persistent cache can avoid even
that discovery work by storing directory fingerprints.
