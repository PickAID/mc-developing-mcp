# Remote Fetch Option Routing Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice lets MCP internal external mod resolution pass testable remote fetch
controls into Modrinth and Maven default resolvers.

New internal options:

- `mavenFetch`
- `modrinthFetch`
- `modrinthApiBaseUrl`
- context-level `externalModMavenFetch`
- context-level `externalModModrinthFetch`
- context-level `externalModModrinthApiBaseUrl`

This improves offline harness and fixture testing without adding a new public
MCP tool and without changing the default production endpoints.

## Red
Package red test:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-remote-options.test.ts
```

Observed failure before implementation:

```text
× executeMcpServerExternalModResolution remote options > passes configured Modrinth fetch options into the resolver
  → expected undefined to be [AsyncFunction fetcher]

× executeMcpServerExternalModResolution remote options > passes configured Maven metadata fetch into the resolver
  → expected undefined to be [AsyncFunction fetcher]
```

The failure is correct: the configured fetchers were not present in the resolver
input.

## Green
Focused green:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-remote-options.test.ts
```

Result:

```text
✓ apps/mcp-server/src/external-mod-resolution-remote-options.test.ts (2 tests) 3ms

Test Files  1 passed (1)
Tests  2 passed (2)
```

Typecheck:

```bash
pnpm typecheck
```

Result:

```text
tsc -b --pretty false
```

Exit code: 0.

Related regression:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-remote-options.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts apps/mcp-server/src/context-query-external-mod-credentials.test.ts
```

Result:

```text
✓ apps/mcp-server/src/external-mod-resolution-remote-options.test.ts (2 tests) 3ms
✓ apps/mcp-server/src/external-mod-resolution-executor.test.ts (7 tests) 6ms
✓ apps/mcp-server/src/context-query-external-mod-credentials.test.ts (1 test) 5ms

Test Files  3 passed (3)
Tests  10 passed (10)
```

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  124 passed (124)
Tests  404 passed (404)
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
Modrinth request: Find the Modrinth mod sodium fabric 1.20.1.
Modrinth option: modrinthApiBaseUrl = https://modrinth.fixture
Maven request: Use modImplementation "com.example:demo-mod" from https://maven.example/releases.
Maven metadata fixture resolves release version 1.2.3.
```

Observed Modrinth request flow:

```json
[
  "https://modrinth.fixture/v2/project/sodium",
  "https://modrinth.fixture/v2/project/sodium/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%221.20.1%22%5D"
]
```

Modrinth return value:

```json
{
  "matched": true,
  "summary": "Resolved external mod Maven coordinates: maven.modrinth:sodium:OihdIimA.",
  "payload": {
    "source": "external_mod_resolution",
    "request": {
      "platform": "modrinth",
      "query": "sodium",
      "loader": "fabric",
      "minecraftVersion": "1.20.1"
    },
    "result": {
      "source": "modrinth",
      "query": "sodium",
      "candidates": [
        {
          "source": "modrinth",
          "confidence": "high",
          "projectId": "AANobbMI",
          "slug": "sodium",
          "title": "Sodium",
          "versionId": "OihdIimA",
          "fileName": "sodium-fabric.jar",
          "downloadUrl": "https://cdn.modrinth.example/sodium.jar",
          "mavenArtifacts": [
            {
              "coordinates": "maven.modrinth:sodium:OihdIimA"
            }
          ],
          "requiresConfirmation": true,
          "cachePolicy": "metadata_only"
        }
      ],
      "warnings": []
    }
  }
}
```

Observed Maven metadata request flow:

```json
[
  "https://maven.example/releases/com/example/demo-mod/maven-metadata.xml"
]
```

Maven return value:

```json
{
  "matched": true,
  "summary": "Resolved external mod Maven coordinates: com.example:demo-mod:1.2.3.",
  "payload": {
    "source": "external_mod_resolution",
    "request": {
      "platform": "maven",
      "coordinate": "com.example:demo-mod",
      "repositoryUrls": [
        "https://maven.example/releases"
      ]
    },
    "result": {
      "source": "maven",
      "query": "com.example:demo-mod:1.2.3",
      "candidates": [
        {
          "source": "maven",
          "confidence": "high",
          "fileName": "demo-mod-1.2.3.jar",
          "downloadUrl": "https://maven.example/releases/com/example/demo-mod/1.2.3/demo-mod-1.2.3.jar",
          "mavenArtifacts": [
            {
              "coordinates": "com.example:demo-mod:1.2.3"
            }
          ],
          "requiresConfirmation": true,
          "cachePolicy": "metadata_only"
        },
        {
          "source": "maven",
          "confidence": "medium",
          "fileName": "demo-mod-1.2.3-sources.jar",
          "downloadUrl": "https://maven.example/releases/com/example/demo-mod/1.2.3/demo-mod-1.2.3-sources.jar",
          "requiresConfirmation": true,
          "cachePolicy": "metadata_only"
        }
      ],
      "warnings": []
    }
  }
}
```

## Notes
- The fixture fetchers are internal harness controls and do not alter default
  Modrinth or Maven behavior.
- No remote jars are downloaded; the resolver still returns metadata and
  confirmation-required candidates only.
