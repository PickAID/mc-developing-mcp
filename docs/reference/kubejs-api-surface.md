# KubeJS API Surface Reference

This document provides a database-verified reference of the KubeJS API surface. It serves as a technical specification for event groups, script phases, and mutability status across supported versions. This is not a tutorial.

## Script Phase Routing

Scripts execute in specific phases based on their directory. The following table maps event groups to their valid script phases.

| Script Phase | Event Groups / Types |
| :--- | :--- |
| `startup_scripts` | StartupEvents, ForgeEvents (1.20.1), Registry events |
| `server_scripts` | ServerEvents, PlayerEvents, EntityEvents, BlockEvents, LevelEvents, RecipeEvents, ItemEvents (server-side) |
| `client_scripts` | ClientEvents, Painting events, Tooltip events |

## KubeJS 1.20.1

**Package:** `dev.latvian.mods.kubejs.bindings.event`

### Event Groups

| Event Group | Description |
| :--- | :--- |
| BlockEvents | Interactions and changes related to blocks |
| ClientEvents | Client-side only events and UI |
| EntityEvents | Entity lifecycle and behavior |
| ItemEvents | Item interactions and modifications |
| LevelEvents | World-level events (loading, saving) |
| NetworkEvents | Custom packet handling |
| PlayerEvents | Player-specific actions and state |
| ServerEvents | Server lifecycle and data loading |
| StartupEvents | Mod loading and registration |
| WorldgenEvents | Biome and feature generation |

## KubeJS 1.21.1

**Package:** `dev.latvian.mods.kubejs.plugin.builtin.event`

### Event Groups

| Event Group | Description |
| :--- | :--- |
| BlockEvents | Interactions and changes related to blocks |
| ClientEvents | Client-side only events and UI |
| EntityEvents | Entity lifecycle and behavior |
| ItemEvents | Item interactions and modifications |
| KeyBindEvents | Custom keybinding registration and handling |
| LevelEvents | World-level events (loading, saving) |
| NetworkEvents | Custom packet handling |
| PlayerEvents | Player-specific actions and state |
| RecipeViewerEvents | Integration with recipe viewers (JEI/REI/EMI) |
| ServerEvents | Server lifecycle and data loading |
| StartupEvents | Mod loading and registration |

## Critical Damage Mutation

Damage mutation behavior differs significantly between versions.

| Version | Event / Method | Mutability | Requirement |
| :--- | :--- | :--- | :--- |
| 1.20.1 | `LivingEntityHurtEventJS` | Read-only (`getDamage()`) | Cannot mutate damage directly |
| 1.20.1 | `ForgeEvents.onEvent` | Mutable (`setAmount(float)`) | `startup_scripts` only |
| 1.21.1 | `BeforeLivingEntityHurtKubeEvent` | Mutable (`setDamage(float)`) | Standard event handler |
| 1.21.1 | `AfterLivingEntityHurtKubeEvent` | Read-only (`getDamage()`) | Post-damage calculation |

## ForgeEvents and NativeEvents

- **1.20.1 (core KubeJS):** Use `ForgeEvents.onEvent(className, handler)` within `startup_scripts` to access low-level Forge events. This is startup-only because `BuiltinKubeJSForgePlugin` guards with `event.getType().isStartup()`.
- **1.20.1 (with EventJS addon):** The EventJS addon (`zank.mods.eventjs`) provides `NativeEvents.onEvent(Class, handler)` in **all 3 script types** (startup/server/client). `EventJSKubeJSPlugin` binds `NativeEvents` per script type via `SidedNativeEvents.byType(scriptType)`. This makes native Forge event listening available in `server_scripts` and `client_scripts` on 1.20.1, which is impossible with core KubeJS alone.
- **1.21.1 (core KubeJS):** `NativeEvents` is built into KubeJS via `NativeEventWrapper`. Works in all script types natively without any addon.

### EventJS Addon API (1.20.1 only)

**Requires**: EventJS addon installed ([CurseForge](https://www.curseforge.com/minecraft/mc-mods/eventjs), [GitHub](https://github.com/ZZZank/EventJS))

| Method | Signature | Description |
| :--- | :--- | :--- |
| `onEvent` | `NativeEvents.onEvent(Class, handler)` | Listen to a Forge event with NORMAL priority |
| `onEvent` | `NativeEvents.onEvent(priority, receiveCancelled, Class, handler)` | Listen with custom priority and cancellation behavior |
| `onGenericEvent` | `NativeEvents.onGenericEvent(genericClassFilter, Class, handler)` | Listen to a generic Forge event |
| `onGenericEvent` | `NativeEvents.onGenericEvent(genericClassFilter, priority, receiveCancelled, Class, handler)` | Generic event with custom priority |

Key behaviors:
- Event class is loaded via `Java.loadClass(...)` (1.20.1 syntax)
- Bus selection is automatic (`EventBusSelector.AUTO`): uses MOD bus for `IModBusEvent`, FORGE bus otherwise
- Handlers are reloadable — unregistered on script reload via `SidedNativeEvents.unload()`
- Errors in handlers are caught and logged, preventing game crashes
- EventJS also makes existing `ForgeEvents.onEvent(...)` calls in `startup_scripts` reloadable via mixin

### EventJS 1.20.1 Damage Mutation in server_scripts

With EventJS installed, damage mutation can be done in `server_scripts` instead of `startup_scripts`:

```javascript
// server_scripts/damage_modifier.js — requires EventJS addon
NativeEvents.onEvent(Java.loadClass("net.minecraftforge.event.entity.living.LivingHurtEvent"), event => {
    event.setAmount(event.getAmount() * 0.5);
});
```

Without EventJS, the same logic must go in `startup_scripts` using `ForgeEvents.onEvent(...)` (see Critical Damage Mutation section above).

## Version Drift Warnings

- **WorldgenEvents:** Removed in 1.21.1. Use data packs or platform-specific alternatives.
- **KeyBindEvents:** Introduced in 1.21.1 for unified keybinding management.
- **RecipeViewerEvents:** Introduced in 1.21.1 to replace separate JEI, REI, and EMI event groups.
- **Package Migration:** The base event package moved from `bindings.event` to `plugin.builtin.event`.
