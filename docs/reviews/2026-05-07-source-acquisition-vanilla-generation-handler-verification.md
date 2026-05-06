# Source Acquisition Vanilla Generation Handler Verification

Date: 2026-05-07
Author: m1hono

## Scope

This slice adds MCP-side `vanilla_generation` handling for source acquisition work items.

The handler uses the existing source package manager confirmation and install flow. It does not distribute Minecraft source code and does not assume source generation is already available. Without explicit package confirmation, it returns confirmation evidence.

## Behavior

For:

```text
Generate vanilla source for Minecraft 1.20.1.
```

Without confirmation, the handler returns:

```json
{
  "source": "source_acquisition_vanilla_generation",
  "result": {
    "status": "needs_confirmation",
    "packageId": "minecraft-1.20.1-source-pack-named",
    "confirmationScope": "package-version"
  }
}
```

With confirmation and a provided recipe, the handler installs into runtime cache and returns:

```json
{
  "source": "source_acquisition_vanilla_generation",
  "result": {
    "status": "ready",
    "packageId": "minecraft-1.20.1-source-pack-named",
    "artifactType": "source-pack",
    "sourceIndex": {
      "fileCount": 1,
      "javaSymbolCount": 1,
      "indexedTextFileCount": 1
    }
  }
}
```

## Implementation Boundary

The handler delegates to `ensureSourcePackageInstalled` and `buildLocalSourcePackageRecipeExecutor`. It accepts optional recipes, recipe provider, and recipe executor injection so tests and future backends can provide different generation mechanisms without changing the MCP tool surface.

The source acquisition handler file remains a thin coordinator; vanilla-specific install evidence lives in:

```text
apps/mcp-server/src/source-acquisition/source-acquisition-vanilla-generation.ts
```

## Verification

Commands:

```bash
pnpm --filter @mcpskill/mcp-server test -- source-acquisition/source-acquisition-work-item-handlers.test.ts
pnpm test
git diff --check
wc -l apps/mcp-server/src/source-acquisition/source-acquisition-work-item-handlers.ts apps/mcp-server/src/source-acquisition/source-acquisition-work-item-handlers.test.ts apps/mcp-server/src/source-acquisition/source-acquisition-vanilla-generation.ts
```

Results:

```text
mcp-server targeted: Test Files 90 passed (90), Tests 280 passed (280)
full workspace: Test Files 192 passed (192), Tests 676 passed (676)
```

Line counts:

```text
281 apps/mcp-server/src/source-acquisition/source-acquisition-work-item-handlers.ts
404 apps/mcp-server/src/source-acquisition/source-acquisition-work-item-handlers.test.ts
129 apps/mcp-server/src/source-acquisition/source-acquisition-vanilla-generation.ts
```

All checked files remain below the 500-line limit.

## Remaining Work

The next useful slice is to wire default source acquisition work item handlers into the production `mc_develop` path with conservative policies:

- planning only by default;
- execute local/cache-safe work items when runtimeRoot is available;
- keep remote work item execution opt-in or credentials-aware.
