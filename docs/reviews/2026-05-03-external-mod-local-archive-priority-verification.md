# External Mod Local Archive Priority Verification

Date: 2026-05-03

## Scope

This slice adds MCP-side local mod archive evidence before remote external mod
lookup. When a workspace `mods/*.jar`, `run/mods/*.jar`,
`run/client/mods/*.jar`, `libs/*.jar`, or `build/libs/*.jar` contains matching
mod metadata, `external_mod_resolution` returns `local_archive` evidence and
does not call Modrinth or CurseForge resolvers. Explicit Maven coordinate
requests still route to the Maven resolver.

## TDD Red

Command:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-local-archives.test.ts
```

Observed failure before implementation:

```text
× executeMcpServerExternalModResolution local archives > uses matching workspace mod jars before remote project resolvers
  → local archive lookup must not search CurseForge
```

This confirmed the missing behavior: the executor went directly to the
CurseForge resolver instead of checking workspace mod jars first.

## Green And Full Verification

Focused verification:

```text
✓ apps/mcp-server/src/external-mod-resolution-executor.test.ts (6 tests)
✓ apps/mcp-server/src/external-mod-resolution-local-archives.test.ts (1 test)
✓ apps/mcp-server/src/request-executor-external-mod.test.ts (4 tests)

Test Files  3 passed (3)
Tests  11 passed (11)
```

Full verification:

```text
pnpm typecheck
passed

pnpm test
Test Files  118 passed (118)
Tests  387 passed (387)

git diff --check
passed with no output

TS/TSX 500-line guard
passed with no output

Go residue guard
passed with no output
```

## Actual Return Value

Scenario: temp workspace with `mods/local-energy.jar` containing
`fabric.mod.json`:

```json
{
  "id": "local_energy",
  "name": "Local Energy",
  "version": "1.0.0"
}
```

Request:

```text
Find the CurseForge mod for Local Energy fabric 1.20.1.
```

Actual executor return:

```json
{
  "matched": true,
  "summary": "Resolved local mod archive: mods/local-energy.jar.",
  "payload": {
    "source": "external_mod_resolution",
    "request": {
      "platform": "curseforge",
      "query": "local energy",
      "loader": "fabric",
      "minecraftVersion": "1.20.1"
    },
    "result": {
      "source": "local_archive",
      "query": "local energy",
      "candidates": [
        {
          "source": "local_archive",
          "confidence": "high",
          "confidenceReasons": [
            "matched local mod id local_energy",
            "matched local mod name Local Energy",
            "loader fabric matched requested loader",
            "local metadata does not declare Minecraft version 1.20.1"
          ],
          "modId": "local_energy",
          "slug": "local_energy",
          "title": "Local Energy",
          "versionId": "1.0.0",
          "versionNumber": "1.0.0",
          "loaders": [
            "fabric"
          ],
          "minecraftVersions": [],
          "fileName": "local-energy.jar",
          "archivePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-local-extmod-preview-zV8xhy/mods/local-energy.jar",
          "relativePath": "mods/local-energy.jar",
          "archiveSource": "mods-directory",
          "metadataPath": "fabric.mod.json",
          "requiresConfirmation": false,
          "cachePolicy": "metadata_only"
        }
      ],
      "warnings": [],
      "scannedArchives": 1,
      "truncated": false,
      "remoteLookupSkipped": true
    }
  }
}
```
