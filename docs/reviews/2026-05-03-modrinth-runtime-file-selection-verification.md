# Modrinth Runtime File Selection Verification
Date: 2026-05-03
Author: m1hono

## Scope
This pass verifies that Modrinth resolver file selection does not return sidecar jar files as runtime mod artifacts. The resolver should skip known `file_type` sidecars such as `sources-jar`, `dev-jar`, `javadoc-jar`, `signature`, `required-resource-pack`, and `optional-resource-pack`.

Official reference: <https://docs.modrinth.com/api/operations/getprojectversions/>

## TDD Red
Command:

```bash
pnpm exec vitest run packages/external-mod-resolver/src/modrinth.test.ts
```

Observed failure before implementation:

```text
FAIL  packages/external-mod-resolver/src/modrinth.test.ts > resolveModrinthMod > selects a runtime jar instead of a primary Modrinth sources jar
-       "downloadUrl": "https://cdn.modrinth.com/data/project-demo/versions/version-demo/demo-mod.jar",
-       "fileName": "demo-mod-1.0.0.jar",
+       "downloadUrl": "https://cdn.modrinth.com/data/project-demo/versions/version-demo/demo-mod-sources.jar",
+       "fileName": "demo-mod-1.0.0-sources.jar",
```

This confirmed the resolver picked a primary `sources-jar` when a runtime jar was also present.

## Local Green
Commands:

```bash
pnpm exec tsc -b packages/external-mod-resolver --pretty false
pnpm exec vitest run packages/external-mod-resolver/src/modrinth.test.ts packages/external-mod-resolver/src/curseforge.test.ts packages/external-mod-resolver/src/maven-repository.test.ts packages/external-mod-resolver/src/metadata-cache.test.ts
```

Observed result:

```text
✓ packages/external-mod-resolver/src/metadata-cache.test.ts (1 test)
✓ packages/external-mod-resolver/src/curseforge.test.ts (4 tests)
✓ packages/external-mod-resolver/src/maven-repository.test.ts (3 tests)
✓ packages/external-mod-resolver/src/modrinth.test.ts (6 tests)
Test Files  4 passed (4)
Tests  14 passed (14)
```

## Actual Return Value
The following output was produced by directly calling `resolveModrinthMod` with a fixture fetch implementation through `pnpm exec tsx`.

```json
{
  "requests": [
    "https://api.modrinth.com/v2/project/demo-mod",
    "https://api.modrinth.com/v2/project/demo-mod/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%221.20.1%22%5D"
  ],
  "result": {
    "source": "modrinth",
    "query": "demo-mod",
    "candidates": [
      {
        "source": "modrinth",
        "confidence": "high",
        "confidenceReasons": [
          "matched Modrinth slug demo-mod",
          "matched loader fabric",
          "matched Minecraft 1.20.1",
          "selected jar file"
        ],
        "projectId": "project-demo",
        "slug": "demo-mod",
        "title": "Demo Mod",
        "versionId": "version-demo",
        "versionNumber": "1.0.0",
        "loaders": [
          "fabric"
        ],
        "minecraftVersions": [
          "1.20.1"
        ],
        "fileName": "demo-mod-1.0.0.jar",
        "downloadUrl": "https://cdn.modrinth.com/data/project-demo/versions/version-demo/demo-mod.jar",
        "hashes": {
          "sha1": "runtime-sha1"
        },
        "mavenArtifacts": [
          {
            "source": "modrinth-maven",
            "repositoryName": "Modrinth Maven",
            "repositoryUrl": "https://api.modrinth.com/maven",
            "coordinates": "maven.modrinth:demo-mod:version-demo"
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
pnpm test: 117 test files passed, 381 tests passed
git diff --check: passed with no output
TS/TSX 500-line guard: passed with no output
Go residue guard: passed with no output
```
