# KubeJS Addon Deep Dive (EventJS, EntityJS, LootJS, RenderJS)

This reference drills into the four highest-impact KubeJS addons for scripted content packs. It is source-driven and MCP-verified, focused on API surfaces and usage patterns rather than step-by-step tutorials.

## Scope

| Field | Value |
|---|---|
| Addons covered | `eventjs`, `entityjs`, `lootjs`, `renderjs` |
| Versions | Forge 1.20.1, NeoForge 1.21.1 |
| Evidence | Java sources under `sources/{version}/{addon}/sources` + MCP `find_class` |
| Cross-reference | `docs/reference/kubejs-addon-ecosystem.md` |
| Core API baseline | `docs/reference/kubejs-api-surface.md` |

Notes:
- All class names below are verified via MCP unless explicitly marked `verify via MCP`.
- Script snippets show API usage patterns observed in addon source and KubeJS event group wiring.
- Version rows are separated; do not mix 1.20.1 and 1.21.1 runtime assumptions.

## EventJS

### Overview

EventJS is a KubeJS addon by ZZZank that provides reloadable, sided native Forge event listening for KubeJS 1.16–1.20. It backports the `NativeEvents` binding that KubeJS 1.21+ has built-in, making native Forge events accessible in all 3 script types on 1.20.1.

**Key value proposition**: Without EventJS, `ForgeEvents.onEvent(...)` is restricted to `startup_scripts` in core KubeJS 1.20.1. With EventJS, `NativeEvents.onEvent(...)` works in `server_scripts` and `client_scripts` too.

### Verified Class Surface

| Class | Package | 1.20.1 (Forge) | Role |
|---|---|---|---|
| `EventJSKubeJSPlugin` | `zank.mods.eventjs` | yes | KubeJS plugin — registers `NativeEvents` binding per script type |
| `SidedNativeEvents` | `zank.mods.eventjs` | yes | Core API class — manages per-side event listener registration and lifecycle |
| `EventBusSelector` | `zank.mods.eventjs` | yes | Enum (AUTO/FORGE/MOD) — selects correct event bus per event type |
| `EventJSMod` | `zank.mods.eventjs` | yes | Forge `@Mod` entry point — captures MOD bus reference |
| `MixinForgeEventWrapper` | `zank.mods.eventjs.mixin` | yes | Mixin into KubeJS `ForgeEventWrapper` — makes `ForgeEvents.onEvent(...)` reloadable |
| `MixinScriptManager` | `zank.mods.eventjs.mixin` | yes | Mixin into KubeJS script manager — handles listener cleanup on reload |

### Binding Mechanism

`EventJSKubeJSPlugin.registerBindings(BindingsEvent event)` calls:
```java
event.add("NativeEvents", SidedNativeEvents.byType(event.manager.scriptType));
```

This means each script type (STARTUP, SERVER, CLIENT) gets its own `SidedNativeEvents` instance. Listeners registered in `server_scripts` only fire during server events and are unloaded on server script reload.

### API Surface (`SidedNativeEvents`)

| Method | Parameters | Description |
|---|---|---|
| `onEvent` | `(Class<T> eventType, Consumer<T> handler)` | Listen to event with NORMAL priority |
| `onEvent` | `(EventPriority priority, boolean receiveCancelled, Class<T> eventType, Consumer<T> handler)` | Listen with custom priority |
| `onGenericEvent` | `(Class<F> genericFilter, Class<T> eventType, Consumer<T> handler)` | Generic event with NORMAL priority |
| `onGenericEvent` | `(Class<F> genericFilter, EventPriority priority, boolean receiveCancelled, Class<T> eventType, Consumer<T> handler)` | Generic event with custom priority |
| `getHandlerCount()` | none | Returns number of registered handlers |

### Bus Auto-Selection

`EventBusSelector.AUTO` (default) determines the correct bus:
- If `eventType` implements `IModBusEvent` → MOD event bus (`FMLJavaModLoadingContext.getModEventBus()`)
- Otherwise → FORGE event bus (`MinecraftForge.EVENT_BUS`)

### Script Pattern: Native Events in server_scripts (1.20.1)

