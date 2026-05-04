# External-Case Resource-Pack Evidence Verification

Date: 2026-05-05
Author: m1hono

## Scope

This slice strengthens local datapack/resource-pack evidence for standard mod
workspace resource roots inspired by external cases under
`/Users/gedwen/Documents/programing/MC/_external`.

Observed external layouts included projects with both:

- `src/main/resources/pack.mcmeta`
- `src/main/resources/assets`
- `src/main/resources/data`
- `src/generated/resources/assets`
- `src/generated/resources/data`

Implemented behavior:

- discovered roots now return `rootRelativePath`;
- discovered roots and file entries now return `provenance`;
- file summaries now include `byProvenance`;
- `src/main/resources` is reported as `main_resources`;
- `src/generated/resources` is reported as `generated_resources`;
- binary content remains bounded because file listing still returns metadata,
  not image bytes.

No harness, Gradle, JAR, or MCP adapter code was changed.

## TDD Record

RED before implementation:

```text
$ pnpm --filter @mcpskill/datapack-adapter test -- --runInBand src/index.test.ts

FAIL packages/datapack-adapter/src/index.test.ts > datapack-adapter
  > reports standard mod workspace resource root provenance

Expected:
"rootRelativePath": "src/generated/resources"
"provenance": "generated_resources"

Received:
"rootRelativePath": undefined
"provenance": undefined
```

GREEN after implementation and test split:

```text
$ pnpm --filter @mcpskill/datapack-adapter test -- --runInBand src/resource-root-provenance.test.ts

Test Files  9 passed (9)
Tests  35 passed (35)
```

## Actual Returned Shape

Smoke command:

```sh
$ pnpm exec tsx <<'TS'
# Creates a temporary workspace with:
# - src/main/resources/pack.mcmeta
# - src/main/resources/assets/demo/lang/en_us.json
# - src/generated/resources/data/demo/recipes/gear.json
# - src/generated/resources/assets/demo/models/item/gear.json
#
# Then runs discoverDatapackContent, listDatapackFiles, and summarizeDatapackFiles.
TS
```

Returned value:

```json
{
  "roots": [
    {
      "rootRelativePath": "src/generated/resources",
      "rootKind": "mixed_pack_root",
      "provenance": "generated_resources",
      "hasPackMcmeta": false,
      "hasData": true,
      "hasAssets": true
    },
    {
      "rootRelativePath": "src/main/resources",
      "rootKind": "resource_pack_root",
      "provenance": "main_resources",
      "hasPackMcmeta": true,
      "hasData": false,
      "hasAssets": true
    }
  ],
  "entries": [
    {
      "rootRelativePath": "src/main/resources",
      "provenance": "main_resources",
      "relativePath": "assets/demo/lang/en_us.json",
      "domain": "assets",
      "kind": "lang"
    },
    {
      "rootRelativePath": "src/generated/resources",
      "provenance": "generated_resources",
      "relativePath": "assets/demo/models/item/gear.json",
      "domain": "assets",
      "kind": "models"
    },
    {
      "rootRelativePath": "src/generated/resources",
      "provenance": "generated_resources",
      "relativePath": "data/demo/recipes/gear.json",
      "domain": "data",
      "kind": "recipes"
    },
    {
      "rootRelativePath": "src/main/resources",
      "provenance": "main_resources",
      "relativePath": "pack.mcmeta",
      "domain": "assets",
      "kind": "pack_metadata"
    }
  ],
  "byProvenance": {
    "generated_resources": 1,
    "main_resources": 1
  }
}
```

## Verification

```text
$ pnpm --filter @mcpskill/datapack-adapter build

tsc -b
```

```text
$ find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'

# no output
```

## Risks

- `provenance` is path-shape based. Nonstandard Gradle source sets still fall
  back to `loose_workspace_root` unless they end in `src/main/resources` or
  `src/generated/resources`.
- The summary intentionally counts roots by provenance, not entries by
  provenance, to stay aligned with existing `byRootKind` behavior.
