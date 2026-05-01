# Resource Pack Profile Separation Verification
Date: 2026-05-01
Author: m1hono
Scope: `packages/datapack-adapter`, `apps/mcp-server`

## Purpose
本切片把 assets-only/resource-pack evidence 从 datapack version profile 中拆出来，并补上官方 resource-pack format catalog。

原因：resource pack 的 `pack.mcmeta` `pack.pack_format` 不能直接用 datapack pack format catalog 解释，否则会把资源包误报为 datapack `known_profile`。

Implemented:

- Added `resolveResourcePackVersionProfile(...)`.
- Added MCP compact `resourcePackVersionProfile`.
- Assets-only roots no longer emit `datapackVersionProfile`.
- Resource-pack profile now uses Mojang/Piston `server.jar!/version.json` `pack_version.resource`.
- Resource-pack profile detects runtime conflicts without using datapack format values.

## Official Evidence Source
官方来源：

- `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`
- 每个 release manifest 中的 `downloads.server.url`
- 官方 `server.jar!/version.json` 的 `pack_version.resource` 或 `pack_version.resource_major/resource_minor`

确认表：

| MC Version | Resource format | Datapack format |
| --- | ---: | ---: |
| 1.18.2 | 8 | 9 |
| 1.19 | 9 | 10 |
| 1.19.1 | 9 | 10 |
| 1.19.2 | 9 | 10 |
| 1.19.3 | 12 | 10 |
| 1.19.4 | 13 | 12 |
| 1.20 | 15 | 15 |
| 1.20.1 | 15 | 15 |
| 1.20.2 | 18 | 18 |
| 1.20.3 | 22 | 26 |
| 1.20.4 | 22 | 26 |
| 1.20.5 | 32 | 41 |
| 1.20.6 | 32 | 41 |
| 1.21 | 34 | 48 |
| 1.21.1 | 34 | 48 |
| 1.21.2 | 42 | 57 |
| 1.21.3 | 42 | 57 |
| 1.21.4 | 46 | 61 |
| 1.21.5 | 55 | 71 |
| 1.21.6 | 63 | 80 |
| 1.21.7 | 64 | 81 |
| 1.21.8 | 64 | 81 |
| 1.21.9 | 69.0 | 88.0 |
| 1.21.10 | 69.0 | 88.0 |
| 1.21.11 | 75.0 | 94.1 |
| 26.1 | 84.0 | 101.1 |
| 26.1.1 | 84.0 | 101.1 |
| 26.1.2 | 84.0 | 101.1 |

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

Official catalog red phase:

```bash
pnpm exec vitest run packages/datapack-adapter/src/resource-pack-profile.test.ts apps/mcp-server/src/source-bundle-resource-pack-profile.test.ts
```

Observed failure before catalog implementation:

```text
Expected supportLevel known_profile and packFormatStatus known.
Received supportLevel format_catalog_not_available and packFormatStatus metadata_only.
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
Tests  10 passed (10)
```

## Full Verification
Command:

```bash
pnpm test
```

Observed result:

```text
Test Files  108 passed (108)
Tests  344 passed (344)
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
      "supportLevel": "known_profile",
      "packFormatStatus": "known",
      "minecraftVersion": "1.20.1",
      "packFormatId": "15",
      "compatibleMinecraftVersions": [],
      "assetKinds": ["lang"],
      "semanticValidation": "not_available",
      "migrationAnalysis": "not_available",
      "notes": [
        "profile describes resource-pack metadata and observed asset kinds only",
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
- Official resource-pack format catalog from `1.18.2` through `26.1.2`.
- Runtime conflict detection, such as resource format `34` with runtime `1.20.1`.
- Missing `pack.mcmeta` handling without guessing a pack format.

Not implemented in this slice:

- Versioned asset schema validation.
- Resource-pack migration analysis.