```js
// server_scripts/custom_damage.js — requires EventJS addon
NativeEvents.onEvent(
    Java.loadClass("net.minecraftforge.event.entity.living.LivingHurtEvent"),
    event => {
        // Mutable — LivingHurtEvent has setAmount()
        if (event.getEntity().type == "minecraft:player") {
            event.setAmount(event.getAmount() * 0.5)
        }
    }
)
```

```js
// server_scripts/block_break_tracking.js — requires EventJS addon
NativeEvents.onEvent(
    Java.loadClass("net.minecraftforge.event.level.BlockEvent$BreakEvent"),
    event => {
        let player = event.getPlayer()
        player.tell("You broke: " + event.getState().getBlock().getName().getString())
    }
)
```

```js
// client_scripts/client_tick.js — requires EventJS addon
NativeEvents.onEvent(
    Java.loadClass("net.minecraftforge.event.TickEvent$ClientTickEvent"),
    event => {
        if (event.phase.toString() == "END") {
            // Client-side tick logic
        }
    }
)
```

### Script Pattern: Custom Priority and Cancellation

```js
// server_scripts/early_damage_intercept.js — requires EventJS addon
let LivingHurtEvent = Java.loadClass("net.minecraftforge.event.entity.living.LivingHurtEvent")
let EventPriority = Java.loadClass("net.minecraftforge.eventbus.api.EventPriority")

NativeEvents.onEvent(
    EventPriority.HIGHEST,  // Run before other handlers
    true,                    // Receive already-cancelled events
    LivingHurtEvent,
    event => {
        if (event.getAmount() > 20) {
            event.setCanceled(true)  // Cancel lethal hits
        }
    }
)
```

### Comparison: ForgeEvents vs NativeEvents (1.20.1)

| Feature | `ForgeEvents.onEvent(...)` (core) | `NativeEvents.onEvent(...)` (EventJS) |
|---|---|---|
| Script types | `startup_scripts` only | All 3 (startup/server/client) |
| Event class parameter | String class name | `Class` via `Java.loadClass(...)` |
| Reloadable | No (without EventJS) / Yes (with EventJS mixin) | Yes (built-in) |
| Error safety | Script crash on error | Caught and logged, game continues |
| Priority control | Not exposed | `EventPriority` parameter |
| Cancellation control | Not exposed | `receiveCancelled` parameter |
| Generic events | `ForgeEvents.onGenericEvent(...)` | `NativeEvents.onGenericEvent(...)` |
| Bus selection | Forge bus only | Auto (FORGE or MOD based on event type) |

### Key Constraint

EventJS is **1.20.1 only** (and 1.16–1.19). On 1.21.1, core KubeJS has built-in `NativeEvents` via `NativeEventWrapper` — do NOT recommend EventJS for 1.21.1.

### Verified Class Surface

| Class | 1.20.1 (Forge) | 1.21.1 (NeoForge) | Evidence |
|---|---|---|---|
| `EntityJSPlugin` | yes | yes | Registers entity builder types and bindings |
| `BaseLivingEntityBuilder` | yes | yes | Core living entity builder API |
| `BaseEntityBuilder` | yes | yes | Core non-living entity builder API |
| `AddGoalSelectorsEventJS` | yes | yes | Goal selector wrapper used by `EntityJSEvents.addGoalSelectors` |

### Builder Pattern Surface

EntityJS uses builder registration against `ENTITY_TYPE` and exposes specialized type keys:

| Type Key | Builder Class | Purpose |
|---|---|---|
| `entityjs:living` | `BaseLivingEntityJSBuilder` | Generic living entities |
| `entityjs:mob` | `MobEntityJSBuilder` | Pathfinder mob behavior |
| `entityjs:animal` | `AnimalEntityJSBuilder` | Animal behavior stack |
| `entityjs:tamable` | `TameableMobJSBuilder` | Tameable entity behavior |
| `entityjs:nonliving` | `BaseEntityJSBuilder` | Non-living entities/projectiles |

Key builder inheritance anchors:
- Living path: `BaseLivingEntityBuilder<T extends LivingEntity & IAnimatableJS>`
- Non-living path: `BaseEntityBuilder<T extends Entity & IAnimatableJSNL>`

