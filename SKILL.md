---
name: minecraft-mcp-service
description: |
  Source-backed Minecraft coding skill for KubeJS, Forge/NeoForge, Mixin, and
  vanilla Java Edition across 1.20.1-1.21.1. All answers must be grounded in
  indexed Java source using the MCP server tools only. Covers 36 third-party
  libraries with version isolation, documentation search, and mutability
  verification.
---

# Minecraft MCP Skill

## Mission

Generate correct Minecraft modding code and answer modding questions using indexed source code as the sole authority. Every API name, method signature, event, and mutability claim must be verified from source before output.

## Non-Negotiable Rules

1. **No guessed APIs.** Verify with `search` / `find_class` before emitting any class or method name.
2. **No code without source evidence.** Use `read_source` to confirm signatures before output.
3. **Always specify `version` and `loader`.** Never mix versions. Never assume cross-version compatibility.
4. **Use only implemented MCP methods.** Do not invent methods that don't exist in this file.
5. **If uncertain, say so.** Return "not verified" and show what was checked rather than guessing.
6. **Check mutability before emitting setters.** A getter does not imply a setter exists. See [Mutability Contracts](docs/reference/mutability-contracts.md).

## Data Architecture

Two SQLite databases (AST-indexed, FTS5, no vector embeddings): `data/minecraft_sources.sqlite` (76k+ Java files, 36 libraries, version-isolated) and `data/minecraft_docs.sqlite` (320 doc pages, 48 library/version entries). All source content stored — sub-millisecond queries via LRU + mmap.

## MCP Methods

Newline-delimited JSON-RPC over stdin/stdout. **These 18 methods are the only valid methods.**

### Source Methods (8)

#### 1. `versions()`
- Params: `{}`
- Returns: `[{version, loader, file_count}]`
- Use: confirm available corpora at session start.

#### 2. `search(version, loader, query, limit?)`
- Required: `version`, `loader`, `query`
- Optional: `limit` (default 20, max 200)
- Returns: ranked rows with `rel_path`, `class_name`, `package_name`, `superclass`, `rank`
- Use: fuzzy discovery when class/method name is unknown.
- Auto-fallback: appends `third_party` hits when primary results are sparse (<3).

#### 3. `find_class(version, loader, class_name)`
- Required: `version`, `loader`, `class_name`
- Returns: class location and metadata, or `{}`
- Use: exact class lookup.
- Auto-fallback: checks `third_party` when not found in requested version/loader.

`search` vs `find_class`: `search` is fuzzy across all symbols. `find_class` is exact name match. Do not substitute one for the other in final verification.

#### 4. `get_class_detail(version, loader, class_name)`
- Required: `version`, `loader`, `class_name`
- Returns: `{classes, methods, fields, events}` for the file containing the class.

#### 5. `get_hierarchy(version, loader, class_name)`
- Required: `version`, `loader`, `class_name`
- Returns: `{class_name, extends_chain, implements}`

#### 6. `find_implementations(version, loader, interface_or_class)`
- Required: `version`, `loader`, `interface_or_class`
- Returns: list of classes extending or implementing the target.
- Note: param name is `interface_or_class`, not `class_name`.

#### 7. `read_source(version, loader, path, start?, end?)`
- Required: `version`, `loader`, `path`
- Optional: `start`, `end` (line numbers, default 1-200)
- Returns: `{content, total_lines, path}`
- Note: `path` is relative to corpus root. Do not prefix with `sources/`.

#### 8. `list_package(version, loader, package_prefix, limit?)`
- Required: `version`, `loader`, `package_prefix`
- Optional: `limit` (default 100, max 1000)
- Returns: classes under the package prefix (dot-separated Java format).

### Documentation Methods (2)

#### 9. `search_docs(query, library?, version?, limit?)`
- Required: `query`
- Optional: `library`, `version`, `limit` (default 20, max 100)
- Returns: `[{id, library, version, category, slug, title, snippet, rank}]`
- Use: find documentation pages by keyword.

#### 10. `read_doc(id)`
- Required: `id` (positive integer from `search_docs` results)
- Returns: `{library, version, category, slug, title, content, format, source_url}`
- Use: retrieve full documentation page content.

### Local KubeJS Project Methods (8)

#### 11. `kubejs_project_env(project_root?)`
- Optional: `project_root`
- Returns: `{project_root, minecraft_version, loader, version_source, loader_source, kubejs_roots}`
- Use: auto-detect local KubeJS environment and version.
- Default behavior: if `project_root` is omitted, server checks the Prism instance path and defaults version to `1.20.1` when metadata cannot be detected.

