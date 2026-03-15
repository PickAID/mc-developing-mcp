---
name: minecraft-mcp-service
description: |
  Source-backed Minecraft modding skill. Activate for ANY of: KubeJS scripting,
  Forge/NeoForge mod development, datapack JSON authoring, worldgen configuration,
  event handlers, recipe systems, block/item/entity registration, rendering,
  networking, data generation, or "how do I do X in Minecraft". Covers 1.20.1–1.21.1
  across Forge, NeoForge, KubeJS (36 libraries). Uses indexed Java source + docs DB
  for all answers — nothing is guessed.
---

# Minecraft MCP Skill

## Mission

Generate correct Minecraft modding code using indexed Java source as the sole authority. Every API name, method signature, event, and mutability claim must be verified from source before output.

## Non-Negotiable Rules

1. **Use `smart_search` first.** For any source research, call `smart_search` before `search`/`find_class`/`get_class_detail`/`read_source`. It returns class detail + source preview in one call.
2. **No guessed APIs.** Verify with source tools before emitting any class or method name.
3. **Always specify `version` and `loader`.** `read_source` and all source methods require both. Omitting `version` causes an error.
4. **Use only the 24 implemented methods.** Do not invent methods not listed here.
5. **If uncertain, say so.** Return "not verified" and show what was checked.
6. **Check mutability before emitting setters.** A getter does not imply a setter. See mutability contracts.
7. **Run `kubejs_datapack_guardrails` before writing worldgen.** It detects registry limitations per version before you waste calls.

## Session Start Protocol (KubeJS projects)

Call these **once per session** before answering. Do NOT skip:

```
kubejs_project_context()   ← env + scan + symbol bootstrap in 1 call
kubejs_datapack_guardrails()  ← if worldgen/datapack work is involved
```

For pure Java modding (non-KubeJS): skip to the query tools directly.

## Minimum MCP Calls Protocol

**The goal is ≤3 tool calls per answer.** Use composite tools:

| Instead of this chain | Use this single call |
|---|---|
| `search` → `get_class_detail` → `read_source` | `smart_search(query, version, loader)` |
| `search_docs` → `read_doc` → `read_doc` | `search_docs(query, limit=3)` then read top hit only |
| `search` → `find_class` → `get_class_detail` | `smart_search(query, version, loader, top_k=3)` |
| `kubejs_project_env` + `kubejs_project_scan` + `kubejs_project_search` | `kubejs_project_context(sample_queries=[...])` |
| Multiple `kubejs_project_search` calls | `kubejs_project_multi_search(queries=[...])` |
| `get_class_detail` on N classes | `smart_search` with `top_k=N` |

## Data Architecture

Two SQLite databases (AST-indexed, FTS5): `minecraft_sources.sqlite` (76k+ Java files, 36 libraries, version-isolated, sub-ms queries) and `minecraft_docs.sqlite` (1,873 doc pages including Misode datapack schemas with vanilla preset examples).

## MCP Methods (24 total)

### Composite Methods — Use These First

#### 1. `smart_search(version, loader, query, top_k?, include_source?, source_lines?, include_docs?)`
- Required: `version`, `loader`, `query`
- Optional: `top_k` (default 3, max 5), `include_source` (default true), `source_lines` (default 80), `include_docs` (default true)
- Returns: list of `{version, loader, class_name, rel_path, package_name, superclass, rank, methods[], fields[], events[], source_preview, total_lines}` plus optional `{_doc_hits: [...]}` prepended
- **Use this first for any source research.** Replaces search+get_class_detail+read_source.

#### 2. `kubejs_project_context(project_root?, max_files?, refresh?, sample_queries?, per_query_limit?)`
- Returns: `{env, scan, sample_queries, query_hits}` in one call
- **Use at session start for KubeJS work.** Replaces kubejs_project_env+scan+search.

#### 3. `kubejs_project_triage(issue?, queries?, project_root?, ...)`
- Required: one of `issue` or `queries`
- Returns: `{queries, env, scan, hits_by_query, top_paths, guidance}` in one call
- **Use for issue investigation.** Replaces manual search+read loops.

### Source Methods

#### 4. `versions()`
- Returns: `[{version, loader, file_count}]`
- Use: confirm available corpora.

