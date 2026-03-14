# Datapack Structures Reference

Architectural reference for datapack JSON in Forge 1.20.1 and NeoForge 1.21.1.
Focus: folder taxonomy, JSON shape contracts, registry/path mapping, and mod runtime integration.
This is not tutorial prose.

## Core Data Model

- Server datapack content is loader-discovered from `data/<namespace>/...`.
- Path + filename determine resource id; ids are not inferred from JSON internals.
- JSON instances bind to either static domains (recipes, tags, loot tables, advancements)
  or dynamic registries (worldgen, dimension, dimension_type, related references).
- Resource locations follow `namespace:path`; datapack file paths are strict and loader-driven.

## Datapack Folder Taxonomy

Compact directory tree (major server-side domains):

```text
data/
  <modid>/
    recipes/*.json
    tags/
      blocks/*.json
      items/*.json
      entity_types/*.json
      fluids/*.json
      game_events/*.json
      damage_type/*.json
      functions/*.json
      worldgen/{biome,configured_feature,placed_feature,structure,structure_set,template_pool}/*.json
    loot_tables/
      blocks/*.json
      entities/*.json
      chests/*.json
      gameplay/*.json
      archaeology/*.json
      fishing/*.json
    advancements/**/*.json
    worldgen/
      biome/*.json
      configured_feature/*.json
      placed_feature/*.json
      noise_settings/*.json
      noise/*.json
      density_function/*.json
      structure/*.json
      structure_set/*.json
      processor_list/*.json
      template_pool/*.json
      world_preset/*.json
      flat_level_generator_preset/*.json
    dimension/*.json
    dimension_type/*.json
    neoforge/biome_modifier/*.json
```

Notes:
- `neoforge/biome_modifier` is NeoForge-specific (1.21.1 path layer).
- Any used folder must match canonical naming exactly; typoed paths are ignored.

## Resource Location Conventions

- General mapping: `data/<namespace>/<domain>/<path>.json` -> `<namespace>:<path>` in that domain.
- Examples:
  - `data/examplemod/recipes/steel_ingot.json` -> `examplemod:steel_ingot`
  - `data/examplemod/worldgen/configured_feature/ruby_ore.json` -> `examplemod:ruby_ore`
  - `data/examplemod/tags/items/ingots.json` -> item tag id `examplemod:ingots`
- Tag references in JSON use `#namespace:path`.

## Recipe JSON Structure

Every recipe JSON includes `type`, which selects the serializer and required schema.

### Shaped
- Typical keys: `type`, `pattern`, `key`, `result`.
- `pattern` rows and `key` symbol mapping must align.

### Shapeless
- Typical keys: `type`, `ingredients`, `result`.
- Ingredient order is not significant.

### Smelting-family
- Furnace, blasting, smoking, and campfire serializers.
- Typical keys: `type`, `ingredient`, `result`, `experience`, `cookingtime`.

### Custom recipe types
- Mod serializers are addressed by `type: "<modid>:<serializer_id>"`.
- Expected fields are defined by that serializer implementation.

## Tag JSON Structure and Inheritance

- Tag files contain `values` and optional `replace`.
- `values` entries may be concrete ids (`modid:item`) or nested tags (`#c:ingots`).
- `replace: true` replaces lower-priority data; default behavior merges/appends.
- Tag inheritance is transitive through nested tag references.
- Domain folders must match registry domain (`tags/items`, `tags/blocks`, `tags/entity_types`, etc.).

## Loot Table JSON Structure

- Root usually includes `type` and `pools`.
- `pools[]` define rolls and entry selection context.
- `entries[]` define candidate drops (item, tag, loot_table, group/alternatives/sequence forms).
- `conditions[]` gate drops (tool predicates, chance, entity checks, explosion rules).
- `functions[]` mutate output (count, state/components, copy data, enchant transforms).

## Advancements JSON Structure

- Common root keys: `parent`, `display`, `criteria`, `requirements`, `rewards`.
- `criteria` defines triggers; `requirements` defines AND/OR grouping over criteria names.
- File path under `advancements/` determines advancement id.

## Worldgen JSON Structure

### Configured feature (`worldgen/configured_feature`)
- Declares feature type and its config payload.
- Represents what is generated.

### Placed feature (`worldgen/placed_feature`)
- References configured feature ids.
- Adds placement modifiers (count, rarity, height, biome filters, spread).
- Represents where/how often generation occurs.

### Biome (`worldgen/biome`)
- Encodes climate/effects/spawn settings and generation settings.
- Generation settings bind placed features by generation step.

### NeoForge biome modifier (`neoforge/biome_modifier`)
- Data-driven biome edits without replacing full biome definitions.
- Common use: add/remove placed features or spawns via selectors.

## Dimension and Dimension Type

- `dimension_type/*.json` defines environmental rules and behavior.
- `dimension/*.json` binds dimension ids to type ids and chunk generator definitions.
- Both participate in dynamic-registry loading and strict reference validation.

## Dynamic Registries and Registry IDs

- Dynamic registry entries are loaded from datapack JSON at world/data load.
- Datapack paths map to registry ids through `namespace:path`.
- Cross-file references must resolve exactly; missing ids produce data-load failures.
- Mod code integration is typically `ResourceLocation` + registry lookup against loaded ids.

## Forge 1.20.1 and NeoForge 1.21.1 Integration

- Core datapack model is shared: path-driven loading and registry-backed resolution.
- NeoForge adds loader-specific domains such as `data/<modid>/neoforge/biome_modifier/`.
- For cross-version content, keep shared JSON in vanilla domains and isolate loader-specific JSON.

## KubeJS Datapack Interaction

