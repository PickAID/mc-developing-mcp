# Event System Catalog (Forge 1.20.1 / NeoForge 1.21.1)
This reference catalogs major event categories, bus routing, handler patterns, and version drift for Forge 1.20.1 and NeoForge 1.21.1. It is a planning/spec reference, not a tutorial.

## Scope
| Field | Value |
|---|---|
| Loaders | Forge 1.20.1, NeoForge 1.21.1 |
| Focus | Event bus architecture + major runtime and lifecycle categories |
| KubeJS | Cross-reference only (no full event list duplication) |
| Anti-goal | Exhaustive signature-level API index |

## Event Bus Architecture
Both loaders use a dual-bus model.

| Bus Type | Forge 1.20.1 | NeoForge 1.21.1 | Use |
|---|---|---|---|
| Game bus | `MinecraftForge.EVENT_BUS` | `NeoForge.EVENT_BUS` | Runtime gameplay and world events |
| Mod bus | `FMLJavaModLoadingContext.get().getModEventBus()` | Per-mod bus via `ModContainer#getEventBus()` | Registration and setup lifecycle events |

Routing rules:
- Game bus: entity/player/block/world/tick/server runtime handlers.
- Mod bus: registry/setup/model/renderer registration handlers.
- Never place gameplay logic on mod bus listeners.
- NeoForge mod-bus lifecycle execution may run in parallel; avoid unsafe shared mutable init state.

## Game Bus Event Categories
### Entity Events
| Key Classes | Notes |
|---|---|
| `LivingEvent` | Base family for living-entity lifecycle hooks |
| `LivingHurtEvent` | Forge-side pre-damage hook |
| `LivingDeathEvent` | Death handling |
| `EntityJoinLevelEvent` | Entity enters level |

### Player Events
| Key Classes | Notes |
|---|---|
| `PlayerEvent.*` | Login/logout, clone, progression hooks |
| `PlayerInteractEvent.*` | Click/use interactions with blocks/entities/items |

### Block Events
| Key Classes | Notes |
|---|---|
| `BlockEvent.BreakEvent` | Block break checks and side effects |
| `BlockEvent.EntityPlaceEvent` | Entity-driven placement checks |

### World / Level Events
| Key Classes | Notes |
|---|---|
| `LevelEvent.Load` | Level-scoped startup |
| `LevelEvent.Save` | Persistent flush and teardown prep |

### Tick Events
| Key Classes | Notes |
|---|---|
| `TickEvent.ServerTickEvent` | Server-wide periodic logic |
| `TickEvent.LevelTickEvent` | Per-level periodic logic |

Tick phase pattern:
- Tick events expose phase semantics (start/end) through tick event phase state.

### Server Lifecycle Events
| Key Classes | Notes |
|---|---|
| `ServerStartingEvent` | Startup-time wiring |
| `ServerStoppedEvent` | Shutdown cleanup |

### Rendering Events (Client Only)
| Key Classes | Notes |
|---|---|
| `RenderLevelStageEvent` | World-space render hooks |
| `RenderGuiOverlayEvent` | HUD/overlay rendering hooks |

Client-only rule:
- Rendering handlers are client-dist only.

### Input and Screen Events (Client Only)
| Key Classes | Notes |
|---|---|
| `InputEvent` | Keyboard/mouse input hooks |
| `ScreenEvent` | Screen lifecycle and interaction hooks |

## Mod Bus Event Categories
### Registration Events
| Key Classes | Notes |
|---|---|
| `RegisterEvent` | Direct registry callback flow |
| `RegisterKeyMappingsEvent` | Client key mapping registration |

### Setup Events
| Key Classes | Notes |
|---|---|
| `FMLCommonSetupEvent` | Common bootstrap and wiring |
| `FMLClientSetupEvent` | Client bootstrap hooks |

### Model Events
| Key Classes | Notes |
|---|---|
| `ModelEvent.RegisterAdditional` | Register additional models |
| `ModelEvent.ModifyBakingResult` | Modify baked model output |

### Renderer Registration
| Key Classes | Notes |
|---|---|
| `EntityRenderersEvent.RegisterRenderers` | Bind entity/block-entity renderers |