#### 5. `search(version, loader, query, limit?)`
- Returns: ranked rows with `rel_path`, `class_name`, `package_name`, `superclass`, `rank`
- Use: when you need raw hits without detail. Prefer `smart_search` for most cases.
- Auto-fallback: appends `third_party` hits when primary results are sparse.

#### 6. `search_methods(version, loader, query, limit?)`
- Required: `version`, `loader`, `query`
- Returns: `[{method_name, class_name, return_type, params, signature, annotations, rel_path, line_num}]`
- **Use when you know a method name but not its class.** Eliminates search→get_class_detail loop.

#### 7. `search_by_annotation(version, loader, annotation, limit?)`
- Required: `version`, `loader`, `annotation`
- Returns: class-level and method-level matches with `match_type`, `name`, `annotations`, `rel_path`
- Use: find all `@EventBusSubscriber`, `@SubscribeEvent`, `@Mod` classes/methods.

#### 8. `find_class(version, loader, class_name)`
- Returns: class location and metadata, or `{}`
- Use: exact class lookup when smart_search is overkill.
- Auto-fallback: checks `third_party` on miss.

#### 9. `get_class_detail(version, loader, class_name)`
- Returns: `{classes, methods, fields, events}` for the file
- Use: when you already have a class name and need its full API surface.

#### 10. `get_hierarchy(version, loader, class_name)`
- Returns: `{class_name, extends_chain, implements}`

#### 11. `find_implementations(version, loader, interface_or_class)`
- Returns: classes extending/implementing the target
- Note: param is `interface_or_class`, not `class_name`

#### 12. `diff_versions(class_name, version_a, version_b, loader_a?, loader_b?, loader?)`
- Required: `class_name`, `version_a`, `version_b`
- Optional: `loader_a` (default `forge`), `loader_b` (default `neoforge`)
- Returns: `{class_name, version_a, version_b, methods_added[], methods_removed[], fields_added[], fields_removed[]}`
- **Use for migration questions.** "What changed in X between 1.20.1 and 1.21.1?"

#### 13. `list_events(version, loader, bus?, limit?)`
- Required: `version`, `loader`
- Optional: `bus` (filter by event kind), `limit` (default 100)
- Returns: `[{name, kind, class_name, package_name, rel_path, line_num}]`
- Use: enumerate all events for a version, or find events by bus type.

#### 14. `read_source(version, loader, path, start?, end?)`
- Required: `version`, `loader`, `path` ← **both version AND loader required — omitting either causes an error**
- Optional: `start`, `end` (line numbers, default 1–200)
- Returns: `{content, total_lines, path}`
- Note: `path` is relative. Do not prefix with `sources/`.

#### 15. `list_package(version, loader, package_prefix, limit?)`
- Returns: classes under the package prefix (dot-separated Java format)

### Documentation Methods

#### 16. `search_docs(query, library?, version?, limit?)`
- Returns: `[{id, library, version, category, slug, title, snippet, rank}]`
- Use: find datapack schemas, event docs, KubeJS guides. `smart_search` includes top doc hits automatically.

#### 17. `read_doc(id)`
- Returns: `{library, version, category, slug, title, content, format, source_url}`

#### 18. `get_doc_page_by_slug(library, version, slug)`
- Required: `library`, `version`, `slug`
- Returns: same shape as `read_doc`
- Use: stable doc reference without fragile numeric id. E.g. `get_doc_page_by_slug("misode", "1.20.1", "misode/1.20.1/loot_table")`

### Local KubeJS Project Methods

#### 19. `kubejs_project_env(project_root?)`
- Returns: `{project_root, minecraft_version, loader, version_source, loader_source, kubejs_roots}`
- Default: auto-detects from Prism instance; defaults version to `1.20.1`.

#### 20. `kubejs_project_scan(project_root?, max_files?, refresh?)`
- Returns: project structure + symbol summary

#### 21. `kubejs_project_search(query, project_root?, kind?, limit?, ...)`
- Returns: ProbeJS/KubeJS symbol hits

#### 22. `kubejs_project_multi_search(queries, project_root?, ...)`
- Required: `queries` (array)
- Use: batch multiple symbol searches into one call.

