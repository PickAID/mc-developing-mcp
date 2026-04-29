# Assets-Only Resource Route Verification
Date: 2026-04-30
Author: m1hono
Scope: `@mcpskill/workspace-detector`, `@mcpskill/agent-harness`, `apps/mcp-server`

## Result
- Workspace detection now treats root-level or resource-root `assets/**` as datapack/resource evidence even without `pack.mcmeta` or `data/**`.
- Harness intent detection now treats explicit `data/...` and `assets/...` paths as datapack/resource lookup requests.
- The MCP evidence chain can route an assets-only resource folder into `datapack_files` and return `resourceReferenceTrace`.
- The public MCP surface remains unchanged; this only improves routing behind `mc_develop`.

## RED Output
Command:

```bash
pnpm exec vitest run packages/workspace-detector/src/detect.test.ts packages/agent-harness/src/intent.test.ts apps/mcp-server/src/source-bundle-datapack-executor.test.ts
```

Output:

```text
❯ packages/agent-harness/src/intent.test.ts (6 tests | 1 failed) 6ms
  × detectHarnessTaskIntent > detects resource asset lookup requests from assets paths 4ms
    → expected { id: 'workspace_default', …(2) } to deeply equal { id: 'datapack_lookup', …(2) }

❯ packages/workspace-detector/src/detect.test.ts (11 tests | 1 failed) 32ms
  × detectWorkspace > detects assets-only resource pack roots without pack.mcmeta 8ms
    → expected false to be true

❯ apps/mcp-server/src/source-bundle-datapack-executor.test.ts (4 tests | 1 failed) 28ms
  × source.bundle datapack execution > routes assets-only resource roots to reference tracing without pack metadata 5ms
    → datapack_files candidate missing
```

## GREEN Output
Command:

```bash
pnpm typecheck && pnpm exec vitest run packages/workspace-detector/src/detect.test.ts packages/agent-harness/src/intent.test.ts apps/mcp-server/src/source-bundle-datapack-executor.test.ts
```

Output:

```text
✓ packages/agent-harness/src/intent.test.ts (6 tests) 3ms
✓ packages/workspace-detector/src/detect.test.ts (11 tests) 33ms
✓ apps/mcp-server/src/source-bundle-datapack-executor.test.ts (4 tests) 23ms

Test Files  3 passed (3)
     Tests  21 passed (21)
```

Command:

```bash
pnpm test
```

Output:

```text
Test Files  97 passed (97)
     Tests  303 passed (303)
```

## Real MCP Return Value
Sample action:

```text
Created a temp workspace containing only:
- assets/demo/blockstates/gear.json
- assets/demo/models/block/gear.json
- assets/demo/textures/block/gear.png

No pack.mcmeta.
No data directory.

Called source.bundle datapack executor with:
"Trace references for assets/demo/blockstates/gear.json."
```

Actual selected return fields:

```json
{
  "descriptor": {
    "kind": "unknown",
    "hasDatapack": true,
    "datapackRootCount": 1,
    "reasons": [
      "detected datapack or resource-pack content"
    ]
  },
  "routeSteps": [
    "datapack_files",
    "docs_lookup"
  ],
  "candidate": {
    "routeStep": "datapack_files",
    "preferredTool": "source.bundle",
    "provenance": "datapack_files"
  },
  "matched": true,
  "summary": "Resolved 1 local datapack evidence item(s).",
  "resourceSummary": {
    "tokenPolicy": "counts_only",
    "rootCount": 1,
    "entryCount": 3,
    "byDomain": {
      "assets": 3
    },
    "byKind": {
      "blockstates": 1,
      "models": 1,
      "textures": 1
    },
    "byNamespace": {
      "demo": 3
    },
    "skippedCount": 0,
    "truncated": false
  },
  "resourceReferenceTrace": {
    "tokenPolicy": "explicit_trace",
    "startPaths": [
      "assets/demo/blockstates/gear.json"
    ],
    "referenceCount": 2,
    "unresolvedCount": 0,
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
      }
    ],
    "unresolved": [],
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

## Notes
- The descriptor still reports `kind: "unknown"` for a pure resource folder because `WorkspaceKind` currently has no `resource-pack` value. Routing is still correct because the harness uses `hasDatapack` and `datapackRootCount` facts.
- A later schema migration can add a distinct resource-pack workspace kind if UI/UX needs clearer labeling.