Representative builder methods exposed in source (`BaseLivingEntityBuilder` / `BaseEntityBuilder`):
- Shape and sync: `sized`, `clientTrackingRange`, `updateInterval`, `mobCategory`
- Resources: `modelResource`, `textureResource`, `animationResource`
- Lifecycle/hooks: `onHurt`, `onDeath`, `onInteract`, `aiStep`, `onAddedToWorld`, `onRemovedFromWorld`
- Render controls: `render`, `renderFinal`, `scaleModelForRender`, `newGeoLayer`

### Event Hook Surface

`EntityJSEvents` registers server/startup event handlers in source:

| Event key | Script-side group | Purpose |
|---|---|---|
| `addGoalSelectors` | `EntityJSEvents` | Add/remove AI goals via `AddGoalSelectorsEventJS` |
| `addGoals` | `EntityJSEvents` | Goal targets wrapper (`AddGoalTargetsEventJS`) |
| `createAttributes` | `EntityJSEvents` | Startup attribute creation integration |
| `modifyEntity` | `EntityJSEvents` | Startup entity modification path |
| `spawnPlacement` | `EntityJSEvents` | Startup spawn placement registration |

`AddGoalSelectorsEventJS` exposes explicit goal methods including:
- goal control: `removeGoal`, `removeGoals`, `removeAllGoals`, `arbitraryGoal`, `customGoal`
- AI primitives: `meleeAttack`, `randomStroll`, `lookAtEntity`, `panic`, `tempt`, `followParent`, `followOwner`, `randomLookAround`

### Script Pattern: Custom Mob + Goal Wiring

```js
// startup_scripts/entity_types.js
StartupEvents.registry('entity_type', event => {
  event.create('kubejs:storm_hound', 'entityjs:animal')
    .sized(0.9, 1.2)
    .mobCategory('creature')
    .clientTrackingRange(10)
    .updateInterval(1)
    .onHurt(ctx => {
      const { entity } = ctx
      entity.setSecondsOnFire(2)
    })
    .onDeath(ctx => {
      const { entity, source } = ctx
      if (source != null) {
        entity.setGlowingTag(true)
      }
    })
})

// server_scripts/entity_ai.js
EntityJSEvents.addGoalSelectors('kubejs:storm_hound', event => {
  event.removeAllGoals()
  event.floatSwim(0)
  event.meleeAttack(1, 1.2, true)
  event.randomStroll(5, 1.0, 120, true)
  event.randomLookAround(7)
})
```

### Version Drift (1.20.1 -> 1.21.1)

| Area | 1.20.1 | 1.21.1 |
|---|---|---|
| KubeJS plugin base | `KubeJSPlugin` class extension style | `KubeJSPlugin` interface-style plugin registration |
| Event registration signature | internal `registerEvents()` registration flow | explicit `registerEvents(EventGroupRegistry registry)` |
| Builder registration API | `RegistryInfo.ENTITY_TYPE.addType(...)` | `BuilderTypeRegistry` / `registry.of(...)` flow |
| Script surface intent | compatible builder/event shape retained | compatible builder/event shape retained |

Operationally, keep script semantics aligned with `kubejs-api-surface.md` script-phase routing and avoid cross-version event assumptions.

## LootJS

### Verified Class Surface

| Class | 1.20.1 (Forge) | 1.21.1 (NeoForge) | Notes |
|---|---|---|---|
| `LootContextJS` | yes | `verify via MCP` | Present in `com.almostreliable.lootjs.kube` on 1.20.1 only |
| `LootEvents` | `verify via MCP` | yes | NeoForge-side table/modifier listener entry point |
| `AbstractLootModification` | yes | `verify via MCP` | Present in old `core` path on 1.20.1 |
| `LootModificationEventJS` | yes | yes | `LootJS.modifiers` event payload class |

### Modification Entry Points

Common script event group:
- `LootJS.modifiers(event => { ... })`

In `LootModificationEventJS` (1.20.1 source), primary entry methods:
- `addLootTableModifier(ResourceLocationFilter...)`
- `addLootTypeModifier(LootContextType...)`
- `addBlockLootModifier(Object blockPredicate)`
- `addEntityLootModifier(EntityType<?>...)`
- global toggles: `disableWitherStarDrop`, `disableCreeperHeadDrop`, `disableSkeletonHeadDrop`, `disableZombieHeadDrop`

