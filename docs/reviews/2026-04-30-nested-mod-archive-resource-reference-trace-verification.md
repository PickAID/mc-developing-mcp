# Nested Mod Archive Resource Reference Trace Verification
Date: 2026-04-30
Author: m1hono
Scope: `@mcpskill/jar-source-adapter`, `apps/mcp-server`

## Result
- Added explicit resource reference tracing inside nested JarJar archives.
- Supports `outer.jar` plus `META-INF/jarjar/nested.jar!/assets/...` requests without extracting archives to disk.
- Reuses the compact blockstate -> model -> texture trace logic from top-level mod archives.
- Missing model/texture targets are returned as compact unresolved references.
- Binary textures are only checked by indexed path existence; raw bytes are not read into MCP payloads.
- MCP returns `mode: "resource_reference_trace_nested"` only for explicit trace/reference requests that name traceable nested `assets/**` paths.
- No new public MCP tool was added.

## RED Output
Adapter RED command:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-resource-references.test.ts
```

Initial failure:

```text
TypeError: traceNestedModArchiveResourceReferences is not a function
```

MCP RED command:

```bash
pnpm exec vitest run apps/mcp-server/src/mod-archive-resource-references.test.ts
```

Initial failure:

```text
expected { matched: true, ... } to match object { matched: true, payload: { ... } }

- Expected
+ Received

  {
    "matched": true,
    "payload": {
-     "mode": "resource_reference_trace_nested",
-     "resourceReferenceTrace": {
-       "referenceCount": 2,
-       "tokenPolicy": "explicit_trace",
-       "unresolvedCount": 0,
-     },
+     "mode": "read_nested",
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
✓ packages/jar-source-adapter/src/mod-archive-resource-references.test.ts (2 tests)
✓ apps/mcp-server/src/mod-archive-resource-references.test.ts (2 tests)

Test Files  2 passed (2)
     Tests  4 passed (4)
```

Command:

```bash
pnpm test
```

Output:

```text
Test Files  99 passed (99)
     Tests  309 passed (309)
```

## Real MCP Return Value
Sample action:

```text
Created a temp workspace with mods/outer-mod.jar containing:
- fabric.mod.json
- META-INF/jarjar/nested-content.jar

Created nested-content.jar containing:
- fabric.mod.json
- assets/demo/blockstates/gear.json
- assets/demo/models/block/gear.json
- assets/demo/textures/block/gear.png

Called mod archive content executor with:
"Trace references for META-INF/jarjar/nested-content.jar!/assets/demo/blockstates/gear.json from mods/outer-mod.jar."
```

Actual selected return fields:

```json
{
  "matched": true,
  "summary": "Traced 3 nested mod archive resource reference(s).",
  "mode": "resource_reference_trace_nested",
  "embeddedArchivePath": "META-INF/jarjar/nested-content.jar",
  "archiveMetadata": {
    "loader": "fabric",
    "modId": "outer_mod",
    "name": "Outer Mod",
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
370 packages/jar-source-adapter/src/mod-archive-resource-references.ts
201 packages/jar-source-adapter/src/mod-archive-resource-references.test.ts
165 apps/mcp-server/src/mod-archive-resource-references.ts
235 apps/mcp-server/src/mod-archive-resource-references.test.ts
485 apps/mcp-server/src/mod-archive-content-executor.ts
496 apps/mcp-server/src/mod-archive-content-executor.test.ts
```