#### 23. `kubejs_project_read(path, project_root?, start?, end?)`
- Returns: `{project_root, path, start, end, total_lines, content}`

#### 24. `kubejs_datapack_guardrails(project_root?, max_files?, refresh?)`
- Returns: `{minecraft_version, summary, findings, guidance}`
- **Run before worldgen/datapack work.** Detects `StartupEvents.registry` misuse, `highPriorityData` for worldgen (not supported in 1.20.1), and other version-specific limitations.

### Common Parameter Mistakes

| Mistake | Correct |
|---|---|
| `read_source` without `version` | Always pass `version` — it's required |
| `find_implementations` with `class_name` | Use `interface_or_class` |
| `read_source` path prefixed with `sources/` | Use relative path only |
| `list_package` with `/` separators | Use `.` (Java package format) |
| Calling `find_event` or `compare_api` | These don't exist |
| Using `name` instead of `class_name` | Param name must be exact |
| Multiple sequential `search` calls | Use `smart_search` or `kubejs_project_multi_search` |

## Verification Workflows

### Any source question (default)

```
smart_search(version, loader, "keywords", top_k=3)
```
→ Returns class detail + source. Usually sufficient to answer without further calls.

### Known class name

```
smart_search(version, loader, "ExactClassName", top_k=1, source_lines=120)
```

### Method lookup (know method name, not class)

```
search_methods(version, loader, "methodName")
```
→ Returns class_name + signature directly. No follow-up needed.

### Annotation-based discovery

```
search_by_annotation(version, loader, "SubscribeEvent")
```

### Inheritance chain

```
get_hierarchy(version, loader, "ClassName")
find_implementations(version, loader, "InterfaceName")
```

### Version migration

```
diff_versions("ClassName", version_a="1.20.1", version_b="1.21.1", loader_a="forge", loader_b="neoforge")
```
→ Returns exact API delta. No manual cross-referencing.

### Mutability check (REQUIRED before emitting setters)

1. `smart_search(version, loader, "EventClassName", include_source=false)`
2. Inspect `methods[]` for matching `get*`/`set*` pairs
3. If setter absent: **read-only — do not emit setter calls**

### Documentation search

```
search_docs(query="topic", library="misode", version="1.20.1", limit=5)
```
→ For datapack JSON schemas, use `library="misode"`. For KubeJS guides, `library="kubejs"`.

### KubeJS session start

```
kubejs_project_context(sample_queries=["RecipeEvents", "ServerEvents", "ItemEvents"])
kubejs_datapack_guardrails()   ← if touching worldgen or datapack paths
```

## KubeJS Strategy

### 1. Event routing by script phase

| Phase | Directory | Event Groups | Notes |
|---|---|---|---|
| Startup | `startup_scripts/` | StartupEvents, ForgeEvents (1.20.1), registry events | Runs once at load. Not hot-reload safe. |
| Server | `server_scripts/` | ServerEvents, PlayerEvents, EntityEvents, BlockEvents, RecipeEvents, ItemEvents | Hot-reloadable via `/reload`. |
| Client | `client_scripts/` | ClientEvents, tooltip events | Client-only rendering/UI. |

### 2. ForgeEvents / NativeEvents

- **1.20.1 (core)**: `ForgeEvents.onEvent("fully.qualified.EventClass", handler)` in `startup_scripts` only.
- **1.20.1 (with EventJS addon)**: `NativeEvents.onEvent(Java.loadClass(...), handler)` works in all 3 script types.
- **1.21.1**: Built-in `NativeEvents` in all script types. No addon needed.
- Never translate `ForgeEvents` to `NativeEvents` without proving EventJS is installed.

### 3. HighPriorityData / LowPriorityData limitations

**1.20.1**: Both events fire AFTER worldgen registries load. Cannot add new biomes, configured features, placed features, or dimension types via `highPriorityData` or `lowPriorityData`.
- Supported: recipes, loot tables, tags, advancements, item modifiers
- Not supported: `worldgen/*`, `dimension`, `dimension_type`, `worldgen/biome`
- Run `kubejs_datapack_guardrails()` to auto-detect these limitations for the current project.

**1.21.1+**: Use `ServerEvents.registry('<key>')` and `ServerEvents.generateData('<stage>')` instead.

