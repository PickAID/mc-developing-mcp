# Datapack Official Version Catalog Verification
Date: 2026-04-30
Author: m1hono
Scope: `packages/datapack-adapter`, `apps/mcp-server`

## Purpose
本切片把 datapack version profile 从少量示例值升级为官方 release catalog。

重要边界：

- 这里支持的是 datapack profile / pack format 识别，不是完整 JSON schema 语义校验。
- `semanticValidation` 仍然明确返回 `not_available`。
- `migrationAnalysis` 仍然明确返回 `not_available`。
- datapack pack format 与 resource pack pack format 已分开处理。本切片只修 datapack。

## Official Evidence Source
可靠来源是 Mojang/Piston 官方版本数据：

- `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`
- 每个 release 的 manifest JSON 中 `downloads.server.url`
- 官方 `server.jar!/version.json` 中的 `pack_version.data` 或 `pack_version.data_major/data_minor`

1.21.10 以后 datapack pack format 支持 minor version，所以 profile 同时输出：

- `packFormat`: 向后兼容的数字，例如 `101.1`
- `packFormatId`: 精确保留 minor 表达，例如 `101.1`
- `packFormatVersion`: 结构化表达，例如 `{ "major": 101, "minor": 1, "id": "101.1" }`

确认表：

| MC Version | Official datapack format |
| --- | ---: |
| 1.18.2 | 9 |
| 1.19 | 10 |
| 1.19.1 | 10 |
| 1.19.2 | 10 |
| 1.19.3 | 10 |
| 1.19.4 | 12 |
| 1.20 | 15 |
| 1.20.1 | 15 |
| 1.20.2 | 18 |
| 1.20.3 | 26 |
| 1.20.4 | 26 |
| 1.20.5 | 41 |
| 1.20.6 | 41 |
| 1.21 | 48 |
| 1.21.1 | 48 |
| 1.21.2 | 57 |
| 1.21.3 | 57 |
| 1.21.4 | 61 |
| 1.21.5 | 71 |
| 1.21.6 | 80 |
| 1.21.7 | 81 |
| 1.21.8 | 81 |
| 1.21.9 | 88.0 |
| 1.21.10 | 88.0 |
| 1.21.11 | 94.1 |
| 26.1 | 101.1 |
| 26.1.1 | 101.1 |
| 26.1.2 | 101.1 |

## Actual Method Returns
Command:

```bash
pnpm exec tsx <<'TS'
# runs resolveDatapackVersionProfile against temporary runtime-only,
# pack_format 48, and min_format/max_format 101.1 workspaces
TS
```

Observed compact output:

```json
{
  "runtimeOnly_1_18_2": {
    "source": "runtime",
    "supportLevel": "known_profile",
    "packFormatStatus": "known",
    "minecraftVersion": "1.18.2",
    "packFormat": 9,
    "packFormatId": "9",
    "packFormatVersion": { "major": 9, "minor": 0, "id": "9" },
    "compatibleMinecraftVersions": [],
    "semanticValidation": "not_available",
    "migrationAnalysis": "not_available"
  },
  "runtimeOnly_1_21_1": {
    "source": "runtime",
    "supportLevel": "known_profile",
    "packFormatStatus": "known",
    "minecraftVersion": "1.21.1",
    "packFormat": 48,
    "packFormatId": "48",
    "packFormatVersion": { "major": 48, "minor": 0, "id": "48" },
    "compatibleMinecraftVersions": [],
    "semanticValidation": "not_available",
    "migrationAnalysis": "not_available"
  },
  "runtimeOnly_26_1": {
    "source": "runtime",
    "supportLevel": "known_profile",
    "packFormatStatus": "known",
    "minecraftVersion": "26.1",
    "packFormat": 101.1,
    "packFormatId": "101.1",
    "packFormatVersion": { "major": 101, "minor": 1, "id": "101.1" },
    "compatibleMinecraftVersions": [],
    "semanticValidation": "not_available",
    "migrationAnalysis": "not_available"
  },
  "pack48_runtime_1_21_1": {
    "source": "pack_mcmeta_and_runtime",
    "supportLevel": "known_profile",
    "packFormatStatus": "known",
    "minecraftVersion": "1.21.1",
    "packFormat": 48,
    "packFormatId": "48",
    "packFormatVersion": { "major": 48, "minor": 0, "id": "48" },
    "compatibleMinecraftVersions": [],
    "semanticValidation": "not_available",
    "migrationAnalysis": "not_available"
  },
  "minMax_101_1": {
    "source": "pack_mcmeta",
    "supportLevel": "known_profile",
    "packFormatStatus": "known",
    "minecraftVersion": "26.1.2",
    "packFormat": 101.1,
    "packFormatId": "101.1",
    "packFormatVersion": { "major": 101, "minor": 1, "id": "101.1" },
    "supportedFormats": {
      "minInclusive": 101,
      "maxInclusive": 101,
      "minFormat": { "major": 101, "minor": 1, "id": "101.1" },
      "maxFormat": { "major": 101, "minor": null, "id": "101.*" }
    },
    "compatibleMinecraftVersions": ["26.1", "26.1.1", "26.1.2"],
    "semanticValidation": "not_available",
    "migrationAnalysis": "not_available"
  }
}
```