- `server_scripts` can modify recipes and tags at runtime (add/remove/replace operations).
- Runtime edits apply as script-driven transforms over loaded datapack state.
- This enables post-load balancing without shipping new JSON for every change.
- For Forge 1.20.1 low-level event-bus access patterns, `startup_scripts` + `ForgeEvents` remain relevant.

## JSON Templates

### 1) Shaped crafting recipe
- Path: `data/modid/recipes/ruby_pickaxe.json`
- Required fields: `type`, `pattern`, `key`, `result`.
- Namespace convention: keep vanilla ids as `minecraft:*`; use `modid:*` for mod content.

```json
{
  "type": "minecraft:crafting_shaped",
  "pattern": [
    "RRR",
    " S ",
    " S "
  ],
  "key": {
    "R": {
      "item": "modid:ruby"
    },
    "S": {
      "item": "minecraft:stick"
    }
  },
  "result": {
    "item": "modid:ruby_pickaxe",
    "count": 1
  }
}
```

### 2) Block tag (`minecraft:mineable/pickaxe`)
- Path: `data/minecraft/tags/blocks/mineable/pickaxe.json`
- Required fields: `values`; optional `replace`.
- Namespace convention: use `minecraft` namespace in path when appending to a vanilla tag id.

```json
{
  "replace": false,
  "values": [
    "modid:ruby_ore",
    "modid:deepslate_ruby_ore"
  ]
}
```

### 3) Block loot table (pools + entries + conditions + functions)
- Path: `data/modid/loot_tables/blocks/ruby_ore.json`
- Required fields: root `type`, `pools`; per pool use `entries`; conditions/functions are optional but common.
- Namespace convention: `modid:*` for custom drops, `minecraft:*` for built-in conditions/functions.

```json
{
  "type": "minecraft:block",
  "pools": [
    {
      "rolls": 1,
      "entries": [
        {
          "type": "minecraft:item",
          "name": "modid:raw_ruby",
          "conditions": [
            {
              "condition": "minecraft:survives_explosion"
            },
            {
              "condition": "minecraft:inverted",
              "term": {
                "condition": "minecraft:match_tool",
                "predicate": {
                  "enchantments": [
                    {
                      "enchantment": "minecraft:silk_touch",
                      "levels": {
                        "min": 1
                      }
                    }
                  ]
                }
              }
            }
          ],
          "functions": [
            {
              "function": "minecraft:set_count",
              "count": {
                "type": "minecraft:uniform",
                "min": 1.0,
                "max": 3.0
              }
            },
            {
              "function": "minecraft:apply_bonus",
              "enchantment": "minecraft:fortune",
              "formula": "minecraft:ore_drops"
            }
          ]
        }
      ]
    }
  ]
}
```

### 4) Ore generation pair (configured feature + placed feature)
- Paths:
  - `data/modid/worldgen/configured_feature/ruby_ore.json`
  - `data/modid/worldgen/placed_feature/ruby_ore.json`
- Required fields: configured feature uses `type` + `config`; placed feature uses `feature` + `placement`.
- Namespace convention: placed feature references configured feature id `modid:ruby_ore`.

```json
{
  "type": "minecraft:ore",
  "config": {
    "size": 9,
    "discard_chance_on_air_exposure": 0.0,
    "targets": [
      {
        "target": {
          "predicate_type": "minecraft:tag_match",
          "tag": "minecraft:stone_ore_replaceables"
        },
        "state": {
          "Name": "modid:ruby_ore"
        }
      },
      {
        "target": {
          "predicate_type": "minecraft:tag_match",
          "tag": "minecraft:deepslate_ore_replaceables"
        },
        "state": {
          "Name": "modid:deepslate_ruby_ore"
        }
      }
    ]
  }
}
```

```json
{
  "feature": "modid:ruby_ore",
  "placement": [
    {
      "type": "minecraft:count",
      "count": 12
    },
    {
      "type": "minecraft:in_square"
    },
    {
      "type": "minecraft:height_range",
      "height": {
        "type": "minecraft:trapezoid",
        "min_inclusive": {
          "absolute": -32
        },
        "max_inclusive": {
          "absolute": 96
        }
      }
    },
    {
      "type": "minecraft:biome"
    }
  ]
}
```

### 5) Biome modifier (`add_features`)
- Forge 1.20.1 path/type:
  - Path: `data/modid/forge/biome_modifier/ruby_ore.json`
  - Type: `forge:add_features`
- NeoForge 1.21.1 path/type difference:
  - Path: `data/modid/neoforge/biome_modifier/ruby_ore.json`
  - Type: `neoforge:add_features`
- Required fields: `type`, `biomes`, `features`, `step`.
- Namespace convention: `features` points to a placed feature id (`modid:*`).

```json
{
  "type": "forge:add_features",
  "biomes": "#minecraft:is_overworld",
  "features": "modid:ruby_ore",
  "step": "underground_ores"
}
```

## MCP Verification Queries

Use MCP methods to verify runtime API surfaces and loader integration points.

**KubeJS recipe/tag hooks (1.21.1):**
```json
{"method":"search_methods","params":{"query":"ServerEvents recipes","version":"1.21.1"}}
```

**Forge low-level hook pattern (1.20.1):**
```json
{"method":"search_methods","params":{"query":"ForgeEvents onEvent","version":"1.20.1"}}
```

**NeoForge biome modifier surface (1.21.1):**
```json
{"method":"search_methods","params":{"query":"biome modifier","version":"1.21.1"}}
```

**Class-level validation when event semantics matter:**
```json
{"method":"get_class_detail","params":{"version":"1.20.1","loader":"forge","class_name":"LivingHurtEvent"}}
```
