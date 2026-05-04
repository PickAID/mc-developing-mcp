# Modrinth Strong Search Ranking Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice improves Modrinth remote project selection for broad search queries.
When direct `/v2/project/{query}` lookup fails and search returns multiple hits,
the resolver may now auto-select only when there is strong identity evidence:

- exact project id match after trim/lowercase;
- slug equals the query after punctuation/space/case normalization;
- title equals the query after punctuation/space/case normalization.

Weak evidence such as download count, partial containment, or first search result
position is still not used for auto-selection.

## Red
Package red test:

```bash
pnpm vitest run packages/external-mod-resolver/src/modrinth-ranking.test.ts
```

Observed failure before implementation:

```text
× resolveModrinthMod search ranking > selects a normalized exact title match from multiple Modrinth search hits
  → expected [ …(2) ] to have a length of 3 but got 2
```

The failure is correct: the resolver stopped after search and returned
`ambiguous_project_match` instead of requesting `/v2/project/energy-api/version`.

## Green
Focused green:

```bash
pnpm vitest run packages/external-mod-resolver/src/modrinth-ranking.test.ts
```

Result:

```text
✓ packages/external-mod-resolver/src/modrinth-ranking.test.ts (1 test) 3ms

Test Files  1 passed (1)
Tests  1 passed (1)
```

Regression for existing Modrinth ambiguity behavior:

```bash
pnpm vitest run packages/external-mod-resolver/src/modrinth.test.ts
```

Result:

```text
✓ packages/external-mod-resolver/src/modrinth.test.ts (6 tests) 4ms

Test Files  1 passed (1)
Tests  6 passed (6)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  121 passed (121)
Tests  399 passed (399)
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
Loader: fabric
Minecraft: 1.20.1
Direct project lookup returns 404.
Search returns energy-control, energy-api, and energized-power.
The strongest identity match is energy-api because "Energy API" and
"energy-api" both normalize to "energy api".
```

Observed request flow:

```json
[
  "https://api.modrinth.com/v2/project/energy%20api",
  "https://api.modrinth.com/v2/search?query=energy+api&limit=5&facets=%5B%5B%22project_type%3Amod%22%5D%2C%5B%22categories%3Afabric%22%5D%2C%5B%22versions%3A1.20.1%22%5D%5D",
  "https://api.modrinth.com/v2/project/energy-api/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%221.20.1%22%5D"
]
```

Return value:

```json
{
  "source": "modrinth",
  "query": "energy api",
  "candidates": [
    {
      "source": "modrinth",
      "confidence": "high",
      "confidenceReasons": [
        "matched Modrinth slug energy-api",
        "matched loader fabric",
        "matched Minecraft 1.20.1",
        "selected primary jar file"
      ],
      "projectId": "project-energy-api",
      "slug": "energy-api",
      "title": "Energy API",
      "versionId": "version-energy-api",
      "versionNumber": "1.0.0+1.20.1",
      "loaders": [
        "fabric"
      ],
      "minecraftVersions": [
        "1.20.1"
      ],
      "fileName": "energy-api-1.0.0+1.20.1.jar",
      "downloadUrl": "https://cdn.modrinth.com/data/project-energy-api/versions/version-energy-api/energy-api.jar",
      "hashes": {
        "sha1": "sha1-energy-api"
      },
      "mavenArtifacts": [
        {
          "source": "modrinth-maven",
          "repositoryName": "Modrinth Maven",
          "repositoryUrl": "https://api.modrinth.com/maven",
          "group": "maven.modrinth",
          "artifact": "energy-api",
          "version": "version-energy-api",
          "coordinates": "maven.modrinth:energy-api:version-energy-api",
          "aliases": [
            "maven.modrinth:energy-api:1.0.0+1.20.1",
            "maven.modrinth:project-energy-api:version-energy-api",
            "maven.modrinth:project-energy-api:1.0.0+1.20.1"
          ]
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
- This keeps the existing weak single-token query behavior: `energy` with
  multiple energy-related projects still returns `ambiguous_project_match`.
- The helper is separated into `modrinth-ranking.ts` so the resolver file does
  not absorb more ranking policy over time.
