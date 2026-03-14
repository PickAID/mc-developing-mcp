# KubeJS Addon Ecosystem Reference

This document catalogs the KubeJS addon ecosystem indexed in the source database and maps each addon to capability, version availability, loader compatibility, and practical recommendation triggers. This is a technical reference, not a tutorial.

## Scope

| Field | Value |
|---|---|
| Indexed addons | 20 |
| Indexed Java files | 1,607 |
| Versions covered | Forge 1.20.1, NeoForge 1.21.1 |
| Data source | `data/minecraft_sources.sqlite` |
| Cross-reference | `docs/reference/kubejs-api-surface.md` |

Loader support labels in this file are derived from indexed version presence:
- `forge-only`: present only in 1.20.1 corpus
- `neoforge-only`: present only in 1.21.1 corpus
- `both`: indexed for both 1.20.1 and 1.21.1

## Category A-0: Event System

| Addon (loader) | Provides | 1.20.1 | 1.21.1 | Loader Support | Key Classes / Entry Points | Recommend When |
|---|---|---|---|---|---|---|
| EventJS (`eventjs`) | Reloadable, sided native Forge event listening for all 3 script types | Yes | No | forge-only | `EventJSKubeJSPlugin`, `SidedNativeEvents`, `EventBusSelector` | User needs native Forge event access in `server_scripts` or `client_scripts` on 1.20.1, or needs reloadable `ForgeEvents` handlers |

Notes:
- EventJS provides `NativeEvents.onEvent(Class, handler)` available in startup/server/client scripts on 1.20.1.
- Without EventJS, `ForgeEvents.onEvent(...)` is startup-only in core KubeJS 1.20.1.
- EventJS is NOT needed on 1.21.1 — core KubeJS 1.21.1 has built-in `NativeEvents` via `NativeEventWrapper`.
- Also makes existing `ForgeEvents.onEvent(...)` calls reloadable (no game restart needed on script reload).
- Cross-reference: `docs/reference/kubejs-api-surface.md` for EventJS API details and damage mutation patterns.

## Category A: Entity / Animation

| Addon (loader) | Provides | 1.20.1 | 1.21.1 | Loader Support | Key Classes / Entry Points | Recommend When |
|---|---|---|---|---|---|---|
| EntityJS (`entityjs`) | Custom entity definitions and builder-driven entity scripting in KubeJS | Yes | Yes | both | `EntityJSPlugin`, `EntityJSMod`, `BaseLivingEntityBuilder` | User needs custom mobs/projectiles/AI behavior without writing full Java mod entity plumbing |
| AnimationJS (`animationjs`) | Animation and animation event/state integration hooks for scripted gameplay | Yes | Yes | both | `AnimationJSPlugin`, `AnimationJS`, `ArmRenderEvent` | User needs scripted animation state transitions or animation-aware event hooks |
| GeckoJS (`geckojs`) | GeckoLib-facing animatable builders and wrappers for KubeJS integration | Yes | No | forge-only | `GeckoJSPlugin`, `GeckoJS`, `AnimationControllerBuilder` | User needs GeckoLib model/animation control from KubeJS scripts on 1.20.1 |
| Player Animator API (`player-animator`) | Player animation runtime API and client synchronization primitives | Yes | No | forge-only | `PlayerAnimAPI`, `PlayerAnimAPIClient`, `ClientEvents` | User needs explicit player animation channels/modifiers at runtime |

Notes:
- `EntityJS` and `AnimationJS` are the primary cross-version picks for scripted entities plus animation orchestration.
- `GeckoJS` is the bridge for GeckoLib-style animatable model workflows in 1.20.1 packs.
- `player-animator` is a lower-level animation API dependency surface, useful when addon abstractions are insufficient.

## Category B: Loot / Data

| Addon (loader) | Provides | 1.20.1 | 1.21.1 | Loader Support | Key Classes / Entry Points | Recommend When |
|---|---|---|---|---|---|---|
| LootJS (`lootjs`) | Loot table modification, conditions, and data-driven loot actions from scripts | Yes | Yes | both | `LootContextJS` (1.20.1), `LootEvents` (1.21.1), `AbstractLootModification` | User needs non-trivial loot injection/replacement with condition composition |
| AdvancementJS (`advancementjs`) | Custom advancement builders/events and advancement state integration | Yes | No | forge-only | `AdvJSPlugin`, `AdvBuilder`, `AdvConfigureEventJS` | User needs scripted advancement creation or advancement lock/config hooks in 1.20.1 |
| MoreJS (`morejs`) | Extra gameplay/data surfaces (trades, enchantment flows, potion/trade-related hooks) | Yes | Yes | both | `MoreJS`, `Plugin`, `Events` | User needs extension points not covered by core KubeJS or LootJS, especially villager/enchant systems |