#### 12. `kubejs_project_scan(project_root?, max_files?, refresh?)`
- Optional: `project_root`, `max_files` (default 3000, max 20000), `refresh` (default false)
- Returns: project structure + symbol summary (`kubejs_roots`, `probe_dirs`, `script_counts`, `resource_counts`, `symbol_count`, `symbol_count_by_kind`, `truncated`)
- Use: build in-memory index for local KubeJS + ProbeJS artifacts.

#### 13. `kubejs_project_search(query, project_root?, kind?, limit?, max_files?, refresh?)`
- Required: `query`
- Optional: `project_root`, `kind`, `limit` (default 50, max 500), `max_files`, `refresh`
- Returns: symbol hits including functions/methods/properties/snippets/registry items from local ProbeJS/KubeJS project files.

#### 14. `kubejs_project_multi_search(queries, project_root?, kind?, per_query_limit?, max_files?, refresh?)`
- Required: `queries` (array of query strings)
- Optional: `project_root`, `kind`, `per_query_limit`, `max_files`, `refresh`
- Returns: map of query -> hit list; use to reduce MCP round-trips.

#### 15. `kubejs_project_context(project_root?, max_files?, refresh?, sample_queries?, per_query_limit?)`
- Optional: `project_root`, `max_files`, `refresh`, `sample_queries`, `per_query_limit`
- Returns: `{env, scan, sample_queries, query_hits}` in one call.
- Use: fast bootstrap for agents that need full project understanding with minimal tool calls.

#### 16. `kubejs_project_read(path, project_root?, start?, end?)`
- Required: `path`
- Optional: `project_root`, `start`, `end`
- Returns: `{project_root, path, start, end, total_lines, content}`
- Use: read local KubeJS project file safely (path constrained under project root).

#### 17. `kubejs_project_triage(issue?, queries?, project_root?, max_files?, refresh?, per_query_limit?, max_queries?, top_path_limit?)`
- Required: one of `issue` or `queries`
- Optional: `project_root`, `max_files`, `refresh`, `per_query_limit`, `max_queries`, `top_path_limit`
- Returns: `{queries, env, scan, hits_by_query, top_paths, guidance}` in one call.
- Use: one-shot issue investigation to reduce repeated search/read MCP loops.

#### 18. `kubejs_datapack_guardrails(project_root?, max_files?, refresh?)`
- Optional: `project_root`, `max_files`, `refresh`
- Returns: `{minecraft_version, summary, findings, guidance}` with version-aware registry/worldgen guardrail checks.
- Use: detect invalid datapack-registry patterns (especially `StartupEvents.registry` misuse) and provide migration guidance across 1.20.x and 1.21.1+.

### Common Parameter Mistakes

| Mistake | Correct |
|---|---|
| `find_implementations` with `class_name` | Use `interface_or_class` |
| `read_source` path prefixed with `sources/` | Use relative path only |
| `list_package` with `/` separators | Use `.` (Java package format) |
| Omitting `project_root` for local project tools | Allowed; server auto-detects and defaults safely |
| Calling `find_event` or `compare_api` | These methods do not exist |
| Using `name` instead of `class_name` | Param name must be exact |

## Verification Workflows

### Known class

1. `find_class(version, loader, "ClassName")`
2. `get_class_detail(version, loader, "ClassName")`
3. `read_source(version, loader, path, start, end)`

### Concept / fuzzy search

1. `search(version, loader, "keywords")`
2. `get_class_detail` on top hits
3. `read_source` for final verification

### Inheritance

1. `get_hierarchy(version, loader, "ClassName")`
2. `find_implementations(version, loader, "InterfaceOrBase")`
3. `read_source` for proof

### Mutability check (REQUIRED before emitting setters)

1. `get_class_detail(version, loader, "EventClassName")` — list all methods
2. Identify matching `get*` / `set*` pairs on the same property
3. If setter exists: mutable. If only getter: **read-only — do not emit setter calls.**
4. Always verify in the correct version+loader. Mutability changes across versions.
5. Reference: [Mutability Contracts](docs/reference/mutability-contracts.md)

### Third-party fallback

1. `find_class(version, loader, "ClassName")` — auto-checks `third_party` on miss
2. If result has `version="third_party"`, use returned version/loader/rel_path for follow-up calls
3. Reference: [Third-Party Quick Reference](docs/reference/third-party-quick-ref.md)

### Documentation search

1. `search_docs(query="topic", library="libname", version="1.20.1")`
2. `read_doc(id=N)` for full content
3. Cross-reference with source methods for verification

## KubeJS Strategy

### 1. Event-driven scripts

KubeJS code is event-first. Route by script phase before writing:

