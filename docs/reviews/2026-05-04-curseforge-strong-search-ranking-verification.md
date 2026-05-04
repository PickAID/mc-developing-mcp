# CurseForge Strong Search Ranking Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice improves CurseForge broad query resolution without weakening
ambiguity protection. When `/v1/mods/search` returns multiple projects, the
resolver may now auto-select only with strong identity evidence:

- exact numeric project id match;
- slug equals the query after punctuation/space/case normalization;
- project name equals the query after punctuation/space/case normalization.

The resolver still refuses weak multi-result queries such as `energy`, and it
does not use download count or result order as selection evidence.

## Red
Package red test:

```bash
pnpm vitest run packages/external-mod-resolver/src/curseforge-ranking.test.ts
```

Observed failure before implementation:

```text
× resolveCurseForgeMod search ranking > selects a normalized exact name match from multiple CurseForge search hits
  → expected [ Array(1) ] to have a length of 2 but got 1
```

The failure is correct: the resolver stopped after search and returned
`ambiguous_project_match` instead of requesting `/v1/mods/2002/files`.

## Green
Focused green:

```bash
pnpm vitest run packages/external-mod-resolver/src/curseforge-ranking.test.ts
```

Result:

```text
✓ packages/external-mod-resolver/src/curseforge-ranking.test.ts (1 test) 10ms

Test Files  1 passed (1)
Tests  1 passed (1)
```

Regression for existing CurseForge credential, slug, ambiguity, and download URL
behavior:

```bash
pnpm vitest run packages/external-mod-resolver/src/curseforge.test.ts
```

Result:

```text
✓ packages/external-mod-resolver/src/curseforge.test.ts (4 tests) 4ms

Test Files  1 passed (1)
Tests  4 passed (4)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  122 passed (122)
Tests  400 passed (400)
```

Repository guards:

```bash
git diff --check
find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './.git' -prune -o -path './node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Result: no output from all three guard commands.

## Actual Return Value
Fixture:

```text
Query: energy api
Loader: forge
Minecraft: 1.20.1
Credential provider returns fixture key "test-key".
Search returns energy-control, energy-api, and energized-power.
The strongest identity match is project 2002 because "Energy API" and
"energy-api" both normalize to "energy api".
```

Observed request flow:

```json
[
  "https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&pageSize=5&searchFilter=energy+api",
  "https://api.curseforge.com/v1/mods/2002/files?gameVersion=1.20.1&pageSize=50"
]
```

Return value:

```json
{
  "source": "curseforge",
  "query": "energy api",
  "candidates": [
    {
      "source": "curseforge",
      "confidence": "medium",
      "confidenceReasons": [
        "matched CurseForge project 2002",
        "matched loader forge",
        "matched Minecraft 1.20.1",
        "selected jar file"
      ],
      "projectId": "2002",
      "slug": "energy-api",
      "title": "Energy API",
      "versionId": "9001",
      "versionNumber": "1.0.0 for Forge 1.20.1",
      "loaders": [
        "forge"
      ],
      "minecraftVersions": [
        "1.20.1"
      ],
      "fileName": "energy-api-1.0.0-forge-1.20.1.jar",
      "downloadUrl": "https://mediafilez.forgecdn.net/files/9000/001/energy-api.jar",
      "hashes": {
        "sha1": "sha1-energy-api"
      },
      "mavenArtifacts": [
        {
          "source": "cursemaven",
          "repositoryName": "CurseMaven",
          "repositoryUrl": "https://cursemaven.com",
          "group": "curse.maven",
          "artifact": "energy-api-2002",
          "version": "9001",
          "coordinates": "curse.maven:energy-api-2002:9001"
        }
      ],
      "requiresConfirmation": true,
      "cachePolicy": "metadata_only"
    }
  ],
  "warnings": []
}
```

## Notes
- The fixture API key is a test-only string; no CurseForge secret is stored.
- Explicit `slug` behavior is unchanged: slug search still requires exact slug
  equality when choosing among returned projects.
