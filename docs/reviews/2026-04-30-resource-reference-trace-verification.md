# Resource Reference Trace Verification
Date: 2026-04-30
Author: m1hono
Scope: `@mcpskill/datapack-adapter`, `apps/mcp-server`

## Result
- Added loose `assets/**` reference tracing for blockstate JSON to model JSON.
- Added model JSON tracing for parent models and texture resource locations.
- Missing texture/model targets are reported as compact unresolved references.
- Binary texture files are never read into payload content; they are only checked as indexed entries.
- MCP returns `resourceReferenceTrace` only for explicit trace/reference requests that name traceable `assets/**` paths.
- `resourceSummary` remains counts-only and does not include path lists or reference lists.
- No new public MCP tool was added.

## RED Output
Command:

```bash
pnpm exec vitest run packages/datapack-adapter/src/index.test.ts
```

Output:

```text
❯ packages/datapack-adapter/src/index.test.ts (9 tests | 1 failed) 51ms
  × datapack-adapter > traces blockstate model and model texture references without reading binary content 4ms
    → traceReferences is not a function
```

Command:

```bash
pnpm exec vitest run apps/mcp-server/src/source-bundle-datapack-executor.test.ts
```

Output:

```text
❯ apps/mcp-server/src/source-bundle-datapack-executor.test.ts (3 tests | 1 failed) 23ms
  × source.bundle datapack execution > traces explicit resource asset references without adding paths to the summary 7ms
    → expected { matched: true, …(2) } to match object { matched: true, payload: { …(3) } }

- Expected
+ Received

  {
    "matched": true,
    "payload": {
-     "resourceReferenceTrace": {
-       "referenceCount": 2,
-       "tokenPolicy": "explicit_trace",
-       "unresolvedCount": 0,
-     },
      "resourceSummary": {
        "tokenPolicy": "counts_only",
      },
      "source": "datapack_files",
    },
  }
```

## GREEN Output
Command:

```bash
pnpm exec vitest run packages/datapack-adapter/src/index.test.ts apps/mcp-server/src/source-bundle-datapack-executor.test.ts
```

Output:

```text
✓ packages/datapack-adapter/src/index.test.ts (9 tests) 40ms
✓ apps/mcp-server/src/source-bundle-datapack-executor.test.ts (3 tests) 21ms

Test Files  2 passed (2)
     Tests  12 passed (12)
```

Command:

```bash
pnpm test
```

Output:

```text
Test Files  97 passed (97)
     Tests  300 passed (300)
```

## Real MCP Return Value
Sample action:

```text
Created a temp workspace containing:
- pack.mcmeta
- assets/demo/blockstates/gear.json
- assets/demo/models/block/gear.json
- assets/demo/textures/block/gear.png

Called source.bundle datapack executor with:
"Trace local datapack resource references for assets/demo/blockstates/gear.json."
```

Actual selected return fields:

```json
{
  "matched": true,
  "summary": "Resolved 1 local datapack evidence item(s).",
  "resourceSummary": {
    "tokenPolicy": "counts_only",
    "rootCount": 1,
    "entryCount": 4,
    "byDomain": {
      "assets": 4
    },
    "byKind": {
      "blockstates": 1,
      "models": 1,
      "textures": 1,
      "pack_metadata": 1
    },
    "byNamespace": {
      "demo": 3,
      "": 1
    },
    "skippedCount": 0,
    "truncated": false
  },
  "resourceReferenceTrace": {
    "tokenPolicy": "explicit_trace",
    "startPaths": [
      "assets/demo/blockstates/gear.json"
    ],
    "referenceCount": 3,
    "unresolvedCount": 1,
    "references": [
      {
        "fromPath": "assets/demo/blockstates/gear.json",
        "fromKind": "blockstates",
        "relation": "blockstate_model",
        "value": "demo:block/gear",
        "toPath": "assets/demo/models/block/gear.json",
        "toKind": "models",
        "status": "resolved"
      },
      {
        "fromPath": "assets/demo/models/block/gear.json",
        "fromKind": "models",
        "relation": "model_texture",
        "value": "demo:block/gear",
        "toPath": "assets/demo/textures/block/gear.png",
        "toKind": "textures",
        "status": "resolved"
      },
      {
        "fromPath": "assets/demo/models/block/gear.json",
        "fromKind": "models",
        "relation": "model_texture",
        "value": "demo:block/missing",
        "toPath": "assets/demo/textures/block/missing.png",
        "toKind": "textures",
        "status": "missing"
      }
    ],
    "unresolved": [
      {
        "fromPath": "assets/demo/models/block/gear.json",
        "fromKind": "models",
        "relation": "model_texture",
        "value": "demo:block/missing",
        "toPath": "assets/demo/textures/block/missing.png",
        "toKind": "textures",
        "status": "missing"
      }
    ],
    "skippedCount": 0,
    "truncated": false
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
275 packages/datapack-adapter/src/resource-references.ts
366 packages/datapack-adapter/src/files.ts
361 packages/datapack-adapter/src/index.test.ts
295 apps/mcp-server/src/source-bundle-datapack.ts
242 apps/mcp-server/src/source-bundle-datapack-executor.test.ts
```

## Residual Gap
- Assets-only workspaces without `pack.mcmeta` may still fail to enter the datapack/resource route in the higher-level harness. The trace implementation itself supports loose `assets/**`, but route detection should be hardened in a later slice so resource-pack-only folders are not treated as generic workspaces.
