# Mod Structure and Lifecycle (Forge 1.20.1 / NeoForge 1.21.1)

This document is an architecture reference for AI code generation. It defines entrypoint, bus wiring, registration flow, and lifecycle ordering for Java mods.

## Scope and Constraints

| Field | Value |
|---|---|
| Target loaders | Forge 1.20.1, NeoForge 1.21.1 |
| Goal | Generate a clean mod skeleton with correct lifecycle wiring |
| Style | Registration-first architecture, client code isolated |
| Anti-goal | Tutorial prose, mixed-loader API calls |

## Loader Identity Matrix

| Concern | Forge 1.20.1 | NeoForge 1.21.1 |
|---|---|---|
| Primary package root | `net.minecraftforge.*` | `net.neoforged.*` |
| Mod annotation | `@Mod(MOD_ID)` | `@Mod(MOD_ID)` |
| Global/game bus | `MinecraftForge.EVENT_BUS` | `NeoForge.EVENT_BUS` |
| Mod lifecycle bus | `FMLJavaModLoadingContext.get().getModEventBus()` | Per-mod event bus (verify via MCP: `FMLJavaModLoadingContext` vs `ModContainer#getEventBus`) |
| Metadata file | `META-INF/mods.toml` | `META-INF/neoforge.mods.toml` |
| Deferred holder type | `RegistryObject<T>` | `DeferredHolder<T, R>` |

## Entrypoint Class Pattern

| Pattern | Forge 1.20.1 | NeoForge 1.21.1 |
|---|---|---|
| Main class | `public final class <ModName>` | `public final class <ModName>` |
| Annotation placement | On main class | On main class |
| Constructor role | Wire mod bus listeners, register `DeferredRegister`s, optionally register game-bus handlers | Same high-level role; ensure mod-bus listeners use per-mod bus |
| Static constants | `MOD_ID`, logger, registry singletons | Same |
| Client-only work | Deferred to client lifecycle event | Deferred to client lifecycle event |

Recommended constructor ordering:
1. Resolve mod bus handle.
2. Attach lifecycle listeners (`commonSetup`, `clientSetup` on client side path).
3. Call registration class `register(modBus)` methods.
4. Register gameplay handlers on game bus only when needed.

## Dual Event Bus Model

| Bus | Forge 1.20.1 | NeoForge 1.21.1 | Use for |
|---|---|---|---|
| Mod bus | From `FMLJavaModLoadingContext` | Per-mod bus, distinct from game bus | Registry + lifecycle events |
| Game bus | `MinecraftForge.EVENT_BUS` | `NeoForge.EVENT_BUS` | Runtime gameplay events |
| Execution model | Standard listener dispatch | Mod-bus lifecycle events may run in parallel; avoid unsafe shared mutation | Loader initialization and runtime hooks |

Bus rules for generation:
- Do not place gameplay `@SubscribeEvent` handlers on the mod bus.
- Do not perform registry creation from game bus listeners.
- Assume NeoForge mod-bus listeners can execute concurrently; protect shared init state or avoid shared mutable state.

## Deferred Register Pattern

| Concern | Forge 1.20.1 | NeoForge 1.21.1 |
|---|---|---|
| Register factory | `DeferredRegister.create(ForgeRegistries.<X>, MOD_ID)` | `DeferredRegister.create(Registries.<X>, MOD_ID)` (or loader-specific helper; verify via MCP) |
| Returned handles | `RegistryObject<Item>` etc. | `DeferredHolder<Item, Item>` etc. |
| Registration call site | `MY_REGISTER.register(modBus)` | `MY_REGISTER.register(modBus)` |
| Access timing | Resolve via supplier/getter after registration phase | Same principle |

Generation guardrails:
- Keep one registration class per domain (`ModItems`, `ModBlocks`, `ModTabs`, `ModEntities`).
- Declare holders as `public static final` fields.
- Avoid early static dereference of holders during class load.

## Lifecycle Events and Responsibilities

| Event | Bus | Forge 1.20.1 | NeoForge 1.21.1 | Responsibilities |
|---|---|---|---|---|
| `FMLCommonSetupEvent` | Mod bus | Yes | Yes | Network setup, capability/bootstrap wiring, deferred initialization |
| `FMLClientSetupEvent` | Mod bus (client dist only) | Yes | Yes | Render layers, screens, key mappings, client-only hooks |
| `RegisterEvent` | Mod bus | Present in modern Forge flow | Present in NeoForge flow | Direct registry callbacks when not using deferred-only flow |