| Phase | Directory | Event Groups | Notes |
|---|---|---|---|
| Startup | `startup_scripts/` | StartupEvents, ForgeEvents (1.20.1), registry events | Runs once at load. Not hot-reload safe. |
| Server | `server_scripts/` | ServerEvents, PlayerEvents, EntityEvents, BlockEvents, LevelEvents, RecipeEvents, ItemEvents | Server-side behavior. Hot-reloadable via `/reload`. |
| Client | `client_scripts/` | ClientEvents, painting events, tooltip events | Client-only rendering/UI. |

Verify event names in source for the exact version + loader. Never reuse events from another version by memory.

### 2. Java interop: `Java.loadClass`

For Java interop, use `Java.loadClass("fully.qualified.Name")`. Verification chain:
1. `find_class(version, target_loader, "ClassName")`
2. `read_source(version, target_loader, rel_path)` — confirm the class and method exist
3. Only then emit the KubeJS snippet.

If the class is missing, report "not verified" and stop.

### 3. ForgeEvents / NativeEvents

- **1.20.1 (core)**: `ForgeEvents.onEvent("fully.qualified.EventClass", handler)` in `startup_scripts` only. Accesses Forge event bus directly.
- **1.20.1 (with EventJS addon)**: `NativeEvents.onEvent(Java.loadClass("fully.qualified.EventClass"), handler)` works in **all 3 script types** (startup/server/client). EventJS (`zank.mods.eventjs`) provides `SidedNativeEvents` per script type. Auto-selects FORGE vs MOD bus. Handlers are reloadable and error-safe. Always confirm EventJS is installed before using `NativeEvents` on 1.20.1.
- **1.21.1**: KubeJS provides built-in `NativeEvents` via `NativeEventWrapper` in all script types. No addon needed.
- Never translate `ForgeEvents` to `NativeEvents` automatically. Prove the binding exists with `search` + `read_source`. On 1.20.1, check if EventJS addon is present before suggesting `NativeEvents`.

### 4. Runtime guardrails

KubeJS is NOT a browser/Node environment. These features are unavailable:

| Feature | Status | Alternative |
|---|---|---|
| `fetch` | Unavailable | Use Java.loadClass for HTTP if needed |
| `Promise` | Unavailable | Event-driven handlers |
| `setTimeout` / `setInterval` | Binding exists but workspace policy: not usable | Tick/scheduler patterns |
| ES `class` syntax | Unavailable | Object literals, factory functions |

When source evidence and workspace policy conflict, report both explicitly.

### 5. 1.20.1 Damage Mutation (Critical)

`EntityEvents.hurt` is READ-ONLY in 1.20.1 — no damage setter exists on `LivingEntityHurtEventJS`. For mutable damage access, verify the correct path via `get_class_detail` before emitting any pattern. See [Mutability Contracts](docs/reference/mutability-contracts.md) and [KubeJS API Surface](docs/reference/kubejs-api-surface.md) for the source-verified patterns and version comparison.

### 6. Version drift

Event names drift across versions. Key changes:

| 1.20.1 | 1.21.1 | Change |
|---|---|---|
| `EntityEvents.hurt` | `EntityEvents.beforeHurt` | Renamed + setter added |
| — | `EntityEvents.afterHurt` | New (read-only) |
| `WorldgenEvents.*` | Removed | No replacement |
| `JEIEvents.*` / `REIEvents.*` | `RecipeViewerEvents.*` | Unified |
| — | `KeyBindEvents.*` | New |
| Package: `bindings.event` | Package: `plugin.builtin.event` | Restructured |

For migration questions, produce side-by-side evidence from both versions. Never claim compatibility without `read_source` proof in both.

Full reference: [Version Migration Map](docs/reference/version-migration-map.md)

## Strategy: BlockEntity Development

Use when implementing a BlockEntity, ticker, state sync, or persistent NBT logic.
1. `find_class(version, loader, "BlockEntity")` to anchor the base type and package.
2. `get_class_detail(version, loader, "BlockEntity")` to inspect lifecycle methods and fields.
3. `search(version, loader, "getUpdateTag getUpdatePacket ClientboundBlockEntityDataPacket")` for sync surface.
4. `search(version, loader, "setChanged level.sendBlockUpdated")` for save/update triggers.
5. `read_source` on top concrete classes from step 3-4 to capture construction + sync patterns.
6. Verify server/client split before writing packet-triggered behavior.
7. Emit code only after signatures are confirmed in source.
8. Reference: [BlockEntity Architecture](docs/reference/blockentity-architecture.md).

## Strategy: GUI/Menu System