Notes:
- Prefer `LootJS` for loot-domain tasks; avoid overloading `MoreJS` for pure loot-table work.
- Use `AdvancementJS` only when advancement authoring must be scripted rather than pure datapack JSON.

## Category C: Rendering / UI

| Addon (loader) | Provides | 1.20.1 | 1.21.1 | Loader Support | Key Classes / Entry Points | Recommend When |
|---|---|---|---|---|---|---|
| Render.js (`renderjs`) | GUI/world render event wrappers and render helper interfaces for KubeJS | Yes | Yes | both | `AddGuiRenderEvent`, `AddWorldRenderEvent`, `IGuiRenderEvent` | User needs HUD overlays, custom draw calls, or world-space rendering hooks |
| PonderJS (`ponderjs`) | Create Ponder scene registration/builders and scripted scene behavior | Yes | Yes | both | `KubePlugin`, `PonderBuilderJS`, `PonderEvents` | User needs in-game instructional Ponder scenes for Create-centric content |
| KeyBindJS (`keybindjs`) | Script-side keybind registration, mutation, and input events | No | Yes | neoforge-only | `KeyBindJSPlugin`, `KeyBindEvents`, `KeyBindEvent` | User needs custom keybind definitions and key-driven script logic on 1.21.1 |

Notes:
- Cross-check `KeyBindJS` usage against `KeyBindEvents` availability in `kubejs-api-surface.md`.
- `Render.js` should be selected when core `ClientEvents` lacks required render-stage control.

## Category D: Utilities

| Addon (loader) | Provides | 1.20.1 | 1.21.1 | Loader Support | Key Classes / Entry Points | Recommend When |
|---|---|---|---|---|---|---|
| KubeJS Additions (`kubejs-additions`) | Extra KubeJS events/bindings and integration hooks beyond core event groups | Yes | Yes | both | `AdditionsPlugin`, `AdditionalEvents`, `KubeJSAdditions` | User asks for event hooks that do not exist in core KubeJS |
| KubeUtils (`kubeutils`) | Utility bindings/helpers for common script operations and convenience events | Yes | Yes | both | `KubeUtilsPlugin`, `KuEvents`, `KubeUtils` | User needs helper abstractions to reduce repetitive script boilerplate |
| KubeLoader (`kubeloader`) | Content pack discovery/loading and resource pack provider wiring | Yes | No | forge-only | `Kubeloader`, `ContentPackExplorer`, `ResourcePackProvider` | User needs external content-pack style loading in 1.20.1 environments |
| KubePackages (`kubepackages`) | Script package/dependency primitives and package load context tooling | Yes | No | forge-only | `KubePackages`, `KubePackage`, `ScriptLoadContext` | User needs modular script packaging and dependency reporting for large packs |
| ModifyJS (`modifyjs`) | Fine-grained object/item/render detail tweaking and builder mixin surfaces | Yes | No | forge-only | `ModifyJS`, `RenderItemBuilder`, `RenderHandheldItemBuilder` | User needs targeted render/item tweaks not exposed by core APIs |
| KubeJS Offline (`kubejs-offline`) | Offline doc generation/bridge and in-pack documentation command workflow | Yes | Yes | both | `OfflinePlugin`, `DocumentCommand`, `MinecraftDocumentationBridge` | User needs local/offline API docs surfaced inside dev or pack workflow |

Notes:
- Select utility addons only when a core KubeJS path is absent or materially worse for maintainability.
- Keep `KubePackages` and `KubeLoader` roles distinct: package management vs content-pack ingestion.

## Category E: I/O

| Addon (loader) | Provides | 1.20.1 | 1.21.1 | Loader Support | Key Classes / Entry Points | Recommend When |
|---|---|---|---|---|---|---|
| FetchJS (`fetchjs`) | HTTP request utilities exposed to KubeJS scripts | No | Yes | neoforge-only | `FetchJSPlugin`, `HttpUtil`, `Fetchjs` | User needs outbound HTTP calls from scripts on 1.21.1 |
| Files JS (`filesjs`) | File read/write wrappers and file event surfaces for scripts | No | Yes | neoforge-only | `FilesJSPlugin`, `FilesWrapper`, `FileEventJS` | User needs controlled file system access in script-driven workflows |

