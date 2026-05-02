# External Mod Local JarJar Priority Verification

Date: 2026-05-03

## Scope

This slice extends MCP-side local external mod evidence from top-level
workspace mod jars to one-level JarJar nested jars. A request for an external
mod now checks nested mod metadata inside discovered workspace archives before
calling Modrinth or CurseForge.

The implementation stays inside the existing `external_mod_resolution` evidence
route and does not add public MCP tools. Each outer archive is read once; the
same buffer is used for top-level metadata and nested metadata inspection.

## TDD Red

Command:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-local-archives.test.ts
```

Observed failure before implementation:

```text
× executeMcpServerExternalModResolution local archives > uses matching JarJar nested mod metadata before remote project resolvers
  → nested local archive lookup must not search Modrinth
```

This confirmed that the executor still reached the remote Modrinth resolver
when only nested JarJar metadata matched the request.

## Green And Focused Verification

Command:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-local-archives.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts apps/mcp-server/src/request-executor-external-mod.test.ts
```

Result:

```text
✓ apps/mcp-server/src/external-mod-resolution-executor.test.ts (6 tests)
✓ apps/mcp-server/src/external-mod-resolution-local-archives.test.ts (2 tests)
✓ apps/mcp-server/src/request-executor-external-mod.test.ts (4 tests)

Test Files  3 passed (3)
Tests  12 passed (12)
```

Type check:

```text
pnpm typecheck
passed
```

Full verification:

```text
pnpm test
Test Files  118 passed (118)
Tests  388 passed (388)

git diff --check
passed with no output

TS/TSX 500-line guard
passed with no output

Go residue guard
passed with no output
```

## Actual Return Value

Scenario: temp workspace with `mods/outer-mod.jar` containing
`META-INF/jarjar/nested-energy.jar`. The nested jar contains:

```json
{
  "id": "nested_energy",
  "name": "Nested Energy",
  "version": "2.0.0"
}
```

Request:

```text
Find the Modrinth mod for Nested Energy fabric 1.20.1.
```

Actual executor return:

```json
{
  "matched": true,
  "summary": "Resolved local mod archive: mods/outer-mod.jar!META-INF/jarjar/nested-energy.jar.",
  "payload": {
    "source": "external_mod_resolution",
    "request": {
      "platform": "modrinth",
      "query": "nested energy",
      "loader": "fabric",
      "minecraftVersion": "1.20.1"
    },
    "result": {
      "source": "local_archive",
      "query": "nested energy",
      "candidates": [
        {
          "source": "local_archive",
          "confidence": "high",
          "confidenceReasons": [
            "matched local mod id nested_energy",
            "matched local mod name Nested Energy",
            "loader fabric matched requested loader",
            "local metadata does not declare Minecraft version 1.20.1"
          ],
          "modId": "nested_energy",
          "slug": "nested_energy",
          "title": "Nested Energy",
          "versionId": "2.0.0",
          "versionNumber": "2.0.0",
          "loaders": [
            "fabric"
          ],
          "minecraftVersions": [],
          "fileName": "nested-energy.jar",
          "archivePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-nested-extmod-preview-yP7MiG/mods/outer-mod.jar",
          "relativePath": "mods/outer-mod.jar",
          "embeddedArchivePath": "META-INF/jarjar/nested-energy.jar",
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