### 4. Runtime guardrails

| Feature | Status | Alternative |
|---|---|---|
| `fetch` | Unavailable | Java.loadClass for HTTP |
| `Promise` | Unavailable | Event-driven handlers |
| `setTimeout` / `setInterval` | Binding exists but workspace policy: not usable | Tick/scheduler patterns |
| ES `class` syntax | Unavailable | Object literals, factory functions |

### 5. 1.20.1 Damage Mutation (Critical)

`EntityEvents.hurt` is READ-ONLY in 1.20.1. For mutable damage, verify via `smart_search` before emitting any pattern.

### 6. Version drift — Key changes

| 1.20.1 | 1.21.1 | Change |
|---|---|---|
| `EntityEvents.hurt` | `EntityEvents.beforeHurt` | Renamed + setter added |
| — | `EntityEvents.afterHurt` | New (read-only) |
| `WorldgenEvents.*` | Removed | No replacement |
| `JEIEvents.*` / `REIEvents.*` | `RecipeViewerEvents.*` | Unified |
| Package: `bindings.event` | `plugin.builtin.event` | Restructured |

Use `diff_versions` for migration questions rather than manual cross-referencing.

## Strategy: Datapack Generation

1. `kubejs_datapack_guardrails()` — check what's actually supported in this version first
2. `search_docs(query="...", library="misode", version="1.20.1")` — get schema from Misode docs
3. `get_doc_page_by_slug("misode", "1.20.1", "misode/1.20.1/<generator_id>")` — full schema with field types and preset examples
4. `smart_search(version, loader, "SerializerOrParserClass")` — cross-check runtime class
5. Emit JSON only after docs + source agree

## Strategy: Event Handling

1. `kubejs_datapack_guardrails()` — run if script phase is unclear
2. `search_methods(version, loader, "eventMethodName")` — find event handler signature
3. `smart_search(version, loader, "EventClassName")` — full event class with methods/fields/source
4. Check mutability from `methods[]` in result — no extra call needed
5. `search_by_annotation(version, loader, "SubscribeEvent")` — find all existing event subscribers as examples

## Strategy: World Generation (1.20.1)

In 1.20.1, `WorldgenEvents.add()` is explicitly disabled in KubeJS source with error message. `highPriorityData` fires too late for worldgen registries. Options:

1. Use actual JSON files in `kubejs/data/<namespace>/worldgen/` (static datapack)
2. Use a separate Forge datapack with priority ordering
3. Upgrade to 1.21.1 where `ServerEvents.registry('worldgen/...')` works

Do not attempt `highPriorityData` for biomes/configured_features/placed_features in 1.20.1 — it will silently fail or error.

## Strategy: BlockEntity, GUI, Rendering, Networking, Data Generation

Follow the same pattern: `kubejs_datapack_guardrails()` if applicable, then `smart_search` → verify methods from result → emit code.
Reference docs in `docs/reference/` for architecture patterns. Key refs:
- [KubeJS API Surface](docs/reference/kubejs-api-surface.md)
- [Mutability Contracts](docs/reference/mutability-contracts.md)
- [Version Migration Map](docs/reference/version-migration-map.md)
- [Event System Catalog](docs/reference/event-system-catalog.md)
- [Forge vs NeoForge Patterns](docs/reference/forge-neoforge-patterns.md)
- [Datapack Structures](docs/reference/datapack-structures.md)
- [Worldgen Pipeline](docs/reference/worldgen-pipeline.md)
- [KubeJS Addon Ecosystem](docs/reference/kubejs-addon-ecosystem.md)

## Third-Party Libraries

36 libraries indexed (16 original + 20 KubeJS addons). Use library name as `loader`. Full list: [Third-Party Quick Reference](docs/reference/third-party-quick-ref.md)

## Version Routing

| Version | Loader | Package Root |
|---|---|---|
| 1.20.1 | `forge` | `net.minecraftforge` |
| 1.20.4+ | `neoforge` | `net.neoforged.neoforge` |
| All indexed | `kubejs` | `dev.latvian.mods.kubejs` |
| All indexed | `minecraft` | `net.minecraft` |
| Various | `third_party` | Auto-checked on fallback |
