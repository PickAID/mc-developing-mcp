# Anonymized Resource Patterns Verification

## Scope

Added generic resource evidence for advanced visual asset patterns while keeping
fixture names invented and binary asset contents out of summaries.

## Returned Shapes

Jar archive summary for the visual fixture returned:

```json
{
  "entries": [],
  "assetSummary": {
    "assetEntryCount": 6,
    "uiAssetCount": 3,
    "byKind": {
      "atlas": 1,
      "block_entity_renderer_asset": 1,
      "connected_texture_metadata": 1,
      "custom_model_format": 1,
      "gui_sprite": 1,
      "lang": 1
    }
  },
  "truncated": true
}
```

Loose generated-resource summary for the visual fixture returned:

```json
{
  "rootCount": 2,
  "entryCount": 4,
  "byDomain": {
    "assets": 4
  },
  "byProvenance": {
    "generated_resources": 1,
    "main_resources": 1
  },
  "byKind": {
    "block_entity_renderer_asset": 1,
    "connected_texture_metadata": 1,
    "custom_model_format": 1,
    "pack_metadata": 1
  },
  "byNamespace": {
    "": 1,
    "demo": 3
  },
  "skipped": [],
  "truncated": false
}
```

Both tests assert that summaries do not contain representative descriptor/model
paths. PNG fixtures are bounded and never returned in summary payloads.

Post-review hardening expanded anonymous visual classification to cover legacy
connected-texture metadata roots, common block-entity-renderer texture folders,
and explicit `data/<namespace>/registry/**` roots.

## Verification

Commands run:

```sh
pnpm vitest run --root ../.. packages/jar-source-adapter/src/mod-archive-entry-index.test.ts
pnpm vitest run --root ../.. packages/datapack-adapter/src/resource-root-provenance.test.ts
pnpm --filter @mcpskill/datapack-adapter build
pnpm --filter @mcpskill/jar-source-adapter build
pnpm vitest run --root ../.. packages/jar-source-adapter/src/mod-archive-entry-index.test.ts packages/datapack-adapter/src/resource-root-provenance.test.ts
pnpm --filter @mcpskill/datapack-adapter test
pnpm --filter @mcpskill/jar-source-adapter test
pnpm typecheck
pnpm test
wc -l packages/jar-source-adapter/src/mod-archive-asset-kind.ts packages/jar-source-adapter/src/mod-archive-entry-index.test.ts packages/datapack-adapter/src/types.ts packages/datapack-adapter/src/kinds.ts packages/datapack-adapter/src/file-entry.ts packages/datapack-adapter/src/resource-pack-migration-analysis.ts packages/datapack-adapter/src/resource-root-provenance.test.ts docs/reviews/2026-05-05-anonymized-resource-patterns-verification.md
```

Latest full verification: `pnpm test` passed with 146 test files and 471 tests.

## Risks

Classification is path-pattern based. It intentionally records anonymized kind
evidence only, so it does not infer semantic ownership or validate descriptor
contents.
