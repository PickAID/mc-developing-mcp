# Datapack Pack Format Migration Analysis Verification
Date: 2026-05-01
Author: m1hono
Scope: `packages/datapack-adapter`, `apps/mcp-server`

## Purpose
本切片补上第一层 datapack migration 服务能力。

它不是完整 JSON schema 重写器，而是基于本地官方 datapack pack format catalog 做可验证的版本迁移摘要：

- source/target Minecraft version 是否在本地 catalog 中。
- source/target datapack pack format。
- 迁移方向：upgrade、downgrade、same_version。
- pack format 是否变化。
- 必要动作：例如更新 `pack.mcmeta` 的 `pack.pack_format`。
- 项目中实际出现的 datapack data kind 粗粒度风险提示，例如 `recipes`、`worldgen`、`tags`。

## Red Phase
Bottom-layer command:

```bash
pnpm exec vitest run packages/datapack-adapter/src/migration-analysis.test.ts
```

Observed failure:

```text
Cannot find module './migration-analysis.js'
```

Minor pack-format delta regression command:

```bash
pnpm exec vitest run packages/datapack-adapter/src/migration-analysis.test.ts
```

Observed failure before fixing decimal-stable delta calculation:

```text
Expected numericDelta: 6.1
Received numericDelta: 6.099999999999994
```

Observed-data-kind risk hint command:

```bash
pnpm exec vitest run packages/datapack-adapter/src/migration-analysis.test.ts apps/mcp-server/src/source-bundle-datapack-version-profile.test.ts
```

Observed failure before implementation:

```text
Expected riskHints for recipes/worldgen/other.
Received no riskHints in bottom-layer analysis and undefined riskHints in MCP payload.
```

MCP command:

```bash
pnpm exec vitest run apps/mcp-server/src/source-bundle-datapack-version-profile.test.ts
```

Observed failure:

```text
Expected payload.datapackMigrationAnalysis,
received payload with datapackVersionProfile only.
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
  packages/datapack-adapter/src/migration-analysis.test.ts \
  apps/mcp-server/src/source-bundle-datapack-version-profile.test.ts
```

Observed result:

```text
Test Files  2 passed (2)
Tests  8 passed (8)
```

## Full Verification
Command:

```bash
pnpm test
```

Observed result:

```text
Test Files  106 passed (106)
Tests  339 passed (339)
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
Command shape:

```bash
cd apps/mcp-server
pnpm exec tsx <<'TS'
# Creates a temporary datapack with pack_format 15.
# Builds an MCP request: "Analyze datapack migration from 1.20.1 to 1.21.1."
# Calls buildMcpServerSourceBundleExecutor through the datapack_files candidate.
TS
```

Observed compact output:

```json
{
  "matched": true,
  "summary": "Listed 2 local datapack or asset file(s).",
  "payload": {
    "source": "datapack_files",
    "datapackMigrationAnalysis": {
      "tokenPolicy": "compact_migration",
      "status": "ready",
      "direction": "upgrade",
      "compatibility": "pack_format_changed",
      "from": {
        "minecraftVersion": "1.20.1",
        "packFormat": 15,
        "packFormatId": "15"
      },
      "to": {
        "minecraftVersion": "1.21.1",
        "packFormat": 48,
        "packFormatId": "48"
      },
      "packFormatChange": {
        "fromPackFormatId": "15",
        "toPackFormatId": "48",
        "numericDelta": 33
      },
      "requiredActions": [
        {
          "kind": "update_pack_format",
          "summary": "Update pack.mcmeta pack.pack_format from 15 to 48."
        }
      ],
      "riskHints": [
        {
          "kind": "recipes",
          "severity": "medium",
          "summary": "Review recipe JSON and ingredient/item references against the target version."
        }
      ],
      "notes": [
        "This is a pack-format migration summary, not full JSON schema rewriting."
      ]
    }
  }
}
```

## Changed Behavior
- Added `analyzeDatapackVersionMigration(...)` to `@mcpskill/datapack-adapter`.
- Exported migration analysis types from the datapack adapter public API.
- Added compact `riskHints` for observed datapack data kinds.
- MCP datapack/resource executor now parses simple migration requests:
  - `from 1.20.1 to 1.21.1`
  - `1.20.1 -> 1.21.1`
  - `从 1.20.1 到 1.21.1`
- When parsed, payload includes `datapackMigrationAnalysis` beside `datapackVersionProfile`.
- MCP risk hints are driven by discovered local `data/**` kinds, so absent datapack areas do not consume payload space.

## Boundaries
Implemented:

- Pack-format migration summaries for known versions in the local official catalog.
- Unknown source/target version reporting without guessing.
- Minor-aware same-format compatibility, such as `1.21.9 -> 1.21.10`.
- Decimal-stable numeric deltas for minor-aware pack formats, such as `1.21.10 -> 1.21.11`.
- Coarse risk hints for observed datapack data kinds only.

Not implemented in this slice:

- Per-file JSON schema validation.
- Automatic JSON rewriting.
- Detailed data kind schema migrations for recipes, loot tables, worldgen, tags, predicates, advancements, or registries.
