# Data Generation Reference (Forge 1.20.1 / NeoForge 1.21.1)
This document is an architecture reference for AI code generation.
It defines datagen surfaces, provider composition, loader differences, and verification points.

## Scope and Constraints
| Field | Value |
|---|---|
| Target loaders | Forge 1.20.1, NeoForge 1.21.1 |
| Generation model | Compile-time JSON emission via `runData` |
| Output domain | recipes, tags, loot, models, blockstates, lang, advancements, worldgen |
| Goal | Produce deterministic generated artifacts with stable keys |
| Anti-goal | Tutorial prose, runtime mutation, unverified API assumptions |

## What Datagen Is
Datagen is a compile-time pipeline that writes JSON resources from provider code.
- Inputs: provider registration, registry keys, builder calls, existing asset references.
- Process: `GatherDataEvent` wires providers into a `DataGenerator` run.
- Output: generated resources, typically under `src/generated/resources`.
- Runtime role: generated JSON is consumed like normal data pack or asset content.
Design invariant: provider code is authoring surface; JSON is deployment artifact.

## GatherDataEvent and DataGenerator Setup
`GatherDataEvent` is the registration surface for datagen providers.
- Pull generator/output handles from event (`getGenerator`, `getPackOutput` patterns).
- Gate provider registration with `event.includeClient()` and `event.includeServer()`.
- Register every provider explicitly; unregistered domains emit nothing.
Execution flow:
1. Subscribe to `GatherDataEvent` on the mod event bus.
2. Construct providers with output and lookup dependencies.
3. Add providers to the generator with include flags.
4. Run `gradlew runData`.

## Provider Graph Overview
| Provider family | Primary output | Typical dependency surface |
|---|---|---|
| `RecipeProvider` | `data/<ns>/recipes/*.json` | block/item refs, serializers |
| `BlockTagsProvider` | `data/<ns>/tags/blocks/*.json` | block/tag keys |
| `ItemTagsProvider` | `data/<ns>/tags/items/*.json` | item/tag keys, block tag copy contracts |
| `LootTableProvider` | `data/<ns>/loot_tables/**/*.json` | block/entity refs, conditions/functions |
| `BlockStateProvider` (Forge) | `assets/<ns>/blockstates/*.json` + block models | `ExistingFileHelper`, state variants |
| `ItemModelProvider` (Forge) | `assets/<ns>/models/item/*.json` | model parents, texture layers |
| `LanguageProvider` | `assets/<ns>/lang/*.json` | translation keys |
| `AdvancementProvider` | `data/<ns>/advancements/**/*.json` | triggers, criteria, parent graph |

## RecipeProvider
Datagen recipe coverage includes shaped, shapeless, and smelting-family builders.
- Shaped: explicit pattern grid, symbol map, unlock criteria.
- Shapeless: ingredient collection, unlock criteria, optional custom id.
- Smelting/blasting/campfire/smoker style: input, result, XP, cook time.
Forge 1.20.1:
- `RecipeProvider.buildRecipes(Consumer<FinishedRecipe>)`.
- Builders persist via `.save(Consumer<FinishedRecipe>, ...)` patterns.
NeoForge 1.21.1:
- `RecipeProvider.buildRecipes(RecipeOutput)`.
- Builders persist via `.save(RecipeOutput, ...)` patterns.

## Tags Providers
Tags providers define semantic grouping contracts used by recipes, loot, and logic.
- `BlockTagsProvider`: block capability/material groupings.
- `ItemTagsProvider`: item semantics and block-tag propagation.
- Keep tag keys stable and avoid drift between block and item views.

## LootTableProvider
Loot datagen is normally split into block and entity table sets.
- Block loot: self-drop, silk touch, fortune, explosion handling.
- Entity loot: pool entries, random chances, looting multipliers, conditions.
Architecture rule: each custom drop source must map to an emitted table id.

## Model Providers (Forge)
Model/blockstate datagen emits client-facing JSON assets.
- `BlockStateProvider`: variant and multipart blockstate generation.
- `ItemModelProvider`: generated/handheld item models and parent chains.
- `ExistingFileHelper` validates parent and texture references at generation time.

## LanguageProvider
Language providers centralize localization output.
- Typical baseline output: `assets/<ns>/lang/en_us.json`.
- One canonical key per object/feature text contract.
- Missing keys are data quality defects, not presentation-only issues.

## AdvancementProvider
Advancement providers emit progression graph JSON.
- Root and child tree structure should be deliberate and stable.
- Criteria/reward wiring must be explicit and id-stable across updates.
- Parent references and display metadata are part of compatibility surface.

## Running Datagen
Primary task: `./gradlew runData`.
Typical output root: `src/generated/resources`.
Build configuration should include generated resources in runtime packaging.

## Version Differences: Forge 1.20.1 vs NeoForge 1.21.1
| Concern | Forge 1.20.1 | NeoForge 1.21.1 |
|---|---|---|
| Recipe override signature | `buildRecipes(Consumer<FinishedRecipe>)` | `buildRecipes(RecipeOutput)` |
| Recipe sink object | `FinishedRecipe` consumer | `RecipeOutput` |
| Existing file helper usage | Standard in Forge model providers | Model validation still required; major API shift is recipe output |
| Datagen registration event | `GatherDataEvent` | `GatherDataEvent` |

## Worldgen Datagen
Worldgen datagen is dynamic-registry oriented.
- Use `RegistryDataGenerator` style flows for registry-backed worldgen output.
- Register dynamic entries in bootstrap callbacks using `BootstapContext<T>`.
- Common bootstrap targets: `ConfiguredFeature`, `PlacedFeature`, biome modifier-related data.
Key constraint: worldgen keys are cross-referenced; id stability is mandatory.

## Common Pitfalls
- Missing `ExistingFileHelper` causes unresolved model parent/texture references.
- Wrong output root causes generated JSON to be absent from packaged resources.
- Provider not added in `GatherDataEvent` silently drops that data domain.
- Mixed Forge/NeoForge recipe signatures produce compile-time mismatch.
- Inconsistent ids across recipes/tags/loot break cross-file references.

## MCP Verification Queries
```text
# Datagen entry points
search("GatherDataEvent", "1.20.1")
search("GatherDataEvent", "1.21.1")
search("DataGenerator", "1.20.1")
search("DataGenerator", "1.21.1")

# Recipe signature differences
search("RecipeProvider buildRecipes Consumer<FinishedRecipe>", "1.20.1")
search("RecipeProvider buildRecipes RecipeOutput", "1.21.1")
search_docs("datagen recipeoutput neoforge", "docs")

# Core provider surfaces
search("BlockTagsProvider", "1.20.1")
search("ItemTagsProvider", "1.20.1")
search("LootTableProvider", "1.20.1")
search("LanguageProvider", "1.20.1")
search("AdvancementProvider", "1.20.1")
search("BlockStateProvider", "1.20.1")
search("ItemModelProvider", "1.20.1")
search("ExistingFileHelper", "1.20.1")

# Worldgen datagen surfaces
search("RegistryDataGenerator", "1.21.1")
search("BootstapContext", "1.20.1")
search("BootstapContext", "1.21.1")
search("ConfiguredFeature", "1.21.1")
search("PlacedFeature", "1.21.1")
```
If any symbol is absent, mark output with `verify via MCP` and avoid hard-coded calls.