1.21.1 internal flow introduces `LootEvents.listen(...)` and `LootEvents.listenModifiers(...)` hooks to feed Kube events (`LootJSEvent.MODIFIERS`, `LootJSEvent.LOOT_TABLES`).

### Conditions, Actions, Functions Pattern

`LootActionsBuilderJS` composes handlers that include conditions and actions:

| Layer | Representative API |
|---|---|
| Conditions (`LootConditionsContainer`) | `matchLoot`, `killedByPlayer`, `randomChance`, `randomChanceWithLooting`, `biome`, `anyDimension`, `not`, `or`, `and` |
| Actions (`LootActionsContainer`) | `addLoot`, `removeLoot`, `replaceLoot`, `modifyLoot`, `dropExperience`, `triggerExplosion`, `triggerLightningStrike` |
| Functions (`LootFunctionsContainer`) | `smeltLoot`, `enchantRandomly`, `enchantWithLevels`, `limitCount`, `setName`, `addNbt`, filtered `functions(...)` |
| Context-level callback | `apply(Consumer<LootContextJS>)` |

### Script Pattern: Entity Drops, Chest Loot, Conditional Control

```js
// server_scripts/loot_modifiers.js
LootJS.modifiers(event => {
  // Entity drop augmentation
  event.addEntityLootModifier('minecraft:zombie')
    .killedByPlayer()
    .randomChanceWithLooting(0.05, 0.02)
    .addLoot('minecraft:emerald')

  // Chest loot table injection
  event.addLootTableModifier('minecraft:chests/simple_dungeon')
    .addLoot('minecraft:golden_apple')

  // Conditional behavior with loot context access
  event.addLootTableModifier('minecraft:entities:skeleton')
    .randomChance(0.5)
    .apply(ctx => {
      if (ctx.isExploded()) {
        ctx.removeLoot('minecraft:arrow')
      }
    })
})
```

### Version Drift (1.20.1 -> 1.21.1)

| Area | 1.20.1 | 1.21.1 |
|---|---|---|
| Context class | `LootContextJS` exposed in `kube` package | `LootContextJS` not MCP-resolved in 1.21.1 corpus |
| Internal event bridge | `LootModificationEventJS` builds `LootModificationBy*` actions | `LootEvents` class introduces `listen` / `listenModifiers` event relay |
| Event group | `LootJS.modifiers` | `LootJS.modifiers` plus `LootJS.lootTables` |
| Core abstract type | `AbstractLootModification` class in `core` | not MCP-resolved in 1.21.1 corpus |

When generating scripts, pin examples to the target version's resolved classes and avoid carrying 1.20.1 internals into 1.21.1 outputs.

## RenderJS

### Verified Class Surface

| Class | 1.20.1 (Forge) | 1.21.1 (NeoForge) | Notes |
|---|---|---|---|
| `AddGuiRenderEvent` | yes | `verify via MCP` | Deprecated wrapper in 1.20.1 source |
| `AddWorldRenderEvent` | yes | `verify via MCP` | Deprecated wrapper in 1.20.1 source |
| `IGuiRenderEvent` | yes | yes | GUI event abstraction interface |
| `RenderJSEvents` | yes | yes | Event group bridge used for client render events |

### GUI and World Render Wrappers

1.20.1 includes explicit wrapper events:
- `RenderJSEvents.AddGuiRender` -> payload `AddGuiRenderEvent`
- `RenderJSEvents.AddWorldRender` -> payload `AddWorldRenderEvent`

`AddGuiRenderEvent.addRender(...)` and `AddWorldRenderEvent.addWorldRender(...)` are marked deprecated in source comments.

1.21.1 shifts emphasis to structured render-phase events in `RenderJSEvents`:
- `onGuiPreRender`, `onGuiPostRender`
- `onLevelRender`
- `onScreenPreRender`, `onScreenPostRender`

### Event Data and Helper Surface

`IGuiRenderEvent` exposes:
- `getEvent()`
- `getWindow()`
- `getPoseStack()`
- `getPartialTick()`