Use when building an inventory container, slot layout, and client screen.
1. `find_class(version, loader, "AbstractContainerMenu")` to ground server menu contracts.
2. `get_class_detail(version, loader, "AbstractContainerMenu")` for `stillValid`, slot, and data-sync methods.
3. `search(version, loader, "MenuType")` to identify registration and constructor patterns.
4. `search(version, loader, "AbstractContainerScreen")` for client binding and render hooks.
5. `read_source` on paired menu/screen examples with matching `MenuType` wiring.
6. Verify factory path (`MenuType` + screen registration) per loader/version.
7. Emit both server and client pieces together; do not output partial wiring.
8. Reference: [GUI/Menu System](docs/reference/gui-menu-system.md).

## Strategy: Custom Rendering

Use when implementing BER, entity renderer, layer renderer, or custom RenderType usage.
1. `find_class(version, loader, "BlockEntityRenderer")` to confirm BER interface and render signature.
2. `search(version, loader, "EntityRenderer")` for entity-side renderer base classes.
3. `search(version, loader, "RenderType")` to locate pipeline/state presets and buffers.
4. `search(version, loader, "BlockEntityRenderers.register EntityRenderers.register")` for registration hooks.
5. `read_source` on one vanilla and one modded renderer pattern before coding.
6. Verify client-only registration path and side gating.
7. If shaders are requested, verify exact shader hook classes before claiming support.
8. Reference: [Rendering Pipeline](docs/reference/rendering-pipeline.md).

## Strategy: Datapack Generation

Use when producing recipes, tags, loot tables, advancements, or worldgen JSON assets.
1. `search_docs(query="recipe OR tag OR loot OR advancement OR worldgen", library?, version?)` first.
2. Narrow with `search_docs(query="shaped recipe" | "block tag" | "loot table pool" | "configured feature")`.
3. `read_doc(id)` for the exact JSON structure and required keys.
4. `search(version, loader, "RecipeSerializer TagKey LootTable")` to cross-check runtime class names.
5. `read_source` for serializers/parsers when docs are ambiguous.
6. Keep namespace/path conventions consistent with datapack folder layout.
7. Emit JSON only after docs + source agree on field names.
8. Reference: [Datapack Structures](docs/reference/datapack-structures.md).

## Strategy: World Generation

Use when creating configured/placed features, biome modifiers, or placement rules.
1. `find_class(version, loader, "Feature")` to anchor feature pipeline entry points.
2. `search(version, loader, "ConfiguredFeature PlacedFeature")` for registration and bootstrapping flow.
3. `search(version, loader, "BiomeModifier")` to locate biome injection APIs.
4. `search(version, loader, "PlacementModifier Heightmap InSquarePlacement")` for placement patterns.
5. `read_source` on one full worldgen chain (feature + placement + biome hook).
6. Verify datapack vs code registration path for the requested loader/version.
7. Emit generation code/JSON as a complete chain, not isolated fragments.
8. Reference: [Worldgen Pipeline](docs/reference/worldgen-pipeline.md).

## Strategy: Event Handling

Use when handling any gameplay/system event across Forge, NeoForge, or KubeJS.
1. `search(version, loader, "EventClassName or domain keywords")` to locate candidate event classes.
2. `find_class(version, loader, "ExactEventClass")` once candidate is identified.
3. `get_class_detail(version, loader, "ExactEventClass")` to verify mutable vs read-only methods.
4. `search(version, loader, "EVENT_BUS @SubscribeEvent bus")` to verify bus type and subscription model.
5. `read_source` on event class and one subscriber example before emitting handlers.
6. Enforce correct script phase or mod lifecycle hook for the bus used.
7. If setter is absent, treat value as read-only and state that explicitly.
8. Reference: [Event System Catalog](docs/reference/event-system-catalog.md).

## Strategy: Networking

Use when implementing custom packets, sync payloads, or client/server RPC-style messaging.
1. `search(version, loader, "SimpleChannel")` for Forge-era packet channel patterns.
2. `search(version, loader, "CustomPacketPayload")` for newer payload-based networking.
3. `search(version, loader, "FriendlyByteBuf StreamCodec")` for encode/decode contracts.
4. `search(version, loader, "PacketDistributor sendToServer send")` for routing semantics.
5. `read_source` on registration + handler threading pattern (`enqueueWork`/context handling).
6. Verify side checks and direction before emitting handler logic.
7. Emit packet id, codec, registration, and handler as one verified unit.
8. Reference: [Networking Packets](docs/reference/networking-packets.md).

## Strategy: Data Generation

