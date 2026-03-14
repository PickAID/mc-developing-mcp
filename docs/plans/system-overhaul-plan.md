# Minecraft MCP System Overhaul — Architectural Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the MCP system from a demo-quality prototype into a production-grade, fast, accurate Minecraft modding knowledge engine covering KubeJS, Forge, NeoForge, Mixin, and 13+ third-party libraries — with source content stored in the database, sub-second query response, and professional documentation that eliminates fabricated API usage.

**Architecture:** Two-database design: `minecraft_sources.sqlite` stores all indexed source code (metadata + raw content), `minecraft_docs.sqlite` stores extracted library documentation. Both are version-isolated. The MCP server uses an in-memory LRU cache for hot paths, prepared statement pools, and tuned WAL pragmas. SKILL.md and reference docs provide the AI with deep structural understanding of each library's design patterns.

**Tech Stack:** Python 3.10+, SQLite (WAL mode, FTS5), tree-sitter-java, LRU caching (functools), Git for source acquisition

---

## Phase 1: Database Performance + Source Content Storage

### Problem

- `read_source` does disk I/O on every call — no caching, no DB storage
- `cache_size=-2000` (~8MB) is undersized for a 346MB DB
- No prepared statement caching — SQL re-parsed per request
- `get_hierarchy` does N+1 queries per superclass level
- No source content in DB means verification requires filesystem access

### Design

#### 1A: `source_content` table

```sql
CREATE TABLE IF NOT EXISTS source_content (
    file_id   INTEGER PRIMARY KEY REFERENCES source_files(id) ON DELETE CASCADE,
    content   TEXT NOT NULL,
    hash      TEXT NOT NULL DEFAULT ''
);
```

- Populated during indexing (Phase 1 only adds to indexer)
- `read_source` checks DB first, falls back to disk
- Hash (SHA-256 of content) enables incremental re-index

#### 1B: Server-side LRU cache

```python
from functools import lru_cache

@lru_cache(maxsize=4096)
def _cached_find_class(version, loader, class_name): ...

@lru_cache(maxsize=2048)
def _cached_class_detail(version, loader, class_name): ...

@lru_cache(maxsize=8192)
def _cached_read_source(version, loader, path, start, end): ...
```

- Cache invalidation: none needed (read-only server, data changes only on re-index which restarts server)
- Cache warm-up: optional, load top-100 classes per corpus on startup

#### 1C: Prepared statement pool

```python
class MCPServer:
    def __init__(self):
        ...
        self._stmts: dict[str, sqlite3.Cursor] = {}

    def _prepare(self, name: str, sql: str) -> sqlite3.Cursor:
        if name not in self._stmts:
            self._stmts[name] = self.conn.cursor()
        return self._stmts[name]
```

#### 1D: Pragma tuning

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-131072;    -- 128MB (was 8MB)
PRAGMA mmap_size=536870912;   -- 512MB memory-mapped I/O
PRAGMA temp_store=MEMORY;
PRAGMA page_size=8192;        -- larger pages for big BLOBs
```

### Tasks

- [ ] Step 1: Add `source_content` table to schema in `index_sources.py`
- [ ] Step 2: Modify `_flush()` to store file content during indexing
- [ ] Step 3: Add content hash for incremental re-index support
- [ ] Step 4: Modify `read_source` in `server.py` to check DB first
- [ ] Step 5: Add LRU cache decorators to hot-path methods
- [ ] Step 6: Add prepared statement pool
- [ ] Step 7: Tune pragmas in both indexer and server
- [ ] Step 8: Re-run indexer with `--rebuild` to populate content
- [ ] Step 9: Benchmark: measure query latency before/after

---

## Phase 2: Third-Party Source Extraction + Indexing

### Problem

Currently only rhino, sponge-mixin, and mixinextras variants are in `third_party/`. The system cannot answer questions about Geckolib, Create, Curios, Architectury, or any other common modding library.

### Design

#### Source acquisition pipeline

```
scripts/fetch_third_party.py
  --library geckolib
  --mc-version 1.20.1
  --output sources/{version}/{library}/sources/
```

For each library:
1. Clone or download source JAR from Maven/GitHub
2. Extract Java sources
3. Place in `sources/{mc_version}/{library_name}/sources/` for version-isolated libs
4. Place in `sources/third_party/sources/{library_name}/` for version-agnostic libs
5. Run `index_sources.py` on the new corpus

#### Library inventory

| Library | Version-isolated? | Target MC versions |
|---------|-------------------|-------------------|
| Geckolib | Yes | 1.20.1, 1.21, 1.21.1 |
| Curios | Yes | 1.20.1 (Forge) |
| ldlib | Yes | 1.20.1 |
| ldlib2 | Yes | 1.21+ |
| Architectury API | Yes | 1.20.1, 1.21, 1.21.1 |
| Citadel | Yes | 1.20.1 |
| Caelus | Yes | 1.20.1, 1.21+ |
| Cloth Config | Yes | 1.20.1, 1.21+ |
| YACL | Yes | 1.20.1, 1.21+ |
| Create | Yes | 1.20.1 |
| FTB Library | Yes | 1.20.1, 1.21+ |
| Registrate | Yes | 1.20.1, 1.21+ |
| GuideME | Yes | 1.20.1 |
| MidNight | Yes | 1.20.1 |
| Mixin | No (third_party) | all |
| CoreMod | No (third_party) | all |
| MixinExtras | No (third_party) | all |

#### Corpus discovery update

`index_sources.py` `discover_corpora()` must be updated to detect new library directories under each version folder, not just kubejs/forge/neoforge/minecraft.

### Tasks

- [ ] Step 1: Create `scripts/fetch_third_party.py` with Maven/GitHub source download
- [ ] Step 2: Build library registry JSON with repo URLs, Maven coords, target versions
- [ ] Step 3: Download and extract sources for all listed libraries
- [ ] Step 4: Update `discover_corpora()` to detect arbitrary loader names under version dirs
- [ ] Step 5: Update `control.json` to register new corpora
- [ ] Step 6: Run `index_sources.py --rebuild` to index everything
- [ ] Step 7: Verify with `versions()` that all new corpora appear
- [ ] Step 8: Spot-check: `find_class` for key classes in each library

---

## Phase 3: Documentation Database

### Problem

Source code alone doesn't convey usage patterns, API guides, or version migration notes. Libraries like Geckolib, Create, and KubeJS have extensive documentation that should be queryable.

### Design

#### Separate database: `minecraft_docs.sqlite`

```sql
CREATE TABLE doc_pages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    library     TEXT NOT NULL,
    version     TEXT NOT NULL,
    url         TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL,
    format      TEXT NOT NULL DEFAULT 'markdown',
    fetched_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(library, version, url)
);