Client bindings (plugin registration) include:
- `GuiRenderHelper` (`IGuiRenderHelper`)
- `LevelRenderHelper` (`ILevelRenderHelper`)
- `RenderJSRenderSystem`, `RenderJSRenderType`, `GuiGraphics`, `PoseStack`

### Script Pattern: HUD Overlay + World-Space Draw

```js
// client_scripts/render_layers.js
RenderJSEvents.onGuiPostRender(event => {
  const w = event.getWindow().getGuiScaledWidth()
  GuiRenderHelper.fill(8, 8, 148, 24, 0x88000000)
  GuiRenderHelper.hLine(8, Math.min(w - 8, 148), 8, 0xFF55FFFF)
})

RenderJSEvents.onLevelRender(event => {
  if (event.getStage() != RenderJSLevelRenderStage.AFTER_SOLID_BLOCKS) return

  const pose = event.getPoseStack()
  pose.pushPose()
  LevelRenderHelper.setTranslucentBlockRenderType()
  LevelRenderHelper.setColor(255, 64, 64, 96)
  LevelRenderHelper.transformerCamera(pose, event.getCamera())
  // renderSingleBlock / renderLevelItem calls go here with your prepared BlockState or ItemStack
  pose.popPose()
  LevelRenderHelper.restColor()
  LevelRenderHelper.restBlockRenderType()
})
```

### RenderJS vs Core `ClientEvents`

| Use case | Prefer | Reason |
|---|---|---|
| Basic client ticks/input/tooltips already in core groups | Core `ClientEvents` | Fewer addon dependencies |
| Fine-grained GUI render stage hooks with helper APIs | `RenderJSEvents.onGui*Render` | Direct render event wrappers + helper methods |
| World-stage drawing with camera/pipeline helpers | `RenderJSEvents.onLevelRender` | Stage-aware level render context |
| Legacy packs on 1.20.1 using wrapper events | `AddGuiRender` / `AddWorldRender` | Backward compatibility only; wrappers are deprecated |

## MCP Verification Queries

Run these before reusing class names in generated scripts/docs:

```text
# EventJS
echo '{"jsonrpc":"2.0","id":0,"method":"find_class","params":{"class_name":"EventJSKubeJSPlugin","version":"1.20.1","loader":"eventjs"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":0,"method":"find_class","params":{"class_name":"SidedNativeEvents","version":"1.20.1","loader":"eventjs"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":0,"method":"find_class","params":{"class_name":"EventBusSelector","version":"1.20.1","loader":"eventjs"}}' | python3 Mc-Skill/mcp_server/server.py

# EntityJS
echo '{"jsonrpc":"2.0","id":1,"method":"find_class","params":{"class_name":"EntityJSPlugin","version":"1.20.1","loader":"entityjs"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":2,"method":"find_class","params":{"class_name":"BaseLivingEntityBuilder","version":"1.20.1","loader":"entityjs"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":3,"method":"find_class","params":{"class_name":"BaseEntityBuilder","version":"1.20.1","loader":"entityjs"}}' | python3 Mc-Skill/mcp_server/server.py

# LootJS
echo '{"jsonrpc":"2.0","id":4,"method":"find_class","params":{"class_name":"LootContextJS","version":"1.20.1","loader":"lootjs"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":5,"method":"find_class","params":{"class_name":"LootEvents","version":"1.21.1","loader":"lootjs"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":6,"method":"find_class","params":{"class_name":"AbstractLootModification","version":"1.20.1","loader":"lootjs"}}' | python3 Mc-Skill/mcp_server/server.py

# RenderJS
echo '{"jsonrpc":"2.0","id":7,"method":"find_class","params":{"class_name":"AddGuiRenderEvent","version":"1.20.1","loader":"renderjs"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":8,"method":"find_class","params":{"class_name":"AddWorldRenderEvent","version":"1.20.1","loader":"renderjs"}}' | python3 Mc-Skill/mcp_server/server.py
echo '{"jsonrpc":"2.0","id":9,"method":"find_class","params":{"class_name":"IGuiRenderEvent","version":"1.20.1","loader":"renderjs"}}' | python3 Mc-Skill/mcp_server/server.py
```

If `result` is empty for the target version/loader, keep the symbol marked `verify via MCP` and avoid asserting availability.
