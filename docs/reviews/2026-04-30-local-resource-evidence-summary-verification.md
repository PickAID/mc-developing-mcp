# Local Resource Evidence Summary Verification
Date: 2026-04-30
Author: m1hono
Scope: `@mcpskill/datapack-adapter`, `apps/mcp-server`

## Result
- Loose `assets/**` resource files now use a broader vanilla-aware asset kind taxonomy.
- `pack.mcmeta` is exposed as `pack_metadata` evidence without changing existing limited-list behavior.
- Local datapack/resource roots now have a compact `summarizeDatapackFiles` API.
- MCP datapack/resource executor now returns counts-only `resourceSummary` metadata.
- No new MCP public tool was added.

## RED Output
Command:

```bash
pnpm exec vitest run packages/datapack-adapter/src/index.test.ts
```

Output:

```text
❯ packages/datapack-adapter/src/index.test.ts (7 tests | 1 failed) 46ms
  × datapack-adapter > classifies vanilla asset format roots with resource-level granularity 17ms
    → expected [ 'blockstates', 'lang', …(3) ] to deeply equal [ 'atlases', 'blockstates', …(13) ]

- Expected
+ Received

  [
-   "atlases",
    "blockstates",
-   "equipment",
-   "font",
-   "items",
    "lang",
    "models",
    "other",
-   "particles",
-   "post_effect",
-   "shaders",
-   "sounds",
-   "texts",
    "textures",
-   "waypoint_style",
  ]
```

Command:

```bash
pnpm exec vitest run packages/datapack-adapter/src/index.test.ts
```

Output:

```text
❯ packages/datapack-adapter/src/index.test.ts (8 tests | 1 failed) 55ms
  × datapack-adapter > summarizes data and resource evidence without path lists 8ms
    → (0 , summarizeDatapackFiles) is not a function
```

Command:

```bash
pnpm exec vitest run apps/mcp-server/src/source-bundle-datapack-executor.test.ts
```

Output:

```text
❯ apps/mcp-server/src/source-bundle-datapack-executor.test.ts (2 tests | 1 failed) 17ms
  × source.bundle datapack execution > includes compact data and asset summaries for local resource roots 11ms
    → expected { matched: true, …(2) } to match object { matched: true, payload: { …(2) } }

- Expected
+ Received

  {
    "matched": true,
    "payload": {
-     "resourceSummary": {
-       "tokenPolicy": "counts_only",
-       "rootCount": 1,
-       "entryCount": 4,
-     },
      "source": "datapack_files",
    },
  }
```

## GREEN Output
Command:

```bash
pnpm typecheck
pnpm exec vitest run packages/datapack-adapter/src/index.test.ts apps/mcp-server/src/source-bundle-datapack-executor.test.ts
```

Output:

```text
> @mcpskill/workspace@ typecheck /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b --pretty false

✓ packages/datapack-adapter/src/index.test.ts (8 tests) 46ms
✓ apps/mcp-server/src/source-bundle-datapack-executor.test.ts (2 tests) 17ms

Test Files  2 passed (2)
     Tests  10 passed (10)
```

## Real MCP Sample
Sample action:

```text
Created a temp workspace containing:
- pack.mcmeta
- data/demo/recipes/gear.json
- assets/demo/items/gear.json
- assets/demo/models/item/gear.json

Called executeMcpServerRequest with:
"List local datapack and resource asset evidence."
```

Actual selected evidence payload:

```json
{
  "tokenPolicy": "counts_only",
  "rootCount": 1,
  "entryCount": 4,
  "byDomain": {
    "assets": 3,
    "data": 1
  },
  "byKind": {
    "items": 1,
    "models": 1,
    "recipes": 1,
    "pack_metadata": 1
  },
  "byNamespace": {
    "demo": 3,
    "": 1
  },
  "skippedCount": 0,
  "truncated": false
}
```

## Line Guard
Command:

```bash
wc -l packages/datapack-adapter/src/index.test.ts packages/datapack-adapter/src/files.ts packages/datapack-adapter/src/kinds.ts packages/datapack-adapter/src/types.ts apps/mcp-server/src/source-bundle-datapack.ts apps/mcp-server/src/source-bundle-datapack-executor.test.ts
```

Output:

```text
294 packages/datapack-adapter/src/index.test.ts
366 packages/datapack-adapter/src/files.ts
 54 packages/datapack-adapter/src/kinds.ts
104 packages/datapack-adapter/src/types.ts
223 apps/mcp-server/src/source-bundle-datapack.ts
160 apps/mcp-server/src/source-bundle-datapack-executor.test.ts
```
