# MCP Vanilla Assets Reference Trace Verification
Date: 2026-05-01
Author: m1hono
Scope: `apps/mcp-server`

## Purpose
本切片让 generated vanilla assets package 支持显式资源引用追踪。

场景：

- workspace 没有本地 `assets/**` roots。
- 用户明确请求 vanilla/official `assets/minecraft/...`。
- 请求包含 trace/reference/missing 等追踪意图。
- 已有用户确认的 generated vanilla assets package。

此时 `mc_develop` 仍通过 `source.bundle` 的 `datapack_files` 候选返回证据，不新增 public MCP tool。

## Red Phase
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts
```

Observed failure:

```text
Test Files  1 failed (1)
Tests  1 failed | 1 passed (2)

Expected payload.result.resourceReferenceTrace,
received payload.result without resourceReferenceTrace.
```

## Green Phase
Targeted command:

```bash
pnpm exec vitest run \
  apps/mcp-server/src/source-bundle-vanilla-assets-executor.test.ts \
  apps/mcp-server/src/source-bundle-datapack-executor.test.ts
```

Observed result:

```text
Test Files  2 passed (2)
Tests  7 passed (7)
```

## Actual MCP Executor Return
Command shape:

```bash
cd apps/mcp-server
pnpm exec tsx <<'TS'
# Creates a temporary Forge workspace with no local resource roots.
# Writes explicit confirmation for minecraft-1.20.1-vanilla-assets-official.
# Creates a fixture client archive with blockstate -> model -> texture assets.
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
    "result": {
      "status": "ready",
      "packageId": "minecraft-1.20.1-vanilla-assets-official",
      "resourceSummary": {
        "tokenPolicy": "counts_only",
        "rootCount": 1,
        "entryCount": 3,
        "byDomain": {
          "assets": 3
        },
        "byKind": {
          "blockstates": 1,
          "models": 1,
          "textures": 1
        },
        "byNamespace": {
          "minecraft": 3
        },
        "skippedCount": 0,
        "truncated": false
      },
      "resourceReferenceTrace": {
        "tokenPolicy": "explicit_trace",
        "startPaths": [
          "assets/minecraft/blockstates/stone.json"
        ],
        "referenceCount": 2,
        "unresolvedCount": 0,
        "references": [
          {
            "fromPath": "assets/minecraft/blockstates/stone.json",
            "fromKind": "blockstates",
            "relation": "blockstate_model",
            "value": "minecraft:block/stone",
            "toPath": "assets/minecraft/models/block/stone.json",
            "toKind": "models",
            "status": "resolved"
          },
          {
            "fromPath": "assets/minecraft/models/block/stone.json",
            "fromKind": "models",
            "relation": "model_texture",
            "value": "minecraft:block/stone",
            "toPath": "assets/minecraft/textures/block/stone.png",
            "toKind": "textures",
            "status": "resolved"
          }
        ],
        "unresolved": [],
        "skippedCount": 0,
        "truncated": false
      }
    }
  }
}
```

## Changed Behavior
- Generated vanilla resource package executor now accepts `requestText`.
- It traces references only when:
  - requested paths include traceable `assets/**` blockstate/model JSON;
  - request text contains trace/reference/dependency/missing intent.
- Trace output is compact and explicit:
  - `tokenPolicy: "explicit_trace"`;
  - counts first;
  - reference edges only, no broad file dumps.
- Existing generated vanilla datapack evidence reuses the same shared executor and is covered by regression tests.

## Boundaries
Implemented:

- `blockstates -> models -> textures` trace over generated vanilla assets packages.
- Resolved and unresolved reference accounting through the existing datapack/resource adapter.

Not implemented in this slice:

- Full semantic validation of model/blockstate JSON.
- Cross-version resource-pack migration analysis.
- Broad automatic trace without explicit user intent.