Notes:
- Treat I/O addons as environment-sensitive features; verify server policy before recommending external/file access.

## Category F: Resources

| Addon (loader) | Provides | 1.20.1 | 1.21.1 | Loader Support | Key Classes / Entry Points | Recommend When |
|---|---|---|---|---|---|---|
| startres (`startres`) | Startup resource/helper integration with KubeJS-facing helper classes | Yes | No | forge-only | `Startres`, `ClientSetup`, `IncarnationKubeJSHelper` | User needs startup-time resource/helper integration specific to startres-enabled packs |

Notes:
- `startres` is indexed as a specialized integration surface; treat it as opt-in pack-specific infrastructure.

## Capability-to-Addon Selection Matrix

| User intent | First pick | Secondary/adjacent picks | Avoid recommending first |
|---|---|---|---|
| Native Forge events in server/client scripts (1.20.1) | `eventjs` | core `ForgeEvents` (startup only) | `kubejs-additions` |
| Custom entities with scripted behaviors | `entityjs` | `animationjs`, `geckojs` (1.20.1) | `morejs` |
| Loot table manipulation | `lootjs` | `morejs` | `kubejs-additions` |
| Custom advancements | `advancementjs` (1.20.1) | core datapack JSON + KubeJS glue | `lootjs` |
| HUD/world rendering hooks | `renderjs` | core `ClientEvents`, `keybindjs` | `kubeutils` |
| Ponder instructional scenes | `ponderjs` | `renderjs` | `lootjs` |
| Keybind-driven gameplay logic | `keybindjs` (1.21.1) | core `ClientEvents` | `lootjs` |
| Script packaging for large codebases | `kubepackages` | `kubeloader`, `kubeutils` | `modifyjs` |
| HTTP or file I/O from scripts | `fetchjs` / `filesjs` (1.21.1) | `kubeutils` | `lootjs` |

## Core KubeJS Cross-Reference

Addon recommendations should always be validated against core event coverage first:
- Base event groups and script phase routing: `docs/reference/kubejs-api-surface.md`
- Damage mutation rules and `ForgeEvents` routing: `docs/reference/kubejs-api-surface.md`
- If core `ServerEvents`, `EntityEvents`, `ClientEvents`, or `StartupEvents` already solve the need, do not introduce an addon dependency.

## MCP Verification Queries

Run these queries before citing addon classes or recommending migration paths.

```text
# Event system
find_class(version="1.20.1", loader="eventjs", class_name="EventJSKubeJSPlugin")
find_class(version="1.20.1", loader="eventjs", class_name="SidedNativeEvents")
find_class(version="1.20.1", loader="eventjs", class_name="EventBusSelector")

# Entity / animation
find_class(version="1.21.1", loader="entityjs", class_name="EntityJSPlugin")
find_class(version="1.21.1", loader="animationjs", class_name="AnimationJSPlugin")
find_class(version="1.20.1", loader="geckojs", class_name="GeckoJSPlugin")
find_class(version="1.20.1", loader="player-animator", class_name="PlayerAnimAPI")

# Loot / data
find_class(version="1.21.1", loader="lootjs", class_name="LootEvents")
find_class(version="1.20.1", loader="advancementjs", class_name="AdvBuilder")
search(version="1.21.1", loader="morejs", query="EnchantmentTableEventJS")

# Rendering / UI
find_class(version="1.21.1", loader="renderjs", class_name="AddGuiRenderEvent")
find_class(version="1.21.1", loader="ponderjs", class_name="PonderEvents")
find_class(version="1.21.1", loader="keybindjs", class_name="KeyBindEvents")

# Utilities
find_class(version="1.21.1", loader="kubejs-additions", class_name="AdditionalEvents")
find_class(version="1.21.1", loader="kubeutils", class_name="KuEvents")
find_class(version="1.20.1", loader="kubeloader", class_name="ContentPackExplorer")
find_class(version="1.20.1", loader="kubepackages", class_name="ScriptLoadContext")
find_class(version="1.20.1", loader="modifyjs", class_name="ModifyJS")
find_class(version="1.21.1", loader="kubejs-offline", class_name="OfflinePlugin")

# I/O and resources
find_class(version="1.21.1", loader="fetchjs", class_name="HttpUtil")
find_class(version="1.21.1", loader="filesjs", class_name="FilesWrapper")
find_class(version="1.20.1", loader="startres", class_name="IncarnationKubeJSHelper")
```

If a class is not returned by MCP for the target version/loader, mark it `verify via MCP` and avoid hardcoding it in generated scripts.
