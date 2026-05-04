# KubeJS Lifecycle And Resource Pack Evidence Verification

Date: 2026-05-05

## Scope

This slice keeps the public MCP surface unchanged and improves internal evidence:

- `probejs_types` now returns compact KubeJS lifecycle evidence for `ForgeEvents`, `ForgeModEvents`, `NativeEvents`, and `global` / `Global`.
- KubeJS scope inference is reusable from `@mcpskill/kubejs-language-service`.
- Resource pack lookup now maps `assets/<namespace>/blockstates/<path>.json` to `<namespace>:<path>`.

## Actual Payload Shapes

The KubeJS lifecycle evidence helper returns structured evidence like:

```json
{
  "lifecycleEvidence": {
    "selectedScope": "server",
    "selectedScriptFile": "kubejs/server_scripts/main.js",
    "declarationScopes": ["server"],
    "requestMentions": ["server_scripts", "server"]
  },
  "nativeEventEvidence": {
    "forgeEvents": {
      "requested": true,
      "availability": "verified_by_probejs",
      "declarationFiles": [".probe/server/events.d.ts"],
      "selectedScope": "server",
      "warnings": [
        "Core KubeJS 1.20.1 exposes ForgeEvents as startup-only; require ProbeJS/addon evidence before using it in reloadable scopes."
      ]
    },
    "nativeEvents": {
      "requested": true,
      "availability": "verified_by_probejs",
      "declarationFiles": [".probe/server/events.d.ts"],
      "selectedScope": "server",
      "warnings": []
    }
  }
}
```

Global state evidence returns ownership-style facts instead of generic JS advice:

```json
{
  "globalStateEvidence": {
    "usageCount": 3,
    "keys": ["data", "machineCache", "recipeOwner"],
    "riskyKeys": ["data"],
    "usages": [
      {
        "file": "kubejs/server_scripts/main.js",
        "line": 1,
        "scope": "server",
        "object": "global",
        "key": "machineCache",
        "operation": "write"
      },
      {
        "object": "Global",
        "key": "recipeOwner",
        "operation": "call"
      },
      {
        "key": "data",
        "operation": "read"
      }
    ]
  }
}
```

Resource pack resource-location matching now includes blockstates:

```json
{
  "query": "demo:block/gear",
  "matchedAssetPaths": [
    "assets/demo/blockstates/block/gear.json",
    "assets/demo/models/block/gear.json",
    "assets/demo/textures/block/gear.png"
  ]
}
```

## Verification Commands

```sh
pnpm --filter @mcpskill/mcp-server test
pnpm --filter @mcpskill/kubejs-language-service test
pnpm --filter @mcpskill/datapack-adapter test
pnpm typecheck
pnpm test
git diff --check
find . \( -path './node_modules' -o -path './.git' -o -path './dist' -o -path './.turbo' \) -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

## Results

- `@mcpskill/mcp-server`: 63 test files passed, 178 tests passed.
- `@mcpskill/kubejs-language-service`: 4 test files passed, 18 tests passed.
- `@mcpskill/datapack-adapter`: 9 test files passed, 38 tests passed.
- `pnpm typecheck`: passed.
- `pnpm test`: 147 test files passed, 478 tests passed.
- `git diff --check`: passed with no output.
- TS/TSX line guard: passed with no files over 500 lines.

## Reference Review

Two external MCP projects were reviewed read-only as architecture references. The useful parts are optional SQLite/FTS package design, source generation/cache locking, line-limited source reads, and archive indexing. The current project should not copy their broad public tool surfaces; this slice keeps `mc_develop` as the progressive public entry point.

## Residual Risks

- Global key detection is intentionally compact and regex-based; dynamic keys such as `global[key]` still need a future lower-confidence evidence mode.
- `ForgeEvents` and `NativeEvents` evidence reports declaration presence, not runtime addon truth. The agent must still treat the payload as provenance, not permission to invent usage.
