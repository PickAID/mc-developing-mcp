# MCP Vanilla Assets Package Evidence Verification
Date: 2026-05-01
Author: m1hono
Scope: `apps/mcp-server`, `packages/agent-harness`

## Purpose
本切片把 generated vanilla assets package 接进 MCP 证据链。

保持既定设计：

- 不新增 MCP public tool。
- agent 仍通过 `mc_develop` 进入渐进式 route。
- `source.bundle` 在 `datapack_files` 内部处理 datapack/resource evidence。
- 没有本地 `assets/**` roots 时，明确 vanilla/official `assets/minecraft/...` 请求才会尝试 generated vanilla assets package。
- 下载/安装仍由 source package manager 的 explicit confirmation gate 控制。

## Red Phase
Command:

```bash
pnpm exec vitest run \
  packages/agent-harness/src/task-route.test.ts \
  apps/mcp-server/src/evidence-plan.test.ts \
  apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts
```

Observed failure:

```text
Test Files  3 failed (3)
Tests  3 failed | 17 passed (20)

buildHarnessTaskRoute:
expected datapack_lookup, received workspace_default

buildMcpServerEvidencePlan:
expected candidate-1-datapack_files with vanilla-assets-package hint,
received candidate-1-workspace_source

source.bundle vanilla assets package execution:
datapack_files candidate missing
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
  packages/agent-harness/src/task-route.test.ts \
  apps/mcp-server/src/evidence-plan.test.ts \
  apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts \
  apps/mcp-server/src/source-bundle-datapack-executor.test.ts
```

Observed result:

```text
Test Files  4 passed (4)
Tests  25 passed (25)
```

## Actual MCP Executor Return
Command shape:

```bash
cd apps/mcp-server
pnpm exec tsx <<'TS'
# Creates a temporary Forge workspace with no local resource roots.
# Writes explicit confirmation for minecraft-1.20.1-vanilla-assets-official.
# Creates a fixture official client archive containing assets/** and data/**.
# Calls buildMcpServerSourceBundleExecutor through the datapack_files candidate.
TS
```

Observed compact output:

```json
{
  "matched": true,
  "summary": "Resolved 1 generated vanilla assets evidence item(s).",
  "payload": {
    "source": "vanilla_assets",
    "request": {
      "minecraftVersion": "1.20.1",
      "queries": [],
      "requestedPaths": [
        "assets/minecraft/models/item/stone.json"
      ]
    },
    "result": {
      "status": "ready",
      "packageId": "minecraft-1.20.1-vanilla-assets-official",
      "resourceSummary": {
        "tokenPolicy": "counts_only",
        "rootCount": 1,
        "entryCount": 1,
        "byDomain": {
          "assets": 1
        },
        "byKind": {
          "models": 1
        },
        "byNamespace": {
          "minecraft": 1
        },
        "skippedCount": 0,
        "truncated": false
      },
      "reads": [
        {
          "file": {
            "relativePath": "assets/minecraft/models/item/stone.json",
            "namespace": "minecraft",
            "kind": "models",
            "domain": "assets",
            "sizeBytes": 38
          },
          "content": "{\"parent\":\"minecraft:item/generated\"}\n"
        }
      ]
    }
  }
}
```

The fixture archive also contained `data/minecraft/recipes/stone.json`; it was intentionally absent from `resourceSummary` because the generated package is assets-only.

## Changed Behavior
- Harness routes explicit vanilla/official `assets/minecraft/...` requests to `datapack_lookup` even without local resource roots.
- Evidence plan emits `vanilla-assets-package:minecraft:<version>:official` path hints.
- `source.bundle` can read/search/list installed generated vanilla assets packages.
- The datapack package executor was refactored to share a generic generated vanilla resource package executor instead of duplicating the install/read/search/list pipeline.

## Boundaries
Implemented:

- MCP-side generated vanilla assets evidence fallback.
- Confirmation-gated package install/read path.
- Counts-only summary and explicit path reads.
- Existing vanilla datapack evidence behavior preserved by regression tests.

Not implemented in this slice:

- Resource reference tracing over generated vanilla assets packages.
- Semantic validation of vanilla asset JSON formats.
- Resource-pack migration analysis across Minecraft versions.
