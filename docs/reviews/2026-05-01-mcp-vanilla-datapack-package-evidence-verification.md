# MCP Vanilla Datapack Package Evidence Verification
Date: 2026-05-01
Author: m1hono
Scope: `apps/mcp-server`, `packages/agent-harness`, `packages/source-package-manager`

## Purpose
本切片把已经完成的 generated vanilla datapack package 接进 MCP 证据链。

目标不是新增一个公开 MCP tool，而是保持渐进式 surface：agent 仍然通过 `mc_develop` 得到 route，再由 `source.bundle` 在 `datapack_files` 候选中按需读取官方 vanilla datapack package。

## Changed Behavior
- Harness 现在能把明确的 vanilla/official `minecraft:*` 或 `data/minecraft/...` datapack 请求路由到 `datapack_lookup`，即使 workspace 没有本地 datapack roots。
- Evidence plan 现在会给这类请求生成 `vanilla-datapack-package:minecraft:<version>:official` path hint，并把原因标为 generated vanilla datapack evidence。
- MCP datapack executor 在没有本地 datapack/resource roots 时，会尝试 generated vanilla datapack package fallback。
- Fallback 仍然走 `ensureSourcePackageInstalled`，所以没有显式确认时不会下载或安装。
- 安装后的包只读 `data/**`，不把 `assets/**` 混进 datapack evidence。

## Regression Coverage
新增测试覆盖了三个关键点：

- `packages/agent-harness/src/task-route.test.ts`: vanilla datapack lookup 在无本地 datapack roots 时仍路由到 `datapack_files`。
- `apps/mcp-server/src/evidence-plan.test.ts`: evidence plan 产出 generated vanilla datapack package hint。
- `apps/mcp-server/src/source-bundle-datapack-executor.test.ts`: 无本地 datapack roots、已有用户确认和本地官方 archive recipe 时，`source.bundle` 返回 `source: "vanilla_datapack"`。

这些测试在当前切片之前没有对应行为；本次最终验证使用当前实现跑过完整 suite。

## Verification
Full command:

```bash
pnpm test
```

Observed result:

```text
> @mcpskill/workspace@ test /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b && vitest run

Test Files  103 passed (103)
Tests  327 passed (327)
```

Guard commands:

```bash
git diff --check
```

Observed result:

```text
# no output
```

```bash
find apps packages tests -path '*/node_modules' -prune -o -path '*/dist' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Observed result:

```text
# no output
```

```bash
find . -path './node_modules' -prune -o -path './.git' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Observed result:

```text
# no output
```

## Actual MCP Executor Return
Command shape:

```bash
cd apps/mcp-server
pnpm exec tsx <<'TS'
# Creates a temporary Forge workspace with no local datapack roots.
# Writes explicit source-package confirmation.
# Creates a fixture official archive containing data/** and assets/**.
# Calls buildMcpServerSourceBundleExecutor through the datapack_files candidate.
TS
```

Observed compact output:

```json
{
  "matched": true,
  "summary": "Resolved 1 generated vanilla datapack evidence item(s).",
  "payload": {
    "source": "vanilla_datapack",
    "request": {
      "minecraftVersion": "1.20.1",
      "queries": [
        "minecraft:stone"
      ],
      "requestedPaths": []
    },
    "result": {
      "status": "ready",
      "packageId": "minecraft-1.20.1-vanilla-datapack-official",
      "resourceSummary": {
        "tokenPolicy": "counts_only",
        "rootCount": 1,
        "entryCount": 1,
        "byDomain": {
          "data": 1
        },
        "byKind": {
          "recipes": 1
        },
        "byNamespace": {
          "minecraft": 1
        },
        "skippedCount": 0,
        "truncated": false
      },
      "matches": [
        {
          "file": {
            "relativePath": "data/minecraft/recipes/stone.json",
            "namespace": "minecraft",
            "kind": "recipes",
            "domain": "data",
            "sizeBytes": 72
          },
          "line": 1,
          "column": 54,
          "preview": "{ \"type\": \"minecraft:crafting_shapeless\", \"result\": \"minecraft:stone\" }"
        }
      ]
    }
  }
}
```

The fixture archive also contained `assets/minecraft/lang/en_us.json`; it was intentionally absent from `resourceSummary` because this path is datapack-only.

## Boundary
Implemented:

- Generated vanilla datapack package evidence through the existing `mc_develop` route.
- Explicit confirmation gate preserved.
- Datapack-only `data/**` read/search/list behavior.
- Counts-only resource summary to avoid token waste.

Not implemented in this slice:

- Full versioned datapack schema validation.
- Datapack migration analysis from one Minecraft version to another.
- Vanilla assets package generation for `assets/**`.
- Real Mojang network download validation through the MCP executor; download/provider behavior is covered in the source-package-manager slice.
