# Resource Pack Profile Separation Verification
Date: 2026-05-01
Author: m1hono
Scope: `packages/datapack-adapter`, `apps/mcp-server`

## Purpose
本切片把 assets-only/resource-pack evidence 从 datapack version profile 中拆出来。

原因：resource pack 的 `pack.mcmeta` `pack.pack_format` 不能直接用 datapack pack format catalog 解释，否则会把资源包误报为 datapack `known_profile`。

Implemented:

- Added `resolveResourcePackVersionProfile(...)`.
- Added MCP compact `resourcePackVersionProfile`.
- Assets-only roots no longer emit `datapackVersionProfile`.
- Resource-pack profile explicitly says official resource pack format catalog is not implemented yet.

## Red Phase
Bottom-layer command:

```bash
pnpm exec vitest run packages/datapack-adapter/src/resource-pack-profile.test.ts
```

Observed failure:

```text
Cannot find module './resource-pack-profile.js'
```

MCP command:

```bash
pnpm exec vitest run apps/mcp-server/src/source-bundle-resource-pack-profile.test.ts
```

Observed failure before implementation:

```text
Expected payload.resourcePackVersionProfile.
Received payload.datapackVersionProfile using datapack known_profile for an assets-only root.
```

## Green Phase
Build command:

```bash
pnpm typecheck
```

Observed result:

```text
tsc -b --pretty false
# exit 0
```

Targeted command:

```bash
pnpm exec vitest run \
  packages/datapack-adapter/src/resource-pack-profile.test.ts \
  apps/mcp-server/src/source-bundle-resource-pack-profile.test.ts \
  apps/mcp-server/src/source-bundle-datapack-executor.test.ts
```

Observed result:

```text
Test Files  3 passed (3)
Tests  8 passed (8)
```

## Full Verification
Command:

```bash
pnpm test
```

Observed result:

```text
Test Files  108 passed (108)
Tests  342 passed (342)
```

Guard commands:

```bash
git diff --check
find apps packages tests -path '*/node_modules' -prune -o -path '*/dist' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './.git' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Observed result:

```text
# all three commands exited 0 and produced no output
```

## Actual MCP Executor Return
For an assets-only root with:

```json
{ "pack": { "pack_format": 15 } }
```

and `assets/demo/lang/en_us.json`, the compact profile shape is:

```json
{
  "payload": {
    "resourcePackVersionProfile": {
      "tokenPolicy": "compact_resource_profile",
      "source": "pack_mcmeta_and_assets_runtime",
      "supportLevel": "format_catalog_not_available",
      "packFormatStatus": "metadata_only",
      "packFormatId": "15",
      "assetKinds": ["lang"],
      "semanticValidation": "not_available",
      "migrationAnalysis": "not_available",
      "notes": [
        "profile describes resource-pack metadata and observed asset kinds only",
        "official resource pack format catalog is not implemented yet",
        "versioned asset validation is not implemented yet"
      ]
    }
  }
}
```

The same payload does not include `datapackVersionProfile`.

## Boundaries
Implemented:

- Resource-pack metadata separation.
- Assets-only profile without datapack catalog interpretation.
- Missing `pack.mcmeta` handling without guessing a pack format.

Not implemented in this slice:

- Official resource pack format catalog.
- Versioned asset schema validation.
- Resource-pack migration analysis.
