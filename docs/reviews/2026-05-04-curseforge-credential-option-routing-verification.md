# CurseForge Credential Option Routing Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice lets the MCP internal external mod resolver route user-provided
CurseForge credentials into the default API-backed resolver without adding a new
public MCP tool.

New internal options:

- `curseForgeApiKey`
- `curseForgeCredentialProvider`
- `curseForgeFetch`
- `curseForgeApiBaseUrl`
- context-level `externalModCurseForge*` pass-through options

The default environment-variable behavior remains unchanged. Open-source
distribution still does not ship or commit a shared CurseForge key.

## Red
Executor red test:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-executor.test.ts -t "configured CurseForge credentials"
```

Observed failure before implementation:

```text
× executeMcpServerExternalModResolution > passes configured CurseForge credentials into the default resolver
  → expected [] to deeply equal [ 'test-key', 'test-key' ]
```

The failure is correct: the fake `curseForgeFetch` was never called, so the
configured API key could not reach the default CurseForge resolver.

## Green
Focused green:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-executor.test.ts -t "configured CurseForge credentials"
```

Result:

```text
✓ apps/mcp-server/src/external-mod-resolution-executor.test.ts (7 tests | 6 skipped) 4ms

Test Files  1 passed (1)
Tests  1 passed | 6 skipped (7)
```

Related executor and context route regression:

```bash
pnpm vitest run apps/mcp-server/src/external-mod-resolution-executor.test.ts apps/mcp-server/src/context-query-external-mod-credentials.test.ts apps/mcp-server/src/context-query-executor.test.ts
```

Result:

```text
✓ apps/mcp-server/src/external-mod-resolution-executor.test.ts (7 tests) 5ms
✓ apps/mcp-server/src/context-query-external-mod-credentials.test.ts (1 test) 4ms
✓ apps/mcp-server/src/context-query-executor.test.ts (6 tests) 144ms

Test Files  3 passed (3)
Tests  14 passed (14)
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

Full suite:

```bash
pnpm test
```

Result:

```text
Test Files  123 passed (123)
Tests  402 passed (402)
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
Request: Find the CurseForge mod jei forge 1.20.1.
Context executor receives externalModCurseForgeApiKey = "test-key".
Fake CurseForge search returns project 238222 / slug jei.
Fake files endpoint returns file 7920915 for Forge 1.20.1.
```

Observed credential header use:

```json
[
  "test-key",
  "test-key"
]
```

Return value:

```json
{
  "matched": true,
  "summary": "Resolved external mod Maven coordinates: curse.maven:jei-238222:7920915.",
  "payload": {
    "source": "external_mod_resolution",
    "request": {
      "platform": "curseforge",
      "query": "jei",
      "loader": "forge",
      "minecraftVersion": "1.20.1"
    },
    "result": {
      "source": "curseforge",
      "query": "jei",
      "candidates": [
        {
          "source": "curseforge",
          "confidence": "medium",
          "confidenceReasons": [
            "matched CurseForge project 238222",
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
}
```

## Notes
- The fixture key is intentionally fake and appears only in tests/docs as
  `test-key`.
- This is an internal configuration path. The public MCP tool surface remains
  unchanged.