## Test Verification
Red phase:

```text
pnpm exec vitest run packages/datapack-adapter/src/version-profile.test.ts

Test Files  1 failed (1)
Tests  4 failed | 3 passed (7)
```

The failures confirmed the intended missing behavior:

- 1.18.2 was `unknown_version` instead of `known_profile`.
- 1.20.6 and 1.21.1 used stale resource-pack-like values instead of datapack values.
- `pack_format: 48` plus runtime `1.21.1` was not treated as compatible evidence.
- `min_format` / `max_format` with minor versions was ignored.

Green targeted phase:

```text
pnpm typecheck && pnpm exec vitest run \
  packages/datapack-adapter/src/version-profile.test.ts \
  apps/mcp-server/src/source-bundle-datapack-version-profile.test.ts

Test Files  2 passed (2)
Tests  9 passed (9)
```

Package test:

```text
pnpm --filter @mcpskill/datapack-adapter test

Test Files  3 passed (3)
Tests  17 passed (17)
```

Full verification:

```text
pnpm test

Test Files  103 passed (103)
Tests  322 passed (322)
```

Guards:

```text
git diff --check
# no output

find apps packages tests ... '*.ts' '*.tsx' ... | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
# no output

find . ... -name '*.go' -o -name 'go.mod' -o -name 'go.sum'
# no output
```

## Implementation Notes
Changed structure:

- `packages/datapack-adapter/src/pack-format.ts`: parses `pack_format`, `supported_formats`, `min_format`, and `max_format`, including minor format comparison.
- `packages/datapack-adapter/src/version-profile-catalog.ts`: stores the official release profile catalog from 1.18.2 through 26.1.2.
- `packages/datapack-adapter/src/version-profile.ts`: now only merges runtime evidence and pack metadata evidence.
- `apps/mcp-server/src/source-bundle-datapack.ts`: compact MCP payload now includes `packFormatId` and `packFormatVersion`.

Behavior fixes:

- `1.20.6` is datapack format `41`, not `26`.
- `1.21.1` is datapack format `48`, not `34`.
- `1.21.4` is datapack format `61`, not `46`.
- `supported_formats: [15, 34]` now maps only to datapack-compatible releases `1.20` through `1.20.4` in this catalog, not to resource-pack values.
- New-style `min_format: [101, 1]` and `max_format: 101` maps to `26.1`, `26.1.1`, and `26.1.2`.

## Remaining Work
This does not complete “all-version datapack support” in the semantic sense.

Still required:

- Versioned JSON schema validation for recipes, tags, worldgen, predicates, loot tables, advancements, functions, and registry JSON.
- Datapack migration analysis between source and target MC versions.
- On-demand official vanilla data extraction as a generated local cache, not stored in the repository.
- Real modpack/datapack scenario verification after schema and migration layers exist.
