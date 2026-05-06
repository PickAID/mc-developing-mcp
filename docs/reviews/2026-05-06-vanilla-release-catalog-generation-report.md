# Vanilla Release Catalog Generation Report

Date: 2026-05-06

## Scope

This slice connects the public `minecraft-release-catalog` package to local vanilla generation targets.

The implementation does not distribute Minecraft source code, remapped source code, generated vanilla data, generated assets, mappings, ProbeJS dumps, embeddings, or private modpack indexes. It only maps official release catalog entries to consent-gated local generation coordinates.

## Implemented

- Added `planVanillaReleaseGenerationFromCatalog` in `@mcpskill/source-package-manager`.
- Added `planAllVanillaReleaseGenerationTargets` for catalog-wide target planning.
- Generation targets currently cover `source-pack`, `datapack`, `resource-pack`, and `assets`.
- Every target is marked `requiresUserConsent: true` and `distributionPolicy: "local-generation-only"`.
- Exported the planner from `@mcpskill/source-package-manager`.
- Expanded the `mdm-sources` smoke test to build and cache `required`, `datapack`, `resourcepack`, and `mappings` release channels.

## Verified Outputs

Command:

```sh
pnpm test
```

Result:

```text
Test Files  183 passed (183)
Tests       653 passed (653)
```

Command:

```sh
pnpm --filter @mcpskill/source-package-manager test
```

Result:

```text
Test Files  13 passed (13)
Tests       56 passed (56)
```

Command:

```sh
pnpm --filter @mcpskill/resource-registry test
```

Result:

```text
Test Files  8 passed (8)
Tests       30 passed (30)
```

Command:

```sh
node --test tests/*.test.mjs && node tools/validate.mjs
```

Working directory:

```text
/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources
```

Result:

```text
tests 13
pass 13
packageCount: 13
errorCount: 0
```

Line count check:

```text
141 packages/source-package-manager/src/vanilla-release-catalog.ts
146 packages/source-package-manager/src/vanilla-release-catalog.test.ts
243 packages/resource-registry/src/mdm-sources-smoke.test.ts
```

## Concrete Catalog Behavior

For `26.1.2`, the planner produces:

```text
minecraft-26.1.2-source-pack-named
minecraft-26.1.2-vanilla-datapack-official
minecraft-26.1.2-vanilla-resource-pack-official
minecraft-26.1.2-vanilla-assets-official
```

For the sibling `mdm-sources` catalog, the planner maps every official release entry in the catalog and confirms:

```text
latest release entry -> catalog.latest.release
oldest release entry -> 1.0
target count per tested release -> datapack, resource-pack, assets
```

## Remaining Work

- Wire this planner into `mc_develop` routing so the MCP can present generated vanilla targets when a user asks for unsupported or unseeded versions.
- Add a direct provider-level test that resolves fake Mojang metadata into remote recipe steps without executing archive downloads.
- Preserve catalog-specific v2 schema metadata through `resource-registry` if downstream routing needs schema-level dispatch instead of release family dispatch.