## Handler Patterns
### `@SubscribeEvent`
```java
@SubscribeEvent
public static void onLivingHurt(LivingHurtEvent event) {
    // inspect or mutate when API allows
}
```

### Subscriber registration
- Use `@Mod.EventBusSubscriber` for static subscriber classes.
- Specify bus target explicitly (game bus vs mod bus).
- Use manual registration when constructor-level control is clearer:
  - Runtime handlers -> `MinecraftForge.EVENT_BUS` / `NeoForge.EVENT_BUS`
  - Lifecycle handlers -> mod bus from context/container

### Priority and phase controls
- Use `EventPriority` (`HIGHEST` to `LOWEST`) for deterministic ordering.
- Use canceled-event reception only when intentionally observing canceled flows.
- Respect phase-aware events (especially tick phases).

## Forge vs NeoForge Differences
| Concern | Forge 1.20.1 | NeoForge 1.21.1 | Impact |
|---|---|---|---|
| Game bus root | `MinecraftForge.EVENT_BUS` | `NeoForge.EVENT_BUS` | Same role, different API root |
| Mod bus handle | `FMLJavaModLoadingContext.get().getModEventBus()` | `ModContainer#getEventBus()` | Different acquisition path |
| Damage pre-event pattern | `LivingHurtEvent` | `LivingIncomingDamageEvent` | Damage pipeline naming/flow changed |
| Setup event names | `FMLCommonSetupEvent`, `FMLClientSetupEvent` | Same names in `net.neoforged.fml.event.lifecycle` | Names stable, packages moved |
| Register event | `RegisterEvent` | `RegisterEvent` | Stable concept/name |
| Join-level event | `EntityJoinLevelEvent` | `EntityJoinLevelEvent` | Verify loader package path during migration |

## KubeJS Mapping (Cross-Reference)
Full KubeJS event inventory is maintained in:
- `docs/reference/kubejs-api-surface.md`

Minimal mapping:
- Entity/player gameplay hooks -> `EntityEvents`, `PlayerEvents`
- World/server lifecycle hooks -> `LevelEvents`, `ServerEvents`
- Registration/startup hooks -> `StartupEvents` and Forge bridge (`ForgeEvents`) in 1.20.1 `startup_scripts`

Damage mutability differences are already documented in `kubejs-api-surface.md` and should not be duplicated here.

## MCP Verification Queries
Run these before emitting migration or implementation guidance.

```text
# Bus architecture
search("MinecraftForge.EVENT_BUS", "1.20.1")
search("NeoForge.EVENT_BUS", "1.21.1")
search("getModEventBus", "1.20.1")
search("ModContainer", "1.21.1")
search("getEventBus", "1.21.1")

# Game bus categories
find_class("LivingEvent", "1.20.1")
find_class("LivingHurtEvent", "1.20.1")
find_class("LivingIncomingDamageEvent", "1.21.1")
find_class("LivingDeathEvent", "1.20.1")
find_class("EntityJoinLevelEvent", "1.20.1")
find_class("PlayerInteractEvent", "1.20.1")
find_class("BlockEvent", "1.20.1")
find_class("LevelEvent", "1.20.1")
find_class("TickEvent", "1.20.1")
find_class("ServerStartingEvent", "1.20.1")
find_class("ServerStoppedEvent", "1.20.1")

# Client-only events
find_class("RenderLevelStageEvent", "1.20.1")
find_class("RenderGuiOverlayEvent", "1.20.1")
find_class("InputEvent", "1.20.1")
find_class("ScreenEvent", "1.20.1")

# Mod bus categories
find_class("RegisterEvent", "1.20.1")
find_class("RegisterKeyMappingsEvent", "1.20.1")
find_class("FMLCommonSetupEvent", "1.20.1")
find_class("FMLClientSetupEvent", "1.21.1")
find_class("ModelEvent", "1.20.1")
find_class("EntityRenderersEvent", "1.20.1")
```

If any symbol is absent in corpus output, mark it as `verify via MCP` before using it in generated code.
