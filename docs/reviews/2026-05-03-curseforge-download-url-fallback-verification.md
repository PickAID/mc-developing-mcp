# CurseForge Download URL Fallback Verification
Date: 2026-05-03
Author: m1hono

## Scope
This pass verifies that CurseForge file resolution can recover when the selected file entry omits `downloadUrl`. The resolver should call the official `GET /v1/mods/{modId}/files/{fileId}/download-url` endpoint, keep the candidate compact, and still emit CurseMaven dispatch metadata.

Official reference: <https://docs.curseforge.com/rest-api/>

## TDD Red
Command:

```bash
pnpm exec vitest run packages/external-mod-resolver/src/curseforge.test.ts
```

Observed failure before implementation:

```text
FAIL  packages/external-mod-resolver/src/curseforge.test.ts > resolveCurseForgeMod > fetches a CurseForge file download URL when the selected file omits it
AssertionError: expected [ ...(2) ] to have a length of 3 but got 2
```

This confirmed the resolver only searched the project and listed files. It did not call the download-url endpoint.

## Local Green
Commands:

```bash
pnpm exec tsc -b packages/external-mod-resolver --pretty false
pnpm exec vitest run packages/external-mod-resolver/src/curseforge.test.ts packages/external-mod-resolver/src/modrinth.test.ts packages/external-mod-resolver/src/maven-repository.test.ts packages/external-mod-resolver/src/metadata-cache.test.ts
```

Observed result:

```text
✓ packages/external-mod-resolver/src/metadata-cache.test.ts (1 test)
✓ packages/external-mod-resolver/src/modrinth.test.ts (4 tests)
✓ packages/external-mod-resolver/src/maven-repository.test.ts (3 tests)
✓ packages/external-mod-resolver/src/curseforge.test.ts (4 tests)
Test Files  4 passed (4)
Tests  12 passed (12)
```

## Actual Return Value
The following output was produced by directly calling `resolveCurseForgeMod` with a fixture fetch implementation through `pnpm exec tsx`.

```json
{
  "requests": [
    "https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&pageSize=5&slug=jei",
    "https://api.curseforge.com/v1/mods/238222/files?gameVersion=1.20.1&pageSize=50",
    "https://api.curseforge.com/v1/mods/238222/files/7920915/download-url"
  ],
  "result": {
    "source": "curseforge",
    "query": "jei",
    "candidates": [
      {
        "source": "curseforge",
        "confidence": "high",
        "confidenceReasons": [
          "matched CurseForge slug jei",
          "matched loader forge",
          "matched Minecraft 1.20.1",
          "selected jar file"
        ],
        "projectId": "238222",
        "slug": "jei",
        "title": "Just Enough Items (JEI)",
        "versionId": "7920915",
        "versionNumber": "15.20.0.130 for Forge 1.20.1",
        "loaders": [
          "forge"
        ],
        "minecraftVersions": [
          "1.20.1"
        ],
        "fileName": "jei-1.20.1-forge-15.20.0.130.jar",
        "downloadUrl": "https://mediafilez.forgecdn.net/files/7920/915/jei.jar",
        "hashes": {},
        "mavenArtifacts": [
          {
            "source": "cursemaven",
            "repositoryName": "CurseMaven",
            "repositoryUrl": "https://cursemaven.com",
            "group": "curse.maven",
            "artifact": "jei-238222",
            "version": "7920915",
            "coordinates": "curse.maven:jei-238222:7920915"
          }
        ],
        "requiresConfirmation": true,
        "cachePolicy": "metadata_only"
      }
    ],
    "warnings": []
  }
}
```

## Full Verification
Commands:

```bash
pnpm typecheck
pnpm test
git diff --check
find apps packages tests -path '*/node_modules' -prune -o -path '*/dist' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './.git' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Observed result:

```text
pnpm typecheck: passed
pnpm test: 116 test files passed, 375 tests passed
git diff --check: passed with no output
TS/TSX 500-line guard: passed with no output
Go residue guard: passed with no output
```
