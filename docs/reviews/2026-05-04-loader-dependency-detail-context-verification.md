# Loader Dependency Detail Context Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice preserves full crash loader dependency details through the internal
evidence chain.

The previous slice carried only dependency mod ids such as `fabric-api`. This
slice also carries:

- requesting mod id
- expected dependency range
- actual version from the crash log
- dependency kind

The MCP public tool surface is unchanged.

## Red
Focused red command:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-request.test.ts apps/mcp-server/src/request-executor-loader-dependency-crash.test.ts apps/mcp-server/src/external-mod-resolution-local-archives.test.ts
```

Observed failures before implementation:

```text
Test Files  3 failed (3)
Tests  3 failed | 12 passed (15)
```

Key failed values:

```text
expected loaderDependency to include modId/requestedBy/expectedRange/actualVersion/kind
received no loaderDependency and a noisy natural-language query

expected requestPlan.requestText to contain Crash log loader dependency: ...
received only Crash log loader mod ids: fabric-api

expected local archive lookup to resolve fabric-api locally
received remote Modrinth resolver call
```

## Green
Focused green:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-request.test.ts apps/mcp-server/src/request-executor-loader-dependency-crash.test.ts apps/mcp-server/src/external-mod-resolution-local-archives.test.ts
```

Result:

```text
✓ apps/mcp-server/src/external-mod-resolution-request.test.ts (10 tests) 4ms
✓ apps/mcp-server/src/external-mod-resolution-local-archives.test.ts (4 tests) 10ms
✓ apps/mcp-server/src/request-executor-loader-dependency-crash.test.ts (1 test) 6ms

Test Files  3 passed (3)
Tests  15 passed (15)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  132 passed (132)
Tests  420 passed (420)
```

Repository guards:

```bash
git diff --check
find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './.git' -prune -o -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Result: no output from all three guard commands.

## Actual Return Value
Command:

```bash
pnpm tsx <<'TS'
// creates a temporary workspace with mods/fabric-api.jar and executes
// executeMcpServerExternalModResolution against crash dependency context
TS
```

Return value:

```json
{
  "parsed": {
    "platform": "modrinth",
    "query": "fabric-api",
    "loader": "fabric",
    "minecraftVersion": "1.20.1",
    "loaderDependency": {
      "modId": "fabric-api",
      "requestedBy": "demo_addon",
      "expectedRange": "0.92.2 or later",
      "actualVersion": "0.91.0",
      "kind": "incompatible_dependency"
    }
  },
  "result": {
    "matched": true,
    "summary": "Resolved local mod archive: mods/fabric-api.jar.",
    "payload": {
      "source": "external_mod_resolution",
      "request": {
        "platform": "modrinth",
        "query": "fabric-api",
        "loader": "fabric",
        "minecraftVersion": "1.20.1",
        "loaderDependency": {
          "modId": "fabric-api",
          "requestedBy": "demo_addon",
          "expectedRange": "0.92.2 or later",
          "actualVersion": "0.91.0",
          "kind": "incompatible_dependency"
        }
      },
      "result": {
        "source": "local_archive",
        "query": "fabric-api",
        "candidates": [
          {
            "confidence": "high",
            "confidenceReasons": [
              "matched local mod id fabric-api",
              "matched local mod name Fabric API",
              "loader fabric matched requested loader",
              "local metadata does not declare Minecraft version 1.20.1",
              "crash dependency requested by demo_addon expected 0.92.2 or later but log reported 0.91.0"
            ],
            "modId": "fabric-api",
            "versionNumber": "0.91.0",
            "relativePath": "mods/fabric-api.jar",
            "metadataPath": "fabric.mod.json"
          }
        ],
        "remoteLookupSkipped": true
      }
    }
  }
}
```

## Line Counts
Current relevant line counts:

```text
446 apps/mcp-server/src/external-mod-resolution-request.ts
74 apps/mcp-server/src/external-mod-loader-dependency.ts
408 apps/mcp-server/src/request-execution-context.ts
349 apps/mcp-server/src/external-mod-local-archives.ts
312 apps/mcp-server/src/external-mod-resolution-local-archives.test.ts
```

## Notes
- `external-mod-resolution-request.ts` briefly exceeded 500 lines during the
  green pass and was split before completion.
- This still does not parse every mod descriptor dependency field. That is a
  separate larger slice because Fabric/Quilt/Forge/NeoForge metadata schemas
  differ.
