# MCP External Mod Resolution Verification
Date: 2026-05-02
Author: m1hono
Scope: `@mcpskill/mcp-server`, `@mcpskill/agent-harness`, `@mcpskill/external-mod-resolver`

## Summary
Wired external mod acquisition into the internal MCP evidence chain without adding a new public tool.

Implemented behavior:

- `mc_develop` can route Modrinth, CurseForge, CurseMaven, and Maven-coordinate requests to `external_mod_resolution`.
- `external_mod_resolution` is a primary `context.query` evidence candidate before docs fallback.
- The internal executor parses platform, mod query, loader, and Minecraft version from the request text.
- Modrinth requests call the API-backed resolver and return Maven metadata, Gradle snippets, hashes, and confirmation/cache policy.
- CurseForge requests return actionable `CURSEFORGE_API_KEY` guidance when credentials are missing.
- No jar download is performed by this path.

## Red Phase
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/evidence-plan.test.ts apps/mcp-server/src/context-query-executor.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts
```

Expected failures before implementation:

```text
FAIL apps/mcp-server/src/external-mod-resolution-executor.test.ts
Error: Cannot find package '@mcpskill/external-mod-resolver'

FAIL apps/mcp-server/src/context-query-executor.test.ts
expected { matched: false, ... } to deeply equal { matched: true, ... }
summary: "No internal context.query handler registered for workspace_source."

FAIL apps/mcp-server/src/evidence-plan.test.ts
expected candidate-1-external_mod_resolution
received candidate-1-workspace_source
```

## Green Phase
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/evidence-plan.test.ts apps/mcp-server/src/context-query-executor.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts apps/mcp-server/src/request-executor-external-mod.test.ts
```

Result:

```text
✓ apps/mcp-server/src/external-mod-resolution-executor.test.ts (2 tests)
✓ apps/mcp-server/src/evidence-plan.test.ts (8 tests)
✓ apps/mcp-server/src/request-executor-external-mod.test.ts (1 test)
✓ apps/mcp-server/src/context-query-executor.test.ts (5 tests)

Test Files  4 passed (4)
Tests  16 passed (16)
```

## Actual Return Values
Command:

```bash
pnpm exec tsx -e '... executeMcpServerRequest({ requestText: "Find the Modrinth Maven modImplementation coordinate for Sodium fabric 1.20.1." }) ...'
```

Observed selected evidence:

```json
{
  "candidateId": "candidate-1-external_mod_resolution",
  "routeStep": "external_mod_resolution",
  "provenance": "external_mod_resolution",
  "preferredTool": "context.query",
  "status": "selected",
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
          "projectId": "AANobbMI",
          "slug": "sodium",
          "versionId": "OihdIimA",
          "versionNumber": "mc1.20.1-0.5.13-fabric",
          "fileName": "sodium-fabric-0.5.13+mc1.20.1.jar",
          "mavenArtifacts": [
            {
              "repositoryUrl": "https://api.modrinth.com/maven",
              "coordinates": "maven.modrinth:sodium:OihdIimA",
              "aliases": [
                "maven.modrinth:sodium:mc1.20.1-0.5.13-fabric",
                "maven.modrinth:AANobbMI:OihdIimA",
                "maven.modrinth:AANobbMI:mc1.20.1-0.5.13-fabric"
              ],
              "gradle": {
                "loom": {
                  "modImplementation": "modImplementation \"maven.modrinth:sodium:OihdIimA\""
                },
                "forgeGradle": {
                  "implementationFgDeobf": "implementation fg.deobf(\"maven.modrinth:sodium:OihdIimA\")"
                }
              }
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

Command:

```bash
env -u CURSEFORGE_API_KEY pnpm exec tsx -e '... executeMcpServerRequest({ requestText: "Find the CurseMaven coordinate for JEI forge 1.20.1." }) ...'
```

Observed selected evidence:

```json
{
  "candidateId": "candidate-1-external_mod_resolution",
  "routeStep": "external_mod_resolution",
  "provenance": "external_mod_resolution",
  "preferredTool": "context.query",
  "status": "selected",
  "summary": "CurseForge API resolution requires CURSEFORGE_API_KEY. Create one at https://console.curseforge.com/?#/api-keys. Set CURSEFORGE_API_KEY before retrying.",
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
      "candidates": [],
      "warnings": [
        {
          "code": "credentials_required",
          "setupUrl": "https://console.curseforge.com/?#/api-keys",
          "credentialEnvVar": "CURSEFORGE_API_KEY"
        }
      ]
    }
  }
}
```

## Notes
- The public MCP surface remains progressive: no new public tool was added.
- The route uses `context.query`, so later source/cache policy can stay internal to the MCP logic pipeline.
- Real CurseForge project/file resolution still requires a user-provided API key and should not be committed to docs, tests, or repository config.