CREATE VIRTUAL TABLE doc_fts USING fts5(
    library     UNINDEXED,
    version     UNINDEXED,
    title,
    content,
    tokenize = 'porter unicode61'
);
```

#### New MCP methods

- `search_docs(library, version, query, limit?)` — FTS5 search over documentation
- `read_doc(library, version, url)` — retrieve full doc page content

#### Doc extraction pipeline

```
scripts/fetch_docs.py
  --library kubejs
  --version 1.20.1
  --source https://docs.variedmc.cc/...
```

Supports: GitHub wiki pages, markdown files from repos, web-scraped doc sites.

### Tasks

- [ ] Step 1: Create `minecraft_docs.sqlite` schema
- [ ] Step 2: Create `scripts/fetch_docs.py` for doc scraping/extraction
- [ ] Step 3: Add `search_docs` and `read_doc` to `server.py`
- [ ] Step 4: Populate docs for KubeJS (variedmc.cc + kubejs.com)
- [ ] Step 5: Populate docs for Geckolib, Create, Architectury
- [ ] Step 6: Update SKILL.md with new doc methods

---

## Phase 4: SKILL.md Professional Overhaul + System Understanding Docs

### Problem

Current SKILL.md is too shallow — it documented method contracts but not the deep structural knowledge needed to prevent fabricated APIs. The EntityEvents issue proved that an LLM needs to understand mutability contracts, script phase routing, and per-version API surface differences at a granular level.

### Design

#### SKILL.md restructure

1. **Mission + Rules** (keep, tighten)
2. **Data Architecture** (new: explain two-DB design, what's in each)
3. **MCP Method Contracts** (keep, add doc methods)
4. **Verification Workflows** (expand: add mutability check, setter/getter verification chain)
5. **KubeJS Strategy** (keep, add per-version API surface tables)
6. **Third-Party Library Guide** (new: what's indexed, key classes, usage patterns)
7. **Modding Strategy** (new: Forge vs NeoForge patterns, Mixin usage, multi-platform with Architectury)
8. **Testing Protocol** (keep, add expanded test cases covering third-party libs)

#### System understanding reference docs

Create `docs/reference/` with focused markdown files:

- `docs/reference/kubejs-api-surface.md` — complete event group tables per version
- `docs/reference/forge-neoforge-patterns.md` — event system, registration, lifecycle
- `docs/reference/third-party-quick-ref.md` — key classes/entry points per library
- `docs/reference/version-migration-map.md` — what changed between versions
- `docs/reference/mutability-contracts.md` — which event properties have setters

### Tasks

- [ ] Step 1: Generate KubeJS API surface tables from DB queries
- [ ] Step 2: Generate mutability contract reference from source analysis
- [ ] Step 3: Write `docs/reference/` files
- [ ] Step 4: Rewrite SKILL.md with professional structure
- [ ] Step 5: Add third-party library guide section
- [ ] Step 6: Review with Oracle for completeness

---

## Phase 5: Legacy Cleanup

### Tasks

- [ ] Step 1: Remove rag/vector/chunk references from `db_service.py`
- [ ] Step 2: Clean `control.json` of legacy routing keys
- [ ] Step 3: Remove stale `source_symbols` table from DB
- [ ] Step 4: Verify no code references old tables/methods

---

## Phase 6: Production Validation

### Tasks

- [ ] Step 1: Run full test suite (Easy/Medium/Hard/Adversarial)
- [ ] Step 2: Test third-party library queries (Geckolib, Create, etc.)
- [ ] Step 3: Test documentation search
- [ ] Step 4: Generate KubeJS scripts using the system and verify
- [ ] Step 5: Generate Java mod code and verify
- [ ] Step 6: Performance benchmark (target: <100ms per query)
- [ ] Step 7: Final Oracle review

---

## Execution Order

1. **Phase 1** first (everything depends on fast, content-backed DB)
2. **Phase 2** next (expands coverage)
3. **Phase 3** in parallel with Phase 2 (independent DB)
4. **Phase 4** after Phases 2+3 (needs full corpus to document)
5. **Phase 5** anytime
6. **Phase 6** last (validates everything)
