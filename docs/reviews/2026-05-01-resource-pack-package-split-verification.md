# Resource-Pack Package Split Verification
Date: 2026-05-01
Author: m1hono
Scope: `@mcpskill/shared-types`, `@mcpskill/source-package-manager`, `apps/mcp-server`

## Summary
This slice separates vanilla resource-pack packages from the older generic `assets` package concept.

Implemented behavior:

- Canonical resource-pack package id: `minecraft-<version>-vanilla-resource-pack-official`.
- Canonical artifact type: `resource-pack`.
- Canonical extraction source: official/client archive `assets/**` only.
- MCP generated vanilla assets evidence now installs/reads the canonical resource-pack package.
- Legacy `assets` coordinate and provider remain available for compatibility.
- Public MCP surface remains unchanged: no new public tool was added.

## Red Phase
Command:

```bash
pnpm exec vitest run packages/source-package-manager/src/executor.test.ts packages/source-package-manager/src/vanilla-provider.test.ts apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts
```

Expected failures before implementation:

```text
packages/source-package-manager/src/vanilla-provider.test.ts
  × buildMojangVanillaResourcePackRecipeProvider is not a function

packages/source-package-manager/src/executor.test.ts
  × buildVanillaResourcePackArchiveRecipe is not a function

apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts
  × buildVanillaResourcePackArchiveRecipe is not a function

Test Files  3 failed (3)
Tests  4 failed | 6 passed (10)
```

## Green Phase
The first green run required rebuilding `@mcpskill/source-package-manager` because app-level tests import the workspace package through its `dist` export.

Commands:

```bash
pnpm --filter @mcpskill/source-package-manager build
pnpm exec vitest run packages/source-package-manager/src/executor.test.ts packages/source-package-manager/src/vanilla-provider.test.ts apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts
```

Result:

```text
✓ packages/source-package-manager/src/executor.test.ts (5 tests)
✓ packages/source-package-manager/src/vanilla-provider.test.ts (3 tests)
✓ apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts (2 tests)

Test Files  3 passed (3)
Tests  10 passed (10)
```

## Actual Return Shape
The MCP-side generated vanilla assets evidence now returns the resource-pack package id while keeping the existing payload source name for compatibility.

Representative payload fragment:

```json
{
  "source": "vanilla_assets",
  "result": {
    "status": "ready",
    "packageId": "minecraft-1.20.1-vanilla-resource-pack-official",
    "resourceSummary": {
      "tokenPolicy": "counts_only",
      "byDomain": {
        "assets": 1
      },
      "byKind": {
        "models": 1
      }
    },
    "reads": [
      {
        "file": {
          "relativePath": "assets/minecraft/models/item/stone.json",
          "namespace": "minecraft",
          "kind": "models",
          "domain": "assets"
        },
        "content": "{\"parent\":\"minecraft:item/generated\"}\n"
      }
    ]
  }
}
```

## External Acquisition Smoke Checks
These checks were not wired into MCP yet. They validate the next resolver slice assumptions with real upstream behavior.

Modrinth project search and version-file lookup:

```bash
curl -sS -H 'User-Agent: PickAID-mc-developing-mcp/0.0.0 (analysis)' \
  'https://api.modrinth.com/v2/search?query=sodium&facets=%5B%5B%22project_type%3Amod%22%5D%2C%5B%22categories%3Afabric%22%5D%2C%5B%22versions%3A1.20.1%22%5D%5D&limit=1'
```

Observed compact result:

```json
{
  "hits": [
    {
      "project_id": "AANobbMI",
      "slug": "sodium",
      "title": "Sodium",
      "downloads": 148390564,
      "versions": ["1.16.3", "1.16.4", "1.16.5"]
    }
  ],
  "total_hits": 19
}
```

```bash
curl -sS -H 'User-Agent: PickAID-mc-developing-mcp/0.0.0 (analysis)' \
  'https://api.modrinth.com/v2/project/sodium/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%221.20.1%22%5D'
```

Observed compact result:

```json
[
  {
    "id": "OihdIimA",
    "version_number": "mc1.20.1-0.5.13-fabric",
    "loaders": ["fabric", "quilt"],
    "game_versions": ["1.20.1"],
    "file": {
      "filename": "sodium-fabric-0.5.13+mc1.20.1.jar",
      "hashes": ["sha1", "sha512"]
    }
  }
]
```

Maven metadata lookup:

```bash
curl -sS 'https://maven.blamejared.com/mezz/jei/jei-1.20.1-forge/maven-metadata.xml'
```

Observed compact result:

```xml
<latest>15.20.0.130</latest>
<release>15.20.0.130</release>
<version>15.0.0.12</version>
<version>15.0.0.13</version>
```

CurseForge API without credentials:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  'https://api.curseforge.com/v1/mods/search?gameId=432&searchFilter=jei&pageSize=1'
```

Observed result:

```text
403
```

Interpretation: CurseForge must be API-key/config driven. Download-page scraping must not be the primary resolver path.

Official references:

- Modrinth API search: <https://docs.modrinth.com/api/operations/searchprojects/>
- Modrinth project versions: <https://docs.modrinth.com/api/operations/getprojectversions/>
- CurseForge REST API: <https://docs.curseforge.com/rest-api/>
- Maven repository layout: <https://maven.apache.org/repositories/layout.html>

## Full Verification
Command:

```bash
pnpm typecheck
pnpm test
```

Result:

```text
pnpm typecheck
  passed

pnpm test
  Test Files  109 passed (109)
  Tests  350 passed (350)
```

## Residual Risks
- The public payload source is still named `vanilla_assets` for compatibility. A later UX cleanup can introduce a clearer display name without changing the public tool surface.
- External Modrinth/Maven/CurseForge resolution is validated as a next slice, not yet integrated into package installation.
- CurseForge support depends on user-provided credentials or an explicitly accepted fallback policy.
