# Mod Archive Resource Reference Trace Verification
Date: 2026-04-30
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`

## Result
- Added explicit resource reference tracing inside selected mod JARs.
- Supports blockstate JSON to model JSON and model JSON to texture PNG paths.
- Missing model/texture targets are returned as compact unresolved references.
- Binary textures are only checked by indexed path existence; raw bytes are not read into MCP payloads.
- MCP returns `mode: "resource_reference_trace"` only for explicit trace/reference requests that name traceable `assets/**` paths.
- No new public MCP tool was added.

## RED Output
Command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-resource-references.test.ts apps/mcp-server/src/mod-archive-resource-references.test.ts
```

Output:

```text
FAIL packages/jar-source-adapter/src/mod-archive-resource-references.test.ts
Error: Cannot find module './mod-archive-resource-references.js'
```

```text
FAIL apps/mcp-server/src/mod-archive-resource-references.test.ts
  × mod archive resource reference tracing > returns compact explicit trace payloads for selected mod archive assets 15ms
    → expected { matched: true, …(2) } to match object { matched: true, payload: { …(3) } }

- Expected
+ Received

  {
    "matched": true,
    "payload": {
-     "mode": "resource_reference_trace",
-     "resourceReferenceTrace": {
-       "referenceCount": 2,
-       "tokenPolicy": "explicit_trace",
-       "unresolvedCount": 0,
-     },
+     "mode": "read",
      "source": "mod_archive_content",
    },
  }
```

## GREEN Output
Command:

```bash
pnpm typecheck && pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-resource-references.test.ts apps/mcp-server/src/mod-archive-resource-references.test.ts
```

Output:

```text
✓ packages/jar-source-adapter/src/mod-archive-resource-references.test.ts (1 test) 8ms
✓ apps/mcp-server/src/mod-archive-resource-references.test.ts (1 test) 11ms

Test Files  2 passed (2)
     Tests  2 passed (2)
```

Command:

```bash
pnpm test
```

Output:

```text
Test Files  99 passed (99)
     Tests  307 passed (307)
```

## Real MCP Return Value
Sample action:

```text
Created a temp workspace with mods/content-mod.jar containing:
- fabric.mod.json
- assets/demo/blockstates/gear.json
- assets/demo/models/block/gear.json
- assets/demo/textures/block/gear.png

Called mod archive content executor with:
"Trace references for assets/demo/blockstates/gear.json in mods/content-mod.jar."
```

Actual selected return fields:

```json
{
  "matched": true,
  "summary": "Traced 3 mod archive resource reference(s).",
  "mode": "resource_reference_trace",
  "archiveMetadata": {
    "loader": "fabric",
    "modId": "content_mod",
    "name": "Content Mod",
    "version": "1.0.0",
    "metadataPath": "fabric.mod.json"
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
293 packages/jar-source-adapter/src/mod-archive-resource-references.ts
136 packages/jar-source-adapter/src/mod-archive-resource-references.test.ts
 98 apps/mcp-server/src/mod-archive-resource-references.ts
162 apps/mcp-server/src/mod-archive-resource-references.test.ts
473 apps/mcp-server/src/mod-archive-content-executor.ts
496 apps/mcp-server/src/mod-archive-content-executor.test.ts
```
