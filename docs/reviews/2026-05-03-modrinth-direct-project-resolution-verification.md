# Modrinth Direct Project Resolution Verification
Date: 2026-05-03
Author: m1hono

## Scope
This pass verifies that exact Modrinth slug/project id input is resolved through the direct project API before broad search. The resolver should call `/v2/project/{id|slug}`, then `/v2/project/{slug}/version`, and only fall back to search when direct lookup returns `404`.

Official references:

- <https://docs.modrinth.com/api/operations/getproject/>
- <https://docs.modrinth.com/api/operations/getprojectversions/>

## TDD Red
Command:

```bash
pnpm exec vitest run packages/external-mod-resolver/src/modrinth.test.ts
```

Observed failure before implementation:

```text
FAIL  packages/external-mod-resolver/src/modrinth.test.ts > resolveModrinthMod > resolves an exact Modrinth slug through the project API before search
Error: Exact Modrinth slugs should not use search first.
```

This confirmed exact slug input still called `/v2/search` before project-version lookup.

## Local Green
Commands:

```bash
pnpm exec tsc -b packages/external-mod-resolver --pretty false
pnpm exec vitest run packages/external-mod-resolver/src/modrinth.test.ts packages/external-mod-resolver/src/curseforge.test.ts packages/external-mod-resolver/src/maven-repository.test.ts packages/external-mod-resolver/src/metadata-cache.test.ts
```

Observed result:

```text
✓ packages/external-mod-resolver/src/curseforge.test.ts (4 tests)
✓ packages/external-mod-resolver/src/metadata-cache.test.ts (1 test)
✓ packages/external-mod-resolver/src/maven-repository.test.ts (3 tests)
✓ packages/external-mod-resolver/src/modrinth.test.ts (5 tests)
Test Files  4 passed (4)
Tests  13 passed (13)
```

## Actual Return Values
The following output was produced by directly calling `resolveModrinthMod` with fixture fetch implementations through `pnpm exec tsx`.

```json
{
  "directRequests": [
    "https://api.modrinth.com/v2/project/sodium",
    "https://api.modrinth.com/v2/project/sodium/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%221.20.1%22%5D"
  ],
  "direct": {
    "source": "modrinth",
    "query": "sodium",
    "candidates": [
      {
        "source": "modrinth",
        "confidence": "high",
        "confidenceReasons": [
          "matched Modrinth slug sodium",
          "matched loader fabric",
          "matched Minecraft 1.20.1",
          "selected primary jar file"
        ],
        "projectId": "AANobbMI",
        "slug": "sodium",
        "title": "Sodium",
        "versionId": "OihdIimA",
        "versionNumber": "mc1.20.1-0.5.13-fabric",
        "loaders": [
          "fabric"
        ],
        "minecraftVersions": [
          "1.20.1"
        ],
        "fileName": "sodium-fabric-0.5.13+mc1.20.1.jar",
        "downloadUrl": "https://cdn.modrinth.com/data/AANobbMI/versions/OihdIimA/sodium.jar",
        "hashes": {
          "sha1": "sha1-fixture"
        },
        "mavenArtifacts": [
          {
            "source": "modrinth-maven",
            "repositoryName": "Modrinth Maven",
            "repositoryUrl": "https://api.modrinth.com/maven",
            "coordinates": "maven.modrinth:sodium:OihdIimA"
          }
        ],
        "requiresConfirmation": true,
        "cachePolicy": "metadata_only"
      }
    ],
    "warnings": []
  },
  "fallbackRequests": [
    "https://api.modrinth.com/v2/project/energy",
    "https://api.modrinth.com/v2/search?query=energy&limit=5&facets=%5B%5B%22project_type%3Amod%22%5D%2C%5B%22categories%3Afabric%22%5D%2C%5B%22versions%3A1.20.1%22%5D%5D"
  ],
  "fallback": {
    "source": "modrinth",
    "query": "energy",
    "candidates": [],
    "warnings": [
      {
        "code": "ambiguous_project_match",
        "message": "Modrinth query energy matched multiple projects; choose an exact slug or project id.",
        "projectHints": [
          {
            "source": "modrinth",
            "projectId": "project-a",
            "slug": "energy-api",
            "title": "Energy API",
            "downloads": 3000
          },
          {
            "source": "modrinth",
            "projectId": "project-b",
            "slug": "energy-control",
            "title": "Energy Control",
            "downloads": 2000
          }
        ]
      }
    ]
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
pnpm test: 117 test files passed, 380 tests passed
git diff --check: passed with no output
TS/TSX 500-line guard: passed with no output
Go residue guard: passed with no output
```
