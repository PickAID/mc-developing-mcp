# External Mod Local Incomplete Constraints Verification

Date: 2026-05-03

## Scope

This slice lets MCP local archive evidence run before remote-only constraint
validation. If a workspace mod jar already matches the requested mod name or
id, `external_mod_resolution` returns local evidence even when the request does
not include a mod loader or Minecraft version. Remote Modrinth and CurseForge
resolution still requires the stricter constraints when no local archive
matches.

No public MCP tool was added.

## TDD Red

Command:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-local-archives.test.ts
```

Observed failure before implementation:

```text
× executeMcpServerExternalModResolution local archives > uses local mod metadata even when remote lookup constraints are incomplete
  expected local_archive evidence
  received needs_more_constraints for mod loader and Minecraft version
```

The actual received summary was:

```text
External mod resolution needs mod loader, Minecraft version.
```

## Green And Focused Verification

Commands:

```bash
pnpm typecheck
pnpm vitest run apps/mcp-server/src/external-mod-resolution-local-archives.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts apps/mcp-server/src/request-executor-external-mod.test.ts
```

Result:

```text
pnpm typecheck
passed

Test Files  3 passed (3)
Tests  13 passed (13)
```

Full verification:

```text
pnpm test
Test Files  118 passed (118)
Tests  389 passed (389)

git diff --check
passed with no output

TS/TSX 500-line guard
passed with no output

Go residue guard
passed with no output
```

## Actual Return Value

Scenario: temp workspace with `mods/local-energy.jar` containing:

```json
{
  "id": "local_energy",
  "name": "Local Energy",
  "version": "1.0.0"
}
```

Request:

```text
Find the Modrinth mod for Local Energy.
```

Actual executor return:

```json
{
  "matched": true,
  "summary": "Resolved local mod archive: mods/local-energy.jar.",
  "payload": {
    "source": "external_mod_resolution",
    "request": {
      "platform": "modrinth",
      "query": "local energy"
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
            "local metadata declares loader fabric"
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
          "archivePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-loose-extmod-preview-v11KSo/mods/local-energy.jar",
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