Use when creating datagen providers for recipes, tags, models, loot, or language assets.
1. `find_class(version, loader, "RecipeProvider")` and `find_class(version, loader, "TagsProvider")` first.
2. `search(version, loader, "DataGenerator GatherDataEvent DataProvider")` for pipeline entry.
3. `search(version, loader, "BlockStateProvider ItemModelProvider LootTableProvider")` for provider variants.
4. `get_class_detail` on selected providers to verify constructor signatures.
5. `read_source` for provider registration order and output path conventions.
6. Verify existing-file helper usage and pack output root per loader.
7. Emit providers plus registration bootstrap together.
8. Reference: [Data Generation](docs/reference/data-generation.md).

## Strategy: KubeJS Addon Selection

Use when base KubeJS APIs are insufficient and addon-specific bindings are needed.
1. Identify capability gap (rendering, loot editing, animation, files, networking, etc.).
2. Check [KubeJS Addon Ecosystem](docs/reference/kubejs-addon-ecosystem.md) for addon scope and loader/version support.
3. `search(version, "kubejs", "keyword")` for built-in options before selecting an addon.
4. `search(version, loader, "AddonClassOrEvent")` on candidate addon loaders to verify APIs.
5. `find_class` + `read_source` on addon entry classes/events before emitting script examples.
6. Confirm script phase constraints and side constraints from source.
7. If addon API is missing in corpus, report "not verified" instead of guessing.
8. Emit final solution with explicit addon dependency note.

## Third-Party Libraries

36 libraries indexed (16 original + 20 KubeJS addons) with version isolation. Use the same MCP methods with the library name as `loader`. Mixin/MixinExtras are version-agnostic: use `version="third_party"`. Full loader names and API entry points: [Third-Party Quick Reference](docs/reference/third-party-quick-ref.md)

## Forge vs NeoForge

Package roots differ: `net.minecraftforge.*` (1.20.1 Forge) vs `net.neoforged.neoforge.*` (1.20.4+ NeoForge). Registry, holder, and event bus APIs changed. Always verify the exact version+loader before emitting any Forge/NeoForge-specific API. Full diff: [Forge vs NeoForge Patterns](docs/reference/forge-neoforge-patterns.md)

## Version Routing

| Version | Loader | Package Root | Notes |
|---|---|---|---|
| 1.20.1 | `forge` | `net.minecraftforge` | Last Forge version |
| 1.20.4+ | `neoforge` | `net.neoforged.neoforge` | NeoForge era |
| All indexed | `kubejs` | `dev.latvian.mods.kubejs` | Confirm with `versions()` |
| All indexed | `minecraft` | `net.minecraft` | Vanilla source |
| `third_party` | `mixin`, `mixinextras`, etc. | Various | Auto-checked on fallback |

Always run `versions()` at session start to confirm available pairs.


## Reference Documents

Detailed references in `docs/reference/`:

- [KubeJS API Surface](docs/reference/kubejs-api-surface.md) — Event group tables per version, script phase routing
- [Mutability Contracts](docs/reference/mutability-contracts.md) — Setter/getter analysis for damage events
- [Third-Party Quick Reference](docs/reference/third-party-quick-ref.md) — Key classes and entry points per library
- [Forge vs NeoForge Patterns](docs/reference/forge-neoforge-patterns.md) — Event system, registration, lifecycle
- [Version Migration Map](docs/reference/version-migration-map.md) — What changed between versions
- [Mod Structure Lifecycle](docs/reference/mod-structure-lifecycle.md) — Initialization order, registries, and runtime phases
- [BlockEntity Architecture](docs/reference/blockentity-architecture.md) — Save/load, ticking, sync, and update mechanics
- [GUI/Menu System](docs/reference/gui-menu-system.md) — MenuType wiring, slot sync, and screen binding
- [Rendering Pipeline](docs/reference/rendering-pipeline.md) — BER/entity renderer flow and render stage boundaries
- [Datapack Structures](docs/reference/datapack-structures.md) — JSON layouts for recipes, tags, loot, and worldgen
- [Worldgen Pipeline](docs/reference/worldgen-pipeline.md) — Feature registration to biome injection flow
- [Event System Catalog](docs/reference/event-system-catalog.md) — Event families, buses, mutability, and phase routing
- [Client/Server Sides](docs/reference/client-server-sides.md) — Side-only boundaries and safe cross-side patterns
- [Data Generation](docs/reference/data-generation.md) — Provider architecture and datagen bootstrap
- [Networking Packets](docs/reference/networking-packets.md) — Packet channels, payload codecs, and handler threading
- [KubeJS Addon Deep Dive](docs/reference/kubejs-addon-deep-dive.md) — EntityJS, LootJS, RenderJS usage patterns and script examples
