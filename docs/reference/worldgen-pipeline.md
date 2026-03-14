# Worldgen Pipeline Reference (Forge 1.20.1 / NeoForge 1.21.1)

This document is an architecture reference for AI code generation.
It defines worldgen registry flow, biome injection mechanisms, structure wiring, and verification points.

## Scope and Constraints

| Field | Value |
|---|---|
| Target loaders | Forge 1.20.1, NeoForge 1.21.1 |
| Core model | Datapack-driven dynamic registries |
| Goal | Generate consistent worldgen registrations and biome integration plans |
| Anti-goal | Tutorial prose, partial chain registration, unverified API assumptions |

## Worldgen Pipeline Overview

Worldgen is a chained registry graph:

1. `Feature` defines generation algorithm type.
2. `ConfiguredFeature` binds feature type and config payload.
3. `PlacedFeature` wraps configured feature reference and placement modifiers.
4. `Biome` generation settings reference placed features per generation step.

Pipeline invariant: biomes consume `PlacedFeature`, not raw `ConfiguredFeature`.

## Registration Surfaces

| Surface | Forge 1.20.1 | NeoForge 1.21.1 |
|---|---|---|
| Datapack JSON | `data/<namespace>/worldgen/...` dynamic registry entries | Same dynamic registry model |
| Java bootstrap | `BootstapContext<T>` registration callbacks | `BootstapContext<T>` registration callbacks |
| Emission path | Datagen produces canonical JSON artifacts | Datagen produces canonical JSON artifacts |

## ConfiguredFeature Model

`ConfiguredFeature` combines:

- `feature`: registry key to a `Feature` implementation (example: ore generation feature type).
- `config`: typed configuration object/json matching the selected feature schema.

Rules:

- Feature/config schema must match exactly.
- Reusable configured features should avoid biome-specific placement logic.
- Keep resource keys stable because biome and placed-feature references are key-based.

## PlacedFeature Model

`PlacedFeature` combines:

- `feature`: reference to configured feature key.
- `placement`: ordered list of placement modifiers.

Typical modifier roles:

- frequency/count,
- rarity filtering,
- height/range constraints,
- horizontal spread,
- biome filter.

Ordering is semantic because modifiers compose in sequence.

## Biome Definition Structure

Biome definitions include climate, effects, generation settings, and spawn tables.

| Section | Purpose | Typical fields |
|---|---|---|
| Climate | Environmental behavior | `temperature`, `downfall`, `has_precipitation` |
| Effects | Visual/audio atmosphere | fog/water/sky colors, ambient effects |
| Generation | Terrain and decoration | carvers and placed-feature lists by decoration step |
| Spawners | Mob population | weighted spawn entries with min/max group sizes |

Biome generation settings should reference placed-feature keys grouped by generation stage.

## Adding Features to Existing Biomes

### Forge 1.20.1

- Preferred: biome modifier JSON at `data/<modid>/forge/biome_modifier/`.
- Legacy fallback: `BiomeLoadingEvent` mutation path (deprecated for long-term design).
- Recommendation: use JSON biome modifiers for deterministic datapack composition.

### NeoForge 1.21.1

- Primary path: biome modifier JSON at `data/<modid>/neoforge/biome_modifier/`.
- Types include `add_features`, `add_spawns`, and related remove/replace actions.
- Recommendation: keep biome injection data-driven rather than event mutation.

## Loader Difference Matrix

| Concern | Forge 1.20.1 | NeoForge 1.21.1 |
|---|---|---|
| Biome modifier location | `data/<modid>/forge/biome_modifier/` | `data/<modid>/neoforge/biome_modifier/` |
| Event mutation path | `BiomeLoadingEvent` available but deprecated | JSON biome modifier path is standard |
| Core chain | `Feature -> ConfiguredFeature -> PlacedFeature -> Biome` | `Feature -> ConfiguredFeature -> PlacedFeature -> Biome` |
| Registry behavior | Dynamic/datapack registry loading | Dynamic/datapack registry loading |

## Structure Generation Architecture

Structure worldgen is split between type definition and placement set.

- `StructureType` binds structure codec/type identity.
- `StructureSet` groups structures and defines placement distribution parameters.

Common data split:

- `worldgen/structure/<id>.json` for structure payload.
- `worldgen/structure_set/<id>.json` for placement policy.

## Ore Generation Pattern

1. Register configured ore feature (`Feature` + ore config payload).
2. Register placed feature referencing that configured entry.
3. Compose placement modifiers (count/chance, height range, spread, biome filter).
4. Inject placed feature into target biome generation step via biome modifier.

## Datagen for Worldgen

Datagen should emit worldgen JSON as deployable registry artifacts.

- Use registry/datapack generation providers (including `RegistryDataGenerator`-style flows).
- Register dynamic entries in bootstrap callbacks through `BootstapContext<T>`.
- Emit configured features, placed features, structures, structure sets, and biome modifiers together.

Design rule: bootstrap registration defines authoritative object graph; generated JSON is distribution output.

## MCP Verification Queries

```text
# Feature chain symbols
search("ConfiguredFeature", "1.20.1")
search("PlacedFeature", "1.20.1")
search("ConfiguredFeature", "1.21.1")
search("PlacedFeature", "1.21.1")
search_docs("worldgen biomemodifier add_features add_spawns", "docs")
search("BiomeLoadingEvent", "1.20.1")
search("neoforge/biome_modifier", "1.21.1")
search("StructureType", "1.20.1")
search("StructureSet", "1.20.1")
search("StructureType", "1.21.1")
search("StructureSet", "1.21.1")
search("BootstapContext", "1.20.1")
search("BootstapContext", "1.21.1")
search("RegistryDataGenerator", "1.21.1")
```

If any symbol is absent, mark planning output with `verify via MCP` and avoid hard-coding unverified calls.
