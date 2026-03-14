# Version Migration Map

This document tracks API changes and structural shifts across Minecraft versions 1.20.1, 1.20.4, 1.20.5, 1.20.6, 1.21, and 1.21.1.

## Major version transitions

### 1.20.1 to 1.20.4 (Forge to NeoForge)

The move from Forge to NeoForge changed package names and how registries work.

- Package rename: `net.minecraftforge.*` became `net.neoforged.neoforge.*`.
- Event bus: `MinecraftForge.EVENT_BUS` became `NeoForge.EVENT_BUS`.
- Registry: `ForgeRegistries` was replaced by `BuiltInRegistries` or `Registries`.
- Holder type: `RegistryObject<T>` became `DeferredHolder<T, R>`.
- KubeJS: Event packages were restructured.

### 1.20.4 to 1.21.1 (Incremental changes)

Recent updates overhauled the damage system and event structures.

- Damage system overhaul: NeoForge replaced `LivingHurtEvent` with `LivingIncomingDamageEvent`.
- DamageContainer: A new system now manages the damage pipeline.
- ArmorHurtEvent: This event handles per-slot armor damage.
- KubeJS events: `EntityEvents.hurt` became `EntityEvents.beforeHurt` and `EntityEvents.afterHurt`.

## KubeJS event drift

| 1.20.1 Pattern | 1.21.1 Pattern | Notes |
|---|---|---|
| `EntityEvents.hurt` | `EntityEvents.beforeHurt` | Name change and mutability added |
| ... | `EntityEvents.afterHurt` | New in 1.21.1 |
| `ForgeEvents.onEvent(...)` | Native KubeJS events / `NativeEvents` | Verify per corpus |
| `WorldgenEvents.*` | Removed | No direct replacement |
| ... | `KeyBindEvents.*` | New in 1.21.1 |
| ... | `RecipeViewerEvents.*` | New in 1.21.1, replaces JEI/REI-specific |
| `JEIEvents.*` / `REIEvents.*` | `RecipeViewerEvents.*` | Unified recipe viewer events |
| Package: `bindings.event` | Package: `plugin.builtin.event` | Package restructure |

## KubeJS handler class drift (Damage)

| Version | Handler Class | getDamage() | setDamage() |
|---|---|---|---|
| 1.20.1 | LivingEntityHurtEventJS | YES | NO |
| 1.21.1 | BeforeLivingEntityHurtKubeEvent | YES | YES |
| 1.21.1 | AfterLivingEntityHurtKubeEvent | YES | NO |

## Forge/NeoForge damage event drift

| 1.20.1 Forge | 1.21.1 NeoForge | Notes |
|---|---|---|
| LivingHurtEvent | LivingIncomingDamageEvent | New name and DamageContainer |
| LivingDamageEvent | LivingDamageEvent (restructured) | API changed: newDamage/originalDamage |
| LivingAttackEvent | (merged into damage pipeline) | Check per version |
| ShieldBlockEvent | LivingShieldBlockEvent | Renamed and DamageContainer |
| ... | ArmorHurtEvent | New per-slot armor damage |

## DB file count by version

| Version | kubejs | forge/neoforge | minecraft | Third-party total |
|---|---|---|---|---|
| 1.20.1 | 678 | 666 (forge) | 8,354 | ~4,960 |
| 1.20.4 | 631 | 851 (neoforge) | 8,815 | ... |
| 1.20.5 | 640 | 847 | 9,356 | ... |
| 1.20.6 | 692 | 867 | 9,358 | ... |
| 1.21 | 796 | 905 | 9,427 | ... |
| 1.21.1 | 873 | 951 (neoforge) | 9,427 | ~4,847 |

## Migration verification workflow

To check if an API exists in a target version, follow these steps:

1. Search for the class or method name in the source database for that version.
2. Check the package path to see if it matches the version's conventions, such as neoforged versus minecraftforge.
3. Verify method signatures, as parameters often change between versions.
4. Use the `lsp_symbols` or `lsp_goto_definition` tools in a source file to confirm availability.
