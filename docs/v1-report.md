# mc-developing-mcp — v1 System Report

> A complete record of what was built, why each decision was made, and what future contributors need to understand before changing anything.

---

## Table of Contents

1. [What the System Does](#1-what-the-system-does)
2. [Architecture Overview](#2-architecture-overview)
3. [Database Design](#3-database-design)
4. [MCP Server — All 10 Methods](#4-mcp-server--all-10-methods)
5. [Performance Configuration System](#5-performance-configuration-system)
6. [SKILL.md Design Philosophy](#6-skillmd-design-philosophy)
7. [Third-Party Library Indexing](#7-third-party-library-indexing)
8. [Reference Documents and RAG Chunks](#8-reference-documents-and-rag-chunks)
9. [Key Design Decisions and Why](#9-key-design-decisions-and-why)
10. [Known Limitations](#10-known-limitations)
11. [Build and Index Pipeline](#11-build-and-index-pipeline)
12. [Lessons Learned](#12-lessons-learned)

---

## 1. What the System Does

`mc-developing-mcp` is a Model Context Protocol (MCP) server that gives AI assistants direct, structured query access to:

- **76,525 Minecraft Java source files** (1.1M methods, 171k classes, 587k fields, 6,358 events)
- **36 third-party libraries** (KubeJS addon ecosystem: LootJS, PonderJS, EventJS, GeckoJS, etc.)
- **320 documentation pages** across 48 library/version entries (KubeJS wiki, NeoForge docs, etc.)
- **17 hand-authored reference documents** (architectural guides, migration maps, event catalogs)
- **Pre-chunked RAG JSONs** for 6 Minecraft versions × multiple loaders

The system enables AI assistants to answer Minecraft modding questions with verified source evidence rather than hallucinated API signatures. Every class, method, event, and field the AI mentions must be confirmed from the indexed databases before being emitted.

### What it is NOT

- It is **not a general-purpose Java search tool** — it is tuned for Minecraft/KubeJS modding queries
- It is **not a vector embedding system** — SQLite with FTS5 and B-tree indexes was deliberately chosen (see §9)
- It is **not a background daemon** — the MCP server is started and managed on-demand by the AI client (Claude Desktop, Cursor, etc.)

---

## 2. Architecture Overview

```
AI Client (Claude Desktop / Cursor / OpenCode)
     │
     │  stdin/stdout  (newline-delimited JSON-RPC)
     ▼
mcp_server/server.py
     │
     ├──▶  data/minecraft_sources.sqlite   (1.2 GB, source index)
     ├──▶  data/minecraft_docs.sqlite      (16 MB, docs + FTS5)
     └──▶  references/workspace/           (pre-chunked RAG JSONs, 4.3 MB)
```

**Protocol**: Newline-delimited JSON-RPC over stdio. Each request is a JSON object on one line; each response is a JSON object on one line. No HTTP, no WebSockets, no daemon. The AI client spawns `python3 mcp_server/server.py` as a subprocess and communicates via stdin/stdout pipes.

**Why stdio?** MCP clients (Claude Desktop, Cursor) spawn MCP servers as subprocesses. stdio is the standard transport. It requires zero networking setup and works identically on every OS.

**Server lifecycle**: The server is a single long-lived Python process. SQLite connections are opened once at startup and held open for the session. LRU caches warm up during the session. When the AI client terminates, the subprocess terminates.

---

## 3. Database Design

### 3.1 `minecraft_sources.sqlite` — Source Index

Built by `scripts/index_sources.py` using Tree-sitter's Java parser. The indexer walks the `sources/` directory tree, parses every `.java` file, and extracts structural metadata into normalized tables.

**Tables:**

| Table | Purpose | Key columns |
|---|---|---|
| `source_files` | One row per `.java` file | `version`, `loader`, `rel_path`, `class_name`, `package_name`, `class_kind`, `superclass`, `interfaces` |
| `source_classes` | All class/interface/enum/record declarations | `file_id`, `name`, `kind`, `superclass`, `interfaces`, `annotations`, `line_num`, `is_inner` |
| `source_methods` | All method declarations | `file_id`, `name`, `return_type`, `params`, `signature`, `line_num`, `is_constructor` |
| `source_fields` | All field declarations | `file_id`, `name`, `field_type`, `annotations`, `line_num` |
| `source_events` | All event classes/constants detected | `file_id`, `name`, `kind`, `line_num` |
| `source_content` | Full source text (for `read_source`) | `file_id`, `content` |
| `source_fts` | FTS5 virtual table for fuzzy text search | mirrors `source_files` columns |

**Version isolation**: Every row carries `version` (e.g., `"1.20.1"`) and `loader` (e.g., `"forge"`, `"neoforge"`, `"kubejs"`). Third-party libraries use `version="third_party"` and `loader="<library-name>"`. Queries are always scoped by `(version, loader)`.

**Indexes**: B-tree indexes on `(version, loader, class_name)`, `(version, loader, package_name)`, and `(file_id)` ensure sub-millisecond lookups even at 76k files.

### 3.2 `minecraft_docs.sqlite` — Documentation Index

Built by `scripts/fetch_docs.py` + `scripts/init_docs_db.py`. Fetches documentation pages from KubeJS Wiki, NeoForge docs, and other sources, then stores them as structured pages.

**Tables:**

| Table | Purpose |
|---|---|
| `doc_pages` | One row per documentation page: `library`, `version`, `category`, `slug`, `title`, `content`, `format`, `source_url` |
| `doc_fts` | FTS5 virtual table with BM25 ranking and `snippet()` support |
| `doc_libraries` | Registry of indexed libraries and versions |

**FTS5 configuration**: Uses `bm25()` scoring for relevance ranking. The `snippet()` function generates highlighted excerpts for search results. Queries support boolean operators (`AND`, `OR`, `NOT`) and phrase matching.

---

## 4. MCP Server — All 10 Methods

All methods are defined on the `MCPServer` class in `mcp_server/server.py`. The `handle()` dispatcher routes JSON-RPC `method` names to Python methods via `getattr`. Methods starting with `_` are private and cannot be called externally.

### Source Methods (8)

#### `versions()`
- **Params**: `{}`
- **Returns**: `[{version, loader, file_count}]`
- **Purpose**: Lists all indexed corpora so the AI knows what versions are available. Always call at session start.
- **Implementation**: Single GROUP BY query on `source_files`.

#### `search(version, loader, query, limit?)`
- **Params**: `version` (required), `loader` (required), `query` (required), `limit` (optional, default 20, max 200)
- **Returns**: `[{rel_path, class_name, package_name, superclass, rank}]` — BM25-ranked
- **Purpose**: Fuzzy discovery when the exact class or method name is unknown. Use when you know *what* something does but not *what it's called*.
- **Smart fallback**: If the primary corpus returns fewer than 3 results, third-party library results are automatically appended to fill the gap.
- **Implementation**: FTS5 match on `source_fts`. Query terms are tokenized and joined with `OR` for broad recall. BM25 rank is negative (lower = better match).

#### `find_class(version, loader, class_name)`
- **Params**: `version`, `loader`, `class_name` (all required)
- **Returns**: `{rel_path, package_name, class_kind, superclass, interfaces, type_params, line_count}` or `{}`
- **Purpose**: Exact class lookup by name. Use to confirm a class exists and get its location. Do NOT use as a substitute for `search` — this is exact match only.
- **Smart fallback**: If not found in requested `(version, loader)`, automatically searches `third_party` corpus.
- **Caching**: LRU cache (`lru_find_class`, default 4096 entries). Cache sentinel `_EMPTY_RESULT` avoids storing empty dicts.

#### `get_class_detail(version, loader, class_name)`
- **Params**: `version`, `loader`, `class_name` (all required)
- **Returns**: `{rel_path, package_name, class_name, classes[], methods[], fields[], events[]}` — all members of the file containing the class
- **Purpose**: Get the full API surface of a class: all methods, fields, inner classes, events. Use after `find_class` to inspect the full member list.
- **Note**: Returns members for the *entire file*, not just the named class. Files often contain inner classes.
- **Caching**: LRU cache (`lru_class_detail`, default 2048 entries).

#### `get_hierarchy(version, loader, class_name)`
- **Params**: `version`, `loader`, `class_name` (all required)
- **Returns**: `{class_name, extends_chain[], implements[]}` — full inheritance chain
- **Purpose**: Trace the superclass chain and all implemented interfaces. Essential for event handler lookup (find what superclass fires the event) and capability queries (what interfaces does a class implement).
- **Implementation**: Iteratively walks the `source_classes` table following `superclass` links. Cycle detection via `seen_supers` set.
- **Caching**: LRU cache (`lru_hierarchy`, default 2048 entries).

#### `find_implementations(version, loader, interface_or_class)`
- **Params**: `version`, `loader`, `interface_or_class` (all required)
- **Returns**: `[{name, kind, rel_path, superclass, interfaces}]` — all classes that extend or implement the target
- **Purpose**: Find all concrete implementations of an interface or all subclasses of a class. Useful for "what implements `IForgeBlock`?" style queries.
- **Implementation**: WHERE clause on `(superclass=? OR interfaces LIKE ?)`. The `LIKE` check has a performance cost on large result sets — this is a known limitation (see §10).

#### `read_source(version, loader, path, start?, end?)`
- **Params**: `version`, `loader`, `path` (all required), `start` (optional, default 1), `end` (optional, default 200)
- **Returns**: `{content, total_lines, path}` — source text for the specified line range
- **Purpose**: Read actual source code to verify method signatures, mutability, implementation details. Always use this to confirm claims before emitting code.
- **Two-tier source resolution**: First tries `source_content` table (in-DB full source). Falls back to `sources/` filesystem if not in DB. The `sources/` directory is excluded from git — this fallback is only available when running locally with a full source checkout.
- **Caching**: LRU cache keyed on `(version, loader, path, start, end)` — each window is cached independently.
- **Security**: Path is validated against the source root via `relative_to()` to prevent directory traversal.

#### `list_package(version, loader, package_prefix, limit?)`
- **Params**: `version`, `loader`, `package_prefix` (all required), `limit` (optional, default 100, max 1000)
- **Returns**: `[{class_name, class_kind, rel_path, superclass, line_count}]` — all classes in package tree
- **Purpose**: Explore an unknown package namespace. Use `"net.minecraft"` to see all top-level Minecraft classes, or `"dev.latvian.mods.kubejs"` for KubeJS.
- **Implementation**: `LIKE ?%` prefix scan on `package_name`. Effective because of the compound index.

### Documentation Methods (2)

#### `search_docs(query, library?, version?, limit?)`
- **Params**: `query` (required), `library` (optional), `version` (optional), `limit` (optional, default 20, max 100)
- **Returns**: `[{id, library, version, category, slug, title, snippet, rank}]`
- **Purpose**: Full-text search across documentation pages. The `snippet` field is a highlighted excerpt from the matching content, ready to display.
- **Filtering**: Can be narrowed by `library` and/or `version`. Without filters, searches all 320 pages.
- **Use for**: Finding tutorial-style explanations, event documentation, API guides when source-level queries aren't enough.

#### `read_doc(id)`
- **Params**: `id` (required, positive integer from `search_docs` results)
- **Returns**: `{library, version, category, slug, title, content, format, source_url}`
- **Purpose**: Retrieve the full content of a documentation page by its ID. The `format` field indicates whether content is `markdown` or `html`. `source_url` is the original URL.

---

## 5. Performance Configuration System

Three named presets control memory allocation and query limits:

| Parameter | minimal | balanced (default) | performance |
|---|---|---|---|
| `sources_cache_kib` | −16384 (16 MB) | −131072 (128 MB) | −524288 (512 MB) |
| `sources_mmap_bytes` | 134 MB | 537 MB | 2147 MB (2 GB) |
| `docs_cache_kib` | −8192 (8 MB) | −65536 (64 MB) | −131072 (128 MB) |
| `docs_mmap_bytes` | 67 MB | 268 MB | 537 MB |
| `stmt_pool_limit` | 64 | 256 | 1024 |
| `lru_find_class` | 512 | 4096 | 16384 |
| `lru_class_detail` | 256 | 2048 | 8192 |
| `lru_source` | 1024 | 8192 | 32768 |
| `lru_hierarchy` | 256 | 2048 | 8192 |
| `max_search_results` | 50 | 200 | 500 |

**Loading order** (later overrides earlier):
1. Built-in defaults (`balanced` values hardcoded in `ServerConfig`)
2. `config.json` `"mode"` key selects preset
3. Individual keys in `config.json` override the preset per-key
4. `MC_MCP_MODE` env var overrides the `"mode"` key
5. `MC_MCP_CONFIG` env var overrides the config file path

**Statement pool** (`_stmt_pool`): An LRU `OrderedDict` of `sqlite3.Cursor` objects keyed by normalized SQL. Avoids re-preparing the same statement on every call. When a cursor's execute fails, it is evicted from the pool and a fresh cursor is used.

**Four LRU caches**: `_find_class_cache`, `_class_detail_cache`, `_source_cache`, `_hierarchy_cache` — all implemented as custom `_LRUCache` (OrderedDict-based). Not Python's `functools.lru_cache` because the cache must survive across multiple requests (instance-level, not function-level).

---

## 6. SKILL.md Design Philosophy

SKILL.md is the AI's runtime instruction set — the rules loaded into context when the skill is activated. A critical design constraint was discovered during development:

**Code examples in SKILL.md defeat their own purpose.** If SKILL.md shows a working example of how to use `LivingHurtEvent`, an AI being tested on that exact topic reads the answer directly from SKILL.md rather than querying the MCP server. This makes testing useless and trains the AI to bypass the source-verification workflow.

**What was removed** (v1 trim: 512 → 357 lines):
- Section 5 KubeJS code examples (damage mutation, event handler boilerplate)
- Full Testing Protocol (50 lines) — moved to `docs/testing-guide.md`
- Third-party library table (30 rows) — replaced with a one-liner pointing to docs
- Forge/NeoForge event table — replaced with a pointer to `event-system-catalog.md`
- Source Layout and Rebuild sections — moved to README

**What SKILL.md DOES contain**:
- Non-negotiable rules (verify before emitting, no guessed APIs, always specify version)
- Data architecture summary (what DBs exist, what they contain)
- MCP method signatures and purpose — concise, no examples
- Pointers to reference docs in `docs/reference/`
- Query workflow (search → find_class → get_class_detail → read_source)
- Version-specific critical notes (e.g., 1.20.1 damage mutation uses `ForgeEvents` not `EntityEvents`)

**Rule**: SKILL.md should tell the AI *what to do* and *where to look*, not *what the answer is*.

---

## 7. Third-Party Library Indexing

36 third-party libraries are indexed under `version="third_party"`, `loader="<library-name>"`. Each library is fetched from GitHub and indexed by `scripts/index_sources.py`.

**Registry**: `scripts/third_party_registry.json` — each entry has `name`, `repo`, `branch`, `description`, and optionally `source_path` (subdirectory within the repo).

**Version isolation**: Third-party libraries use a separate pseudo-version (`"third_party"`) rather than a real MC version. This allows the same query infrastructure to search both vanilla MC code and addon code. The `search()` method's auto-fallback and `find_class()`'s auto-fallback both target `third_party` when the primary corpus doesn't have the answer.

**Included addons** (KubeJS ecosystem, 20 addons):
- EventJS (`zank.mods.eventjs`) — 7 files, 8 classes, 22 methods
- LootJS, PonderJS, GeckoJS, AnimationJS, AdvancementJS, RenderJS
- KubeJS Additions, MoreJS, ModifyJS, KeyBindJS, FetchJS, FilesJS
- KubeLoader, KubePackages, KubeUtils, KubeJS Offline, Player Animator, startres

**Critical discovery (EventJS)**: `EventJS` provides `NativeEvents` binding in ALL 3 script types (startup/server/client) via `SidedNativeEvents.byType(scriptType)`. This is different from core KubeJS `ForgeEvents` which is startup-only. This distinction must be preserved in SKILL.md and reference docs.

---

## 8. Reference Documents and RAG Chunks

### `docs/reference/` — 17 Markdown Guides

Hand-authored architectural deep-dives. These are NOT auto-generated — each one represents substantial research and must be maintained by humans as the Minecraft ecosystem evolves.

| File | Coverage |
|---|---|
| `blockentity-architecture.md` | BlockEntity lifecycle, ticking, capability patterns |
| `client-server-sides.md` | Logical side contracts, `@OnlyIn`, `DistExecutor` |
| `data-generation.md` | DataProvider pattern, JSON generation |
| `datapack-structures.md` | Loot tables, advancements, tags, recipes |
| `event-system-catalog.md` | All major Forge/NeoForge events with bus + cancellability |
| `forge-neoforge-patterns.md` | Capability system, bus differences, migration notes |
| `gui-menu-system.md` | Screen, Menu, AbstractContainerMenu patterns |
| `kubejs-addon-deep-dive.md` | EventJS, LootJS, PonderJS internals |
| `kubejs-addon-ecosystem.md` | 36-addon overview with tier classification |
| `kubejs-api-surface.md` | KubeJS event system, script types, NativeEvents |
| `mod-structure-lifecycle.md` | Mod loading phases, `@Mod`, `FMLClientSetupEvent` |
| `mutability-contracts.md` | Which MC objects are mutable vs. read-only, by version |
| `networking-packets.md` | Custom packet registration, `SimpleChannel`, `PlayPayload` |
| `rendering-pipeline.md` | `BlockEntityRenderer`, `EntityRenderer`, shader integration |
| `third-party-quick-ref.md` | One-line lookup table for all 36 third-party libraries |
| `version-migration-map.md` | 1.20.1 → 1.21.1 API change map |
| `worldgen-pipeline.md` | Feature registration, biome modification, structure |

### `references/workspace/` — Pre-Chunked RAG JSONs

986 JSON files organized as:
```
references/workspace/
  {mc-version}/
    {library}/          (forge, neoforge, kubejs, minecraft)
      inventory.json    # index of chunks for this corpus
      chunks/           # actual content chunks
      part-NNN/         # routing index for chunk navigation
```

These chunks were created by a chunking pipeline that splits large documentation and source summaries into token-sized pieces suitable for retrieval. The `control.json` file maps `(version, loader)` pairs to their source roots and chunk locations.

**Important**: The RAG chunk JSONs in `references/workspace/` are separate from the SQLite FTS5 search. They are intended for potential future RAG integration (e.g., embedding-based retrieval in v2) and as structured data the AI client can navigate directly.

---

## 9. Key Design Decisions and Why

### SQLite over vector embeddings

**Decision**: All indexing uses SQLite with B-tree indexes and FTS5 full-text search. No vector embeddings, no FAISS, no pgvector.

**Why**: For Minecraft modding queries, the primary lookup pattern is exact or near-exact name lookup ("find `LivingHurtEvent`", "list methods of `ItemStack`"). B-tree indexes solve this in O(log n) with microsecond latency. Embedding 1.1M methods would require:
- Hours of GPU/CPU time to index
- Gigabytes of embedding storage
- An inference endpoint (local model or API cost) at query time
- Imprecise recall (semantic drift breaks exact name lookup)

FTS5 BM25 handles the "fuzzy discovery" case ("find something that deals with entity damage") adequately for the domain. The one area where embeddings would genuinely help — finding *conceptually* similar code patterns — is covered by the reference markdown docs (hand-authored, high quality) and the pre-chunked RAG JSONs.

### stdio over HTTP

**Decision**: JSON-RPC over stdio, not HTTP.

**Why**: MCP clients spawn servers as subprocesses. stdio works out of the box with zero networking setup, no port conflicts, no firewall issues, no TLS. For a local developer tool this is strictly better.

### Single-process, not async

**Decision**: Synchronous Python with SQLite. No asyncio, no threading.

**Why**: SQLite requires care with threading (the module has `check_same_thread=True` by default). AI clients send one request at a time (the AI generates text sequentially). There is no benefit to concurrent handling. The synchronous model is simpler, more debuggable, and SQLite's mmap + page cache provide the performance needed.

### Source stored in DB, not just filesystem

**Decision**: Full source content is stored in `source_content` table. The filesystem fallback exists but is secondary.

**Why**: The `sources/` directory is not distributed (1.3GB of raw Java). Users who download the release zip only get the SQLite databases. Storing content in `source_content` means `read_source` works without the `sources/` directory present. The filesystem fallback serves developers who have checked out the full repo.

### Third-party as `version="third_party"`

**Decision**: All 36 third-party libraries share `version="third_party"` with distinct `loader` values per library.

**Why**: Simplicity. The version field is designed for Minecraft version isolation (1.20.1, 1.21.1, etc.). Third-party libraries don't fit that axis — they have their own versioning. Using a sentinel value avoids a separate database or separate query path. The auto-fallback in `search()` and `find_class()` makes this transparent to the user.

---

## 10. Known Limitations

### `find_implementations` uses LIKE on interfaces

The `find_implementations` method uses `interfaces LIKE '%TargetInterface%'` for interface matching. This is a substring match on a comma-separated string, not a proper relational query. It will produce false positives if a target name appears as a substring of another interface name (e.g., searching for `IBlock` would also match `IBlockState`). Fix in v2: normalize interfaces into a separate junction table.

### Third-party libraries have no version isolation between MC versions

A library indexed under `third_party` applies to all MC versions. If a library has breaking API changes between 1.20.1 and 1.21.1, both versions' code would be interleaved in the same `third_party` namespace. Fix in v2: extend the registry with `mc_version` and index third-party under `(mc_version, library_name)`.

### `search()` does not support method-level search

FTS5 is on `source_files` (file-level). Searching for a method name returns the *file* containing it, not the method itself. The AI must then call `get_class_detail` to find the method within the file. A method-level FTS5 table would reduce the round-trips for common queries.

### No cross-version diff

There is no built-in way to query "what changed between 1.20.1 and 1.21.1 for class X". The `version-migration-map.md` reference doc covers the most critical changes manually. A v2 feature could compute structural diffs between indexed versions automatically.

### First release requires manual SQLite upload

The GitHub Actions workflow downloads `minecraft_sources.sqlite` from the previous release. The very first release has no previous release to pull from, so the sources SQLite must be manually uploaded to the GitHub Release. This is a one-time bootstrap cost.

### `read_source` window size not enforced on DB path

When reading from `source_content`, the default window is lines 1–200. If a class has 2000 lines (not uncommon in Minecraft), the AI must make multiple `read_source` calls to see the full class. This is intentional (prevents token overload) but means multi-call workflows for large classes.

---

## 11. Build and Index Pipeline

For contributors who need to rebuild the databases:

```
scripts/
  third_party_registry.json   # registry of 36 third-party libraries
  fetch_third_party.py        # clone/update third-party repos into sources/third_party/
  index_sources.py            # parse Java → SQLite (Tree-sitter Java parser)
  fetch_docs.py               # fetch doc pages from web → raw JSON
  init_docs_db.py             # load raw JSON → minecraft_docs.sqlite
  db_service.py               # shared DB utilities used by indexer
  download_release.py         # user helper: download sources SQLite from GitHub Release
```

**Dependencies**: `tree-sitter`, `tree-sitter-java` (for indexer), `requests` (for doc fetcher). See `requirements.txt`.

**Build order**:
1. Place Minecraft Java sources in `sources/{version}/{loader}/`
2. Run `fetch_third_party.py` to populate `sources/third_party/`
3. Run `index_sources.py` to build `data/minecraft_sources.sqlite`
4. Run `fetch_docs.py` then `init_docs_db.py` to build `data/minecraft_docs.sqlite`

**VACUUM before releasing**: Always run `PRAGMA wal_checkpoint(TRUNCATE)` and `VACUUM` on both SQLite files before packaging a release. The WAL file can add hundreds of MB if left uncheckpointed.

---

## 12. Lessons Learned

**1. SKILL.md is context, not documentation.** The moment SKILL.md contains the answer to a question, testing that question becomes meaningless. SKILL.md must provide *how to find* answers, not *what the answers are*.

**2. SQLite mmap is the biggest single performance lever.** Setting `PRAGMA mmap_size` to a significant fraction of the DB size (512MB for a 1.2GB DB) means most queries hit memory rather than disk after warmup. LRU caches are secondary.

**3. Third-party fallback must be transparent.** The AI should never need to think "is this class in the main corpus or third-party?" Both `search()` and `find_class()` handle the fallback automatically. This was the right call — it simplifies SKILL.md significantly.

**4. Version isolation is non-negotiable.** Several KubeJS APIs changed completely between 1.20.1 and 1.21.1 (e.g., `ForgeEvents.onEvent` + `LivingHurtEvent` in 1.20.1 → `EntityEvents.beforeHurt` in 1.21.1). Mixing versions produces broken code. Every query must be scoped to a specific `(version, loader)` pair.

**5. Store full source content in the DB.** The filesystem fallback (`sources/` directory) is not distributed. Always ensure new content goes into `source_content` during indexing, not just file metadata. Otherwise `read_source` silently fails for release users.

**6. The prepared statement pool is worth the complexity.** Python's `sqlite3` module re-compiles SQL on every `execute()` call unless you use `cursor.execute()` on a persistent cursor. The `_stmt_pool` OrderedDict cuts query overhead measurably for repeated lookups.
