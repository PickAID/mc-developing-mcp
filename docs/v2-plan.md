# mc-developing-mcp — v2 Development Plan

> Concrete improvements for the next major version. Each item has a clear problem statement, proposed solution, and implementation notes. Ordered by impact-to-effort ratio — high value, low risk items first.

Read [v1-report.md](v1-report.md) before working on any item here.

---

## Table of Contents

1. [Priority 1 — Correctness Fixes](#priority-1--correctness-fixes)
2. [Priority 2 — New Query Capabilities](#priority-2--new-query-capabilities)
3. [Priority 3 — Coverage Expansion](#priority-3--coverage-expansion)
4. [Priority 4 — Infrastructure](#priority-4--infrastructure)
5. [Priority 5 — Optional / Experimental](#priority-5--optional--experimental)
6. [What NOT to Do](#what-not-to-do)
7. [Contributor Notes](#contributor-notes)

---

## Priority 1 — Correctness Fixes

These address known bugs or data model deficiencies. Do these before adding new features.

---

### 1.1 Normalize interfaces into a junction table

**Problem**: `find_implementations` uses `interfaces LIKE '%TargetName%'` — a substring match on a comma-separated string stored in a single column. This produces false positives (e.g., searching for `IBlock` matches `IBlockState`, `IBlockGetter`, etc.) and cannot use an index.

**Fix**:
1. Add a new table `source_class_interfaces(class_id INTEGER, interface_name TEXT)` — one row per implemented interface.
2. Populate it during indexing (parse the comma-separated `interfaces` column on insert).
3. Rewrite `find_implementations` to `JOIN source_class_interfaces WHERE interface_name = ?`.
4. Add an index on `(interface_name)`.

**Impact**: `find_implementations` goes from O(n) table scan with substring match to O(log n) index lookup. False positives eliminated.

**Effort**: ~1 day. Schema migration + indexer change + query rewrite.

**Migration note**: Existing `minecraft_sources.sqlite` files cannot be upgraded in place — must be rebuilt from source. Bump `version.json` to `1.1.0`.

---

### 1.2 Third-party libraries with MC version isolation

**Problem**: All 36 third-party libraries share `version="third_party"` regardless of which Minecraft version they target. If EventJS has a different API for 1.20.1 vs 1.21.1, both versions' code interleaves in the same namespace, causing wrong answers.

**Fix**:
1. Extend `third_party_registry.json` entries with a `mc_versions` array:
   ```json
   {"name": "EventJS", "repo": "ZZZank/EventJS", "mc_versions": ["1.20.1", "1.21.1"], ...}
   ```
2. Index each library under `version="third_party_{mc_version}"` (e.g., `"third_party_1.20.1"`).
3. Update `search()` and `find_class()` fallback logic to try `"third_party_{requested_version}"` before the global `"third_party"` fallback.
4. Add `"third_party"` as a final catch-all for libraries that haven't been re-indexed yet.

**Impact**: Correct answers when library APIs differ across MC versions.

**Effort**: ~2 days. Registry extension + indexer change + query logic update.

---

### 1.3 Method-level FTS5 index

**Problem**: `search()` operates on `source_files` (file level). Searching for a method name returns the file containing it, requiring a follow-up `get_class_detail` call to locate the method. For common patterns like "find method `hurtServer`", this is two round-trips when one would suffice.

**Fix**: Add a `source_methods_fts` FTS5 virtual table:
```sql
CREATE VIRTUAL TABLE source_methods_fts USING fts5(
    version, loader, class_name, method_name, return_type, params, signature,
    content=source_methods, content_rowid=id
);
```

Add a new MCP method: `search_methods(version, loader, query, limit?)` that searches this table and returns `[{class_name, method_name, return_type, params, rel_path}]`.

**Impact**: Direct method name search without needing to know the class first. Reduces round-trips for the most common query pattern.

**Effort**: ~1 day. Schema addition + indexer population + new MCP method + SKILL.md update.

---

## Priority 2 — New Query Capabilities

These add genuinely useful new methods. Each should be addable without touching the existing 10 methods.

---

### 2.1 `find_usages(version, loader, class_or_method_name)` — cross-reference search

**Problem**: There is no way to ask "what code uses `LivingHurtEvent`?" — i.e., find all files that reference a given class or method name. This is one of the most common modding questions.

**Fix**: During indexing, extract import statements and method call sites into a new table:
```sql
CREATE TABLE source_references(
    file_id INTEGER REFERENCES source_files(id),
    ref_type TEXT,  -- 'import', 'call', 'field_access', 'annotation'
    target_class TEXT,
    target_member TEXT  -- nullable
);
CREATE INDEX idx_source_ref_target ON source_references(target_class, target_member);
```

New MCP method: `find_usages(version, loader, class_name, member_name?)` → `[{rel_path, class_name, ref_type}]`

**Impact**: Enables "show me how `LivingHurtEvent` is used in vanilla" — crucial for understanding event handler patterns.

**Effort**: ~3 days. Tree-sitter extraction for import/call sites, new table, new method.

**Complexity note**: Tree-sitter can extract import declarations and method calls accurately. Field accesses and annotation usages are harder — consider phased implementation (imports first, then calls).

---

### 2.2 `diff_versions(class_name, version_a, version_b)` — structural diff

**Problem**: When porting a mod from 1.20.1 to 1.21.1, the AI currently cannot answer "what changed in `ItemStack` between versions?" without the human specifying specific methods to check. The `version-migration-map.md` covers major APIs manually but cannot cover every class.

**Fix**: New MCP method that compares method/field lists between two indexed versions:
```python
def diff_versions(self, params):
    # Get methods for class in version_a and version_b
    # Return: {added: [...], removed: [...], changed: [...]}
```

**Returns**: `{class_name, version_a, version_b, methods_added[], methods_removed[], fields_added[], fields_removed[]}`

**Impact**: Direct answer to "what changed in X between 1.20.1 and 1.21.1?" without manual cross-referencing.

**Effort**: ~1 day. Pure SQL — compare method sets from two `(version, loader, class_name)` queries.

---

### 2.3 `search_by_annotation(version, loader, annotation_name)` — annotation-based lookup

**Problem**: Finding all `@EventBusSubscriber` classes, or all `@Mod.EventBusSubscriber` registrations, requires knowing which class they're in. Annotation-based discovery is common in Forge/NeoForge.

**Fix**: Add a `source_annotations` table populated during indexing, plus a new method:
```python
def search_by_annotation(self, params):
    # params: version, loader, annotation (e.g., "EventBusSubscriber"), limit
    # Searches source_classes.annotations and source_methods.annotations
    # Returns matching class/method names with context
```

**Impact**: Direct lookup of all annotated classes or methods. Useful for finding all event subscribers, all capability providers, all config entries.

**Effort**: ~1 day. Tree-sitter already captures annotations in `source_classes.annotations` and `source_methods.annotations` (comma-separated). Add an index and a query.

---

### 2.4 `get_doc_page_by_slug(library, version, slug)` — stable doc reference

**Problem**: `read_doc` requires a numeric `id` from `search_docs`. IDs can change between database rebuilds, making it impossible to bookmark or hardcode references to specific doc pages in SKILL.md.

**Fix**: New method that retrieves a doc page by its stable `(library, version, slug)` triple:
```python
def get_doc_page_by_slug(self, params):
    # params: library, version, slug
    # Returns same structure as read_doc
```

**Impact**: SKILL.md and reference docs can link to specific doc pages by stable slug rather than fragile numeric IDs. Enables "see the `kubejs/1.20.1/events` doc page" references.

**Effort**: 2 hours. Single indexed query, no schema changes needed.

---

### 2.5 `list_events(version, loader, bus?)` — event catalog query

**Problem**: The current `search()` method can find events, but there's no way to list *all* events for a version. The `event-system-catalog.md` reference doc covers this manually but cannot be kept in sync automatically.

**Fix**: New method that queries the `source_events` table directly:
```python
def list_events(self, params):
    # params: version, loader, bus (optional: 'forge', 'mod', 'neoforge')
    # Returns: [{name, kind, rel_path, class_name}]
```

**Bonus**: During indexing, detect event bus registration patterns (`@EventBusSubscriber(bus=Bus.MOD)`) and store the bus type in `source_events.bus_type`.

**Impact**: Complete event catalog queryable at runtime. The `event-system-catalog.md` reference doc can be auto-generated from this query instead of maintained manually.

**Effort**: ~1 day. Indexer change for bus detection + new method.

---

## Priority 3 — Coverage Expansion

Add more Minecraft versions and libraries. No schema changes required.

---

### 3.1 Minecraft 1.21.4 and 1.21.5

**Status**: 1.21.1 is the latest indexed. Minecraft 1.21.4 (the "Bundles of Bravery" update) and 1.21.5 are released.

**Action**:
1. Obtain decompiled sources (Fabric/Mojmap or Forge MDK)
2. Add entries to `references/workspace/control.json`
3. Run `index_sources.py` for new versions
4. Update `third_party_registry.json` for libraries that support the new versions
5. Add version-specific notes to `version-migration-map.md`

**Priority libraries to add**: KubeJS 6 (1.21.x), NeoForge 21.x.

---

### 3.2 Fabric + Quilt support

**Status**: Currently indexed: Forge (1.20.1, 1.20.4), NeoForge (1.20.4, 1.21.1), KubeJS, vanilla Minecraft. Fabric is not indexed.

**Action**:
1. Add `loader="fabric"` entries for Fabric API source
2. Add Fabric-specific reference doc: `docs/reference/fabric-api-surface.md`
3. Add Fabric event system to `event-system-catalog.md`
4. Add common Fabric libraries: Trinkets, REI, EMI, Patchouli

**Note**: Fabric uses a completely different event model (interfaces + `@Environment`, not `@EventBusSubscriber`). SKILL.md will need a Fabric-specific section.

---

### 3.3 Expand KubeJS addon coverage

Current coverage is 20 addons. Community additions to consider:

| Addon | Priority | Notes |
|---|---|---|
| Create KubeJS | High | Very popular, Create mod integration |
| ARS Nouveau KubeJS | Medium | Magic mod integration |
| Thermal KubeJS | Medium | Thermal series integration |
| Applied Energistics 2 KubeJS | Medium | AE2 integration |
| Mekanism KubeJS | Medium | Mekanism integration |

**Action**: Add entries to `scripts/third_party_registry.json`, run `scripts/fetch_third_party.py`, rebuild sources DB.

---

## Priority 4 — Infrastructure

Improvements to the build pipeline, distribution, and testing.

---

### 4.1 Automated CI database rebuild

**Problem**: Rebuilding `minecraft_sources.sqlite` requires the contributor to have `tree-sitter`, Java sources, and several hours of indexing time locally.

**Fix**: GitHub Actions workflow that:
1. Runs on a schedule (monthly) or on `scripts/third_party_registry.json` change
2. Checks out third-party repos
3. Runs `index_sources.py` on the sources
4. Uploads the resulting SQLite as a release artifact

**Challenge**: A full rebuild on GitHub Actions free tier takes ~2–4 hours. Use a self-hosted runner or cache the previous DB and do incremental updates (index only changed/added files).

**Incremental indexing**: The indexer needs a `--incremental` flag that compares file mtimes against the DB and only re-indexes changed files.

---

### 4.2 Automated testing suite

**Problem**: There are no automated tests. A broken indexer or bad query could silently produce wrong results.

**Fix**: Add `tests/` directory with:
- `test_server.py` — starts the server, sends JSON-RPC requests via stdin, verifies responses
- `test_indexer.py` — indexes a small fixture Java project, verifies DB contents
- `test_queries.py` — known-good queries (find `LivingHurtEvent`, list methods of `ItemStack`, etc.) with expected result shapes

**GitHub Actions**: Run tests on every push. The sources SQLite is too large to put in CI; use a small fixture DB built from the test fixtures.

---

### 4.3 Incremental indexer (`--incremental` flag)

**Problem**: Full rebuild of `minecraft_sources.sqlite` takes hours. Any change to a third-party library requires a full rebuild.

**Fix**: Add a `--incremental` mode to `index_sources.py`:
1. For each file to index, check if `(version, loader, rel_path, mtime)` already exists in DB
2. Skip files where mtime matches
3. Delete and re-index files where mtime differs
4. Delete rows for files that no longer exist

**Requires**: Adding a `mtime` column to `source_files`.

---

### 4.4 HTTP transport option

**Problem**: Some AI clients don't support stdio MCP transport. Adding an HTTP/SSE transport would broaden compatibility.

**Fix**: Add an optional `--http` flag to `server.py` that starts a FastAPI/Flask server exposing the same 10 methods as HTTP POST endpoints. The AI client can then send requests to `http://localhost:PORT/call`.

**Implementation**: Keep the core `MCPServer` class unchanged. Add a thin HTTP adapter in a new file `mcp_server/http_server.py`. Requires `fastapi` + `uvicorn` as optional dependencies.

---

## Priority 5 — Optional / Experimental

Lower confidence items. Validate the need before building.

---

### 5.1 FTS5 on method signatures (method-level text search)

**Different from 2.1**: This is specifically about searching method *parameter types and return types*, not method names.

Example query: "find methods that take a `DamageSource` parameter" — currently requires knowing which class to look in. FTS5 on the `params` column of `source_methods` would enable this.

**Consideration**: Method parameter strings in Minecraft source use short names (`ItemStack`, `Player`, `Level`) not fully-qualified names. FTS5 results will be noisy without normalization.

---

### 5.2 Semantic embeddings for documentation (optional RAG layer)

**Hypothesis**: The `docs/reference/` markdown files and `minecraft_docs.sqlite` pages cover curated, high-quality content. Embedding these (not the 1.1M methods) and adding a vector similarity search method would improve "explain conceptually how X works" queries.

**Why it's optional**: FTS5 already covers most documentation query needs. The real gap is conceptual understanding, which the reference markdown docs address through careful human writing. Adding embeddings would require an inference endpoint (breaks the offline guarantee) or a bundled model (adds hundreds of MB).

**If pursued**: Use a small local model (e.g., `nomic-embed-text`, `all-MiniLM-L6-v2`). Store embeddings in SQLite using a BLOB column. Use `sqlite-vec` or `faiss` for similarity search. Only embed the 17 reference docs + 320 doc pages (manageable corpus), not the 1.1M method signatures.

---

### 5.3 AI-assisted reference doc maintenance

**Problem**: The 17 reference docs in `docs/reference/` go stale as Minecraft versions evolve. Keeping them accurate is manual work.

**Idea**: A script that:
1. Runs a set of known verification queries against the DB (e.g., "does `LivingHurtEvent` still exist in 1.21.1?")
2. Reports discrepancies between reference doc claims and current DB state
3. Flags sections that may be outdated

**Implementation**: Extract assertions from reference docs (using a structured comment format), cross-check against DB, output a diff report.

---

### 5.4 `explain_pattern(version, loader, pattern_name)` — high-level pattern docs

**Idea**: A new method that returns a structured guide for common modding patterns ("how to register a block", "how to add a custom food", "how to subscribe to events") by combining source evidence from the DB with reference doc prose.

**Challenge**: This requires curated pattern definitions — it's not something that can be generated automatically. Would need a pattern registry file similar to `third_party_registry.json`.

**Consider**: Is this better handled by improving SKILL.md and the reference docs, or does it need a dedicated method?

---

## What NOT to Do

These are deliberate non-goals. Don't add them without strong justification:

**❌ HTTP daemon mode as default transport**: stdio works. Making HTTP the default breaks the simple subprocess model and introduces networking complexity for no benefit to the majority of users.

**❌ Vector embeddings on source methods**: 1.1M method embeddings = hours of compute, gigabytes of storage, inference dependency at query time. The FTS5 + method-level FTS approach (§1.3) covers 95% of the use case at 0.1% of the cost.

**❌ Auto-updating databases in production**: The server is read-only by design. Automatic DB updates would require write access, write-ahead log management, and handling partial updates. Use the release workflow instead.

**❌ Web UI**: This is a headless MCP server. A web UI adds JavaScript dependencies, a build step, and maintenance burden. If visualization is needed, use the GitHub-rendered markdown docs.

**❌ Moving to a different language**: The Python + SQLite stack is intentional. Python is universally available (even on Windows), Tree-sitter has an excellent Python API, and the stdlib `sqlite3` module requires no additional dependencies. Rewriting in Rust or Go saves ~50ms of startup time at the cost of eliminating the most common contributor skillset.

---

## Contributor Notes

### Before starting any item

1. Read `docs/v1-report.md` — especially §9 (Design Decisions) and §10 (Known Limitations)
2. Check that the item doesn't break any of the 10 existing methods
3. If adding a new MCP method, update SKILL.md to document it (but follow the §6 rules — no code examples)
4. If changing the database schema, the existing `minecraft_sources.sqlite` is invalid — document the rebuild requirement and bump `version.json`

### Adding a new MCP method

Checklist:
- [ ] Method defined on `MCPServer` class, not starting with `_`
- [ ] Parameters validated with `_require_param` / `_coerce_int` / `_parse_limit`
- [ ] Returns serializable Python objects (list of dicts or a dict)
- [ ] Errors raised as `ValueError` (the dispatcher converts these to JSON-RPC error responses)
- [ ] LRU cache added if the method is called repeatedly with the same args
- [ ] Documented in SKILL.md (method name, params, return shape, purpose — no code examples)
- [ ] Added to v1-report.md §4 when stable

### Updating third-party library coverage

1. Add entry to `scripts/third_party_registry.json`
2. Run `python scripts/fetch_third_party.py`
3. Run `python scripts/index_sources.py` (full rebuild or use `--incremental` if implemented)
4. Verify with: `python -c "from mcp_server.server import MCPServer; s=MCPServer(); print(s.versions({}))"` — confirm new library appears
5. Add one-liner to `docs/reference/third-party-quick-ref.md`
6. If the library has significant KubeJS integration, add a section to `docs/reference/kubejs-addon-ecosystem.md`

### Schema changes — migration path

v1 database schema has no migration mechanism. Any schema change requires a full rebuild. Until an incremental migration system exists (§4.1), the process is:

1. Make the schema change in `index_sources.py`
2. Rebuild `minecraft_sources.sqlite` locally
3. Test with the new schema
4. Package a new release (the GitHub Actions workflow will pick up the rebuilt DB via the previous-release download mechanism)
5. Bump `version.json` to signal users to re-download

### Commit conventions

```
feat(indexer): add source_class_interfaces junction table
fix(query): correct interface substring false positive in find_implementations
docs(v2-plan): add incremental indexer design
perf(server): increase stmt_pool_limit for performance mode
```
