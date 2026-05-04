# External Mod Gradle Dependency Archive Verification

Date: 2026-05-05
Author: m1hono

## Scope

This slice records and guards the existing behavior where external mod
resolution uses declared Gradle dependency cache binary JARs as local evidence
before remote Modrinth or CurseForge lookup.

Implemented behavior covered by tests:

- a Gradle dependency declared in `build.gradle` can resolve to a binary JAR in a
  supplied Gradle user home cache;
- the binary JAR metadata is inspected locally;
- remote Modrinth/CurseForge resolvers are not called when local Gradle cache
  evidence is sufficient;
- the result exposes `remoteLookupSkipped: true` and metadata-only local
  candidate details.

## Focused Verification

```text
$ pnpm exec vitest run apps/mcp-server/src/external-mod-resolution-gradle-dependency-archives.test.ts apps/mcp-server/src/external-mod-resolution-local-archives.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts

RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

✓ apps/mcp-server/src/external-mod-resolution-executor.test.ts (7 tests) 6ms
✓ apps/mcp-server/src/external-mod-resolution-gradle-dependency-archives.test.ts (1 test) 8ms
✓ apps/mcp-server/src/external-mod-resolution-local-archives.test.ts (6 tests) 20ms

Test Files  3 passed (3)
Tests       14 passed (14)
Duration    442ms
```

## Tested Returned Shape

The regression fixture asserts this compact result shape:

```json
{
  "source": "external_mod_resolution",
  "result": {
    "source": "gradle_dependency_archive",
    "query": "local energy",
    "remoteLookupSkipped": true,
    "scannedDependencies": 1,
    "scannedArchives": 1,
    "candidates": [
      {
        "source": "gradle_dependency_archive",
        "coordinate": "com.example.mods:local-energy:1.2.3",
        "modId": "local_energy",
        "title": "Local Energy",
        "loader": "fabric",
        "metadataPath": "fabric.mod.json",
        "fileName": "local-energy-1.2.3.jar",
        "archiveSource": "gradle-cache",
        "requiresConfirmation": false,
        "cachePolicy": "metadata_only"
      }
    ],
    "warnings": []
  }
}
```

## Notes

This is a regression-coverage slice. The implementation path already existed;
the new test prevents accidental fallback to remote APIs when local Gradle cache
evidence can answer the request.