Event wiring pattern:
- `modBus.addListener(this::commonSetup)`
- `modBus.addListener(this::clientSetup)` (only when compiling client path)
- Use `RegisterEvent` only when explicit registration callbacks are required; prefer `DeferredRegister` as default.

## Registration Order and Dependencies

| Order | Stage | Reason |
|---|---|---|
| 1 | Construct mod class and bind buses | Establish event channels |
| 2 | Register all `DeferredRegister` instances | Ensure holders exist before setup callbacks |
| 3 | Lifecycle setup (`FMLCommonSetupEvent`) | Configure systems that depend on registered content |
| 4 | Client setup (`FMLClientSetupEvent`) | Bind render/UI after common setup scaffolding |
| 5 | Runtime gameplay subscriptions | Start handling world/player/entity events |

Dependency rules:
- Items that depend on blocks should reference block holder suppliers, not raw instances.
- Block entities depend on registered block/entity types; wire after both registries are declared.
- Creative tab population should not force early class initialization of unrelated registries.

## Mod Metadata Files

| File | Loader | Required role |
|---|---|---|
| `META-INF/mods.toml` | Forge 1.20.1 | Declares mod id, version, dependencies, loader metadata |
| `META-INF/neoforge.mods.toml` | NeoForge 1.21.1 | NeoForge metadata equivalent; keep ids/dependencies aligned with code |

Metadata constraints:
- `modId` must match `@Mod(MOD_ID)` exactly.
- Dependency ranges in metadata must match compile/runtime target loader and Minecraft version.
- Keep display/version metadata in TOML authoritative for packaging.

## Typical Project Structure

```text
src/main/java/<pkg>/
  <ModName>.java                  # @Mod entrypoint, bus wiring
  registry/
    ModItems.java                 # DeferredRegister + holder fields
    ModBlocks.java
    ModBlockEntities.java
  setup/
    CommonSetup.java              # optional extraction for common setup logic
src/client/java/<pkg>/            # or guarded client package in main source set
  ClientSetup.java                # renderers, screens, client registrations
src/main/resources/
  META-INF/mods.toml              # Forge 1.20.1
  META-INF/neoforge.mods.toml     # NeoForge 1.21.1
  assets/<modid>/...
  data/<modid>/...
```

Side isolation rules:
- Keep client-only classes out of dedicated-server execution path.
- Gate client listeners by distribution checks or client-only source set.
- Treat physical side (client/server process) and logical side (game thread context) as separate concerns.

## Verification

Run MCP queries before final code emission.

```text
# Entrypoint and lifecycle classes
search("@Mod", "1.20.1")
search("@Mod", "1.21.1")
find_class("FMLJavaModLoadingContext", "1.20.1")
find_class("FMLCommonSetupEvent", "1.20.1")
find_class("FMLClientSetupEvent", "1.21.1")

# Bus identity and separation
search("MinecraftForge.EVENT_BUS", "1.20.1")
search("NeoForge.EVENT_BUS", "1.21.1")
search("getModEventBus", "1.20.1")
search("getEventBus", "1.21.1")

# Registration primitives
search("DeferredRegister", "1.20.1")
search("DeferredRegister", "1.21.1")
find_class("RegistryObject", "1.20.1")
find_class("DeferredHolder", "1.21.1")
find_class("RegisterEvent", "1.20.1")
find_class("RegisterEvent", "1.21.1")

# Metadata evidence
search("mods.toml", "1.20.1", loader="forge")
search("neoforge.mods.toml", "1.21.1", loader="neoforge")
```

If a symbol is absent, treat the pattern as unverified and emit `verify via MCP` in generated planning notes.

## DB Coverage Note

`FMLJavaModLoadingContext` is a real FML bootstrap class but is NOT indexed in the source DB (the DB covers mod API source, not FML loader internals). It is confirmed real through code references in indexed Forge source files. The same applies to other FML lifecycle infrastructure (`ModContainer`, `ModLoadingContext`).
