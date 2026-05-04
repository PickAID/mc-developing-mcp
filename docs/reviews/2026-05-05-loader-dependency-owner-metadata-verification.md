# Loader Dependency Owner Metadata Verification

Date: 2026-05-05
Author: m1hono

## Scope

This slice lets crash-triage context identify the local mod archive metadata
owner for a loader dependency requester before continuing to external mod
resolution.

Implemented behavior:

- `jar-source-adapter` can locate archive metadata owners by mod id;
- `mod_archive_content` recognizes crash loader dependency context and returns a
  compact `loader_dependency_owner` payload;
- the owner payload includes archive path, relative path, mod id, name, loader,
  metadata path, and version;
- the step remains `skipped` so the request can continue to
  `external_mod_resolution` for the missing dependency itself.

## Focused Verification

```text
$ pnpm exec vitest run apps/mcp-server/src/request-executor-loader-dependency-crash.test.ts packages/jar-source-adapter/src/mod-archive-inventory.test.ts apps/mcp-server/src/mod-archive-content-executor.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ packages/jar-source-adapter/src/mod-archive-inventory.test.ts (4 tests) 13ms
✓ apps/mcp-server/src/mod-archive-content-executor.test.ts (9 tests) 29ms
✓ apps/mcp-server/src/request-executor-loader-dependency-crash.test.ts (1 test) 11ms

Test Files  3 passed (3)
Tests       14 passed (14)
Duration    679ms
```

## Actual Returned Value

Smoke command:

```sh
$ pnpm exec tsx <<'TS'
# Creates a temp modpack workspace with:
# - logs/latest.log containing a Fabric missing dependency for fabric-api
# - mods/demo-addon.jar containing fabric.mod.json id demo_addon version 1.2.3
#
# Then runs:
# "The server crashes on startup; inspect latest.log and mods."
TS
```

Returned value:

```json
{
  "selectedCandidateId": "candidate-3-external_mod_resolution",
  "ownerStatus": "skipped",
  "ownerSummary": "Located loader dependency requester demo_addon in mod archive metadata.",
  "ownerPayload": {
    "source": "mod_archive_content",
    "mode": "loader_dependency_owner",
    "missingDependencyModId": "fabric-api",
    "requestedBy": "demo_addon",
    "kind": "missing_dependency",
    "expectedRange": "any version",
    "actualVersion": "missing",
    "owner": {
      "archivePath": "/var/folders/mm/1pl_y6790cs3fzcv79smjqb00000gn/T/mcpskill-loader-owner-zgiFDl/mods/demo-addon.jar",
      "archiveRelativePath": "mods/demo-addon.jar",
      "modId": "demo_addon",
      "version": "1.2.3",
      "name": "Demo Addon",
      "loader": "fabric",
      "metadataPath": "fabric.mod.json"
    },
    "requestedModIds": [
      "demo_addon"
    ],
    "searchedArchives": 1,
    "truncated": false
  }
}
```

## Notes

The owner evidence is intentionally contextual. It identifies the local mod that
requested a missing dependency, while the missing dependency itself continues to
the external resolver.
