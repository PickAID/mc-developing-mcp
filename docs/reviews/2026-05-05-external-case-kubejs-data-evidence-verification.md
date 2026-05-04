# KubeJS Data Evidence Verification

Date: 2026-05-05

## Scope

Task KubeJS-Data-A added a bottom-layer ProbeJS resource evidence improvement
without touching harness, datapack, Gradle, or JAR adapters.

Changed implementation:

- `packages/kubejs-types-adapter/src/dts-resource-extractor.ts`
- `packages/kubejs-types-adapter/src/semantic-extractors.ts`
- `packages/kubejs-types-adapter/src/semantic-files.ts`
- `packages/kubejs-types-adapter/src/types.ts`

Changed tests:

- `packages/kubejs-types-adapter/src/dts-resource-extractor.test.ts`

## Behavior Added

ProbeJS `.d.ts` files discovered under ProbeJS roots now contribute compact
semantic resource entries when they contain string-literal Minecraft resource
IDs in KubeJS/ProbeJS resource contexts:

- item declarations such as `ProbeItemIds`;
- fluid declarations such as `ProbeFluidIds`;
- item tag declarations such as `ProbeItemTags`;
- registry declarations such as `ProbeRegistries`.

The extractor does not index arbitrary TypeScript symbols or generic JavaScript
strings. A literal such as `"demo:not_indexed"` in `GenericIds` is ignored.

The existing checked fixtures were:

- `testdata/scenarios/prism_probe_instance/PrismLauncher/instances/LostCivilization/minecraft/kubejs/probe/probe.d.ts`
- `testdata/scenarios/workspace_probe_dts/kubejs/probe/types.d.ts`

Those fixtures currently contain ProbeJS declaration globals but no resource
literal unions, so this slice adds focused test coverage with actual returned
resource values.

## Actual Returned Shape

Smoke command used a temporary KubeJS/ProbeJS workspace containing
`.probe/server/resources.d.ts`.

```json
{
  "entries": {
    "snippet": [],
    "item": [
      {
        "name": "minecraft:stone",
        "value": "minecraft:stone",
        "sourceFormat": "probe-dts-resource-literal",
        "extractorId": "probe-dts-resource-literal-v1",
        "confidence": 0.72,
        "lineNumber": 2,
        "file": ".probe/server/resources.d.ts"
      },
      {
        "name": "kubejs:copper_coin",
        "value": "kubejs:copper_coin",
        "sourceFormat": "probe-dts-resource-literal",
        "extractorId": "probe-dts-resource-literal-v1",
        "confidence": 0.72,
        "lineNumber": 3,
        "file": ".probe/server/resources.d.ts"
      }
    ],
    "registry": [
      {
        "name": "minecraft:block",
        "value": "minecraft:block",
        "sourceFormat": "probe-dts-resource-literal",
        "extractorId": "probe-dts-resource-literal-v1",
        "confidence": 0.72,
        "lineNumber": 6,
        "file": ".probe/server/resources.d.ts"
      }
    ],
    "fluid": [
      {
        "name": "minecraft:water",
        "value": "minecraft:water",
        "sourceFormat": "probe-dts-resource-literal",
        "extractorId": "probe-dts-resource-literal-v1",
        "confidence": 0.72,
        "lineNumber": 4,
        "file": ".probe/server/resources.d.ts"
      }
    ],
    "tag": [
      {
        "name": "forge:ingots/iron",
        "value": "#forge:ingots/iron",
        "sourceFormat": "probe-dts-resource-literal",
        "extractorId": "probe-dts-resource-literal-v1",
        "confidence": 0.72,
        "lineNumber": 5,
        "file": ".probe/server/resources.d.ts"
      }
    ],
    "language_key": [],
    "class": []
  },
  "summary": {
    "counts": {
      "snippet": 0,
      "item": 2,
      "registry": 1,
      "fluid": 1,
      "tag": 1,
      "language_key": 0,
      "class": 0
    },
    "discoveredFiles": 1,
    "searchedFiles": 1,
    "unknownCount": 0,
    "truncated": false
  }
}
```

## Verification

Targeted tests:

```sh
pnpm exec tsc -b packages/kubejs-types-adapter
pnpm exec vitest run packages/kubejs-types-adapter/src/discovery.test.ts packages/kubejs-types-adapter/src/summary.test.ts packages/kubejs-types-adapter/src/summary-filter.test.ts packages/kubejs-types-adapter/src/dts-resource-extractor.test.ts
pnpm exec vitest run apps/mcp-server/src/probejs-types-executor.test.ts apps/mcp-server/src/probejs-resource-cache.test.ts
```

Result:

- 4 test files passed.
- 16 tests passed.
- 2 MCP ProbeJS test files passed.
- 8 MCP ProbeJS tests passed.

Package script note:

- `pnpm --filter @mcpskill/kubejs-types-adapter test` passed.
- The package test script does not include the new test file, and package
  metadata was not edited because it is outside this task's allowed write scope.

Line and whitespace guards:

```sh
git diff --check
find packages/kubejs-types-adapter/src packages/kubejs-language-service/src apps/mcp-server/src -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Both guards produced no findings.

## Risks

- The `.d.ts` extractor is intentionally heuristic and context-based. It avoids
  broad TypeScript indexing, but unusual ProbeJS naming may be missed until a
  concrete generated shape is added as evidence.
- Registry literal extraction currently identifies registry-like declarations
  but does not infer a `registryType` unless the declaration context includes a
  `typeX` name.
