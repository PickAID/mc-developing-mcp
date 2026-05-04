# Loader Dependency Requester Owner Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice lets local archive resolution attach the local requesting mod owner
when a crash log reports a loader dependency failure.

Example crash context:

```text
Crash log loader dependency: modId=fabric-api; requestedBy=demo_addon; expected=0.92.2 or later; actual=0.91.0; kind=incompatible_dependency
```

When the workspace contains both `mods/demo-addon.jar` and
`mods/fabric-api.jar`, the `fabric-api` candidate now includes
`loaderDependencyRequester` with the local requester archive metadata.

The MCP public tool surface is unchanged.

## Red
Initial focused red from the first TDD pass:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-local-archives.test.ts
```

Observed failure before implementation:

```text
expected fabric-api local archive candidate to include loaderDependencyRequester
received candidate without loaderDependencyRequester
```

Code review found a misattachment risk: path-only matches could receive the
requester even when `metadata.modId` did not match the crash dependency id. A
negative test was added and failed before the guard fix:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-local-archives.test.ts
```

Observed failure:

```text
× executeMcpServerExternalModResolution local archives > does not attach the requester to path-only crash dependency matches
  → expected { source: 'local_archive', ...(18) } to not have property "loaderDependencyRequester"

Received:
{
  "modId": "demo_addon",
  "title": "Demo Addon",
  "versionNumber": "1.4.0",
  "relativePath": "mods/demo-addon.jar",
  "metadataPath": "fabric.mod.json"
}
```

## Green
Focused green:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-local-archives.test.ts
```

Result:

```text
✓ apps/mcp-server/src/external-mod-resolution-local-archives.test.ts (6 tests) 19ms

Test Files  1 passed (1)
Tests  6 passed (6)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  132 passed (132)
Tests  422 passed (422)
```

Repository guards:

```bash
git diff --check
find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './.git' -prune -o -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Result: all three guard commands produced no output.

## Actual Return Value
Command:

```bash
pnpm tsx <<'TS'
// creates a temporary workspace with:
// - mods/demo-addon.jar containing fabric.mod.json id demo_addon
// - mods/fabric-api.jar containing fabric.mod.json id fabric-api
// then executes executeMcpServerExternalModResolution against crash dependency context
TS
```

Returned value:

```json
{
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
          "source": "local_archive",
          "confidence": "high",
          "confidenceReasons": [
            "matched local mod id fabric-api",
            "matched local mod name Fabric API",
            "loader fabric matched requested loader",
            "local metadata does not declare Minecraft version 1.20.1",
            "crash dependency requested by demo_addon expected 0.92.2 or later but log reported 0.91.0",
            "crash dependency requester demo_addon 1.4.0 from mods/demo-addon.jar"
          ],
          "modId": "fabric-api",
          "slug": "fabric-api",
          "title": "Fabric API",
          "versionId": "0.91.0",
          "versionNumber": "0.91.0",
          "loaders": ["fabric"],
          "minecraftVersions": [],
          "fileName": "fabric-api.jar",
          "archivePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-review-requester-8UIEee/mods/fabric-api.jar",
          "relativePath": "mods/fabric-api.jar",
          "archiveSource": "mods-directory",
          "metadataPath": "fabric.mod.json",
          "loaderDependencyRequester": {
            "modId": "demo_addon",
            "title": "Demo Addon",
            "versionNumber": "1.4.0",
            "loader": "fabric",
            "fileName": "demo-addon.jar",
            "archivePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-review-requester-8UIEee/mods/demo-addon.jar",
            "relativePath": "mods/demo-addon.jar",
            "archiveSource": "mods-directory",
            "metadataPath": "fabric.mod.json"
          },
          "requiresConfirmation": false,
          "cachePolicy": "metadata_only"
        }
      ],
      "warnings": [],
      "scannedArchives": 2,
      "truncated": false,
      "remoteLookupSkipped": true
    }
  }
}
```

## Line Counts
Current relevant line counts:

```text
424 apps/mcp-server/src/external-mod-local-archives.ts
108 apps/mcp-server/src/external-mod-local-archive-requester.ts
437 apps/mcp-server/src/external-mod-resolution-local-archives.test.ts
```

## Notes
- Requester owner metadata is collected from both root archive metadata and
  nested JarJar metadata.
- `loaderDependencyRequester` is attached only when the candidate metadata mod
  id matches the crash dependency mod id. Path-only local matches keep the
  local candidate but do not receive dependency requester ownership.
- Ordinary local archive queries avoid the requester owner allocation path when
  no crash dependency requester exists.
