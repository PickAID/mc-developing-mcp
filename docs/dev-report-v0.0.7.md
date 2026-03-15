# mc-developing-mcp — v0.0.7 Developer Report

> A record of what changed in v0.0.7, why each decision was made, and what future contributors need to know.

---

## Table of Contents

1. [What Changed in v0.0.7](#1-what-changed-in-v007)
2. [Coremod Documentation](#2-coremod-documentation)
3. [Reference Ingestion Pipeline](#3-reference-ingestion-pipeline)
4. [New MC Versions (1.21.4, 1.21.5)](#4-new-mc-versions-1214-1215)
5. [KubeJS Addon Expansion](#5-kubejs-addon-expansion)
6. [Database State After v0.0.7](#6-database-state-after-v007)
7. [Release Workflow — Lessons Learned](#7-release-workflow--lessons-learned)
8. [Known Issues Carried Forward](#8-known-issues-carried-forward)
9. [What v0.0.8 Should Address](#9-what-v008-should-address)

---

## 1. What Changed in v0.0.7

### New: Coremod documentation (Mixin, MixinExtras, AT, JS Coremods)

v0.0.6 had no documentation for writing Minecraft coremods — the low-level bytecode manipulation layer used by mods that need to patch vanilla or other mods at runtime. This is a critical capability for advanced mod development and was a gap in the AI's knowledge.

v0.0.7 adds a comprehensive 17-section reference document (`docs/reference/coremod-guide.md`) covering:
- Mixin basics (injection points, method replacement, accessor interfaces)
- `@Inject` with `CallbackInfo` and `CallbackInfoReturnable`
- `@ModifyArg`, `@ModifyArgs`, `@ModifyVariable`, `@ModifyConstant`, `@Redirect`
- MixinExtras extensions (`@WrapOperation`, `@ModifyExpressionValue`, `@WrapWithCondition`)
- Access Transformers (AT) with Forge/NeoForge AT file format
- KubeJS JS Coremods (`addClassTransformer`, `ClassVisitor` / `MethodVisitor` API)
- Priority, MixinMerger, and multi-mod conflict resolution
- Common mistakes (targeting wrong class, INVOKETAIL pitfalls, frame computation errors)

### New: Reference ingestion pipeline

A new function `fetch_local_reference_docs()` in `scripts/fetch_docs.py` reads `docs/reference/*.md` and upserts them into `minecraft_docs.sqlite` as searchable documentation pages. This means the 17 hand-authored reference guides are now queryable via `search_docs()` — not just readable as files.

Previously the reference docs existed only as files. The AI had to know to read them directly. Now `search_docs("inject mixin")` returns the coremod guide as a top result.

### New: MC 1.21.4 and 1.21.5 source indexing

`third_party_registry.json` was updated to include `1.21.4` and `1.21.5` branches for GeckoLib and Architectury API. The full source index was rebuilt to incorporate these versions.

### New: Additional KubeJS addons (KubeJS-Create, KubeJS-Thermal, KubeJS-Mekanism)

Three integration addons from the KubeJS-Mods organization were added to the registry and indexed:
- `kubejs-create` — Create mod integration for KubeJS recipes/events
- `kubejs-thermal` — Thermal series integration
- `kubejs-mekanism` — Mekanism integration

These bring the total indexed addon count to 23 (formerly 20).

---

## 2. Coremod Documentation

### Why now

Coremod questions come up frequently in advanced KubeJS and Forge mod development. The AI was previously unable to answer Mixin questions with source evidence — it would either refuse or hallucinate. The `minecraft_sources.sqlite` contains the Mixin/MixinExtras Java classes, but without documentation the AI lacked the query vocabulary to find them correctly.

### Document structure

`docs/reference/coremod-guide.md` is 17 sections, structured as:

```
1.  What is a Coremod?
2.  Mixin — Basics
3.  @Inject — Full Reference
4.  CallbackInfo vs CallbackInfoReturnable
5.  @ModifyArg, @ModifyArgs, @ModifyVariable, @ModifyConstant
6.  @Redirect
7.  @Accessor and @Invoker
8.  MixinExtras — Overview
9.  @WrapOperation
10. @ModifyExpressionValue and @WrapWithCondition
11. Access Transformers (Forge/NeoForge)
12. KubeJS JS Coremods
13. Mixin Priority and MixinMerger
14. Version Differences (1.20.1 vs 1.21.x)
15. Common Mistakes
16. Debugging Coremods
17. Quick Reference
```

Each section is written in descriptive prose with code examples in Java or AT file format. No direct source code is copied from indexed repos — the guide describes APIs and patterns.

### Ingestion metadata

The coremod guide is ingested with:
- `library = "coremod"`, `version = "all"`
- `category = "guide"`, `slug = "coremod-guide"`
- Source URL set to the local file path

All 17 reference docs from `docs/reference/` are similarly ingested under `library = "reference"` (or per-subject library where appropriate), making the full reference corpus searchable.

---

## 3. Reference Ingestion Pipeline

### `fetch_local_reference_docs()` in `fetch_docs.py`

New function added to `scripts/fetch_docs.py`:

```python
REFERENCE_DOC_METADATA = {
    "blockentity-architecture.md": {"library": "minecraft", "category": "architecture"},
    "client-server-sides.md":      {"library": "minecraft", "category": "architecture"},
    "coremod-guide.md":            {"library": "coremod",   "category": "guide"},
    "data-generation.md":          {"library": "minecraft", "category": "guide"},
    "datapack-structures.md":      {"library": "minecraft", "category": "guide"},
    "event-system-catalog.md":     {"library": "forge",     "category": "events"},
    "forge-neoforge-patterns.md":  {"library": "forge",     "category": "guide"},
    "gui-menu-system.md":          {"library": "minecraft", "category": "guide"},
    "kubejs-addon-deep-dive.md":   {"library": "kubejs",    "category": "guide"},
    "kubejs-addon-ecosystem.md":   {"library": "kubejs",    "category": "guide"},
    "kubejs-api-surface.md":       {"library": "kubejs",    "category": "api"},
    "mod-structure-lifecycle.md":  {"library": "forge",     "category": "guide"},
    "mutability-contracts.md":     {"library": "minecraft", "category": "reference"},
    "networking-packets.md":       {"library": "forge",     "category": "guide"},
    "rendering-pipeline.md":       {"library": "minecraft", "category": "rendering"},
    "third-party-quick-ref.md":    {"library": "reference", "category": "reference"},
    "version-migration-map.md":    {"library": "reference", "category": "migration"},
    "worldgen-pipeline.md":        {"library": "minecraft", "category": "worldgen"},
}
```

The function reads each `.md` file from `docs/reference/`, builds a page record, and upserts into `doc_pages` + `doc_fts`. It is wired into `main()` and invoked with `--library coremod` or `--library reference`.

### How to re-run

```bash
cd Mc-Skill
python3 scripts/fetch_docs.py --library coremod
python3 scripts/fetch_docs.py --library reference
```

Or to re-ingest all reference docs at once (any `--library` value works; the function always processes all files in `docs/reference/`):

```bash
python3 scripts/fetch_docs.py --library reference
```

### Verification

After ingestion:
```bash
python3 -c "
import sqlite3
db = sqlite3.connect('data/minecraft_docs.sqlite')
rows = db.execute(\"SELECT id, library, slug FROM doc_pages WHERE library='coremod'\").fetchall()
for r in rows: print(r)
"
```

---

## 4. New MC Versions (1.21.4, 1.21.5)

### What was added

`third_party_registry.json` entries for `geckolib` and `architectury` were updated to include:
- GeckoLib 1.21.4 (branch `1.21.4`)
- GeckoLib 1.21.5 (branch `1.21.5`)
- Architectury 1.21.4 (branch `1.21.4`)
- Architectury 1.21.5 (branch `1.21.5`)

These were indexed and are now queryable at `(version="third_party", loader="geckolib")` and `(version="third_party", loader="architectury")` respectively. Note: because third-party libraries all share the `third_party` pseudo-version, per-MC-version isolation for addons requires specifying the loader name. Multi-version addon support within the third-party namespace is tracked as a v2 improvement.

### Vanilla MC 1.21.4 / 1.21.5

The indexer was run against decompiled vanilla sources for 1.21.4 and 1.21.5. The full source DB now covers:

| Minecraft Version | Loaders |
|---|---|
| 1.20.1 | forge, neoforge, kubejs, minecraft |
| 1.21.1 | neoforge, kubejs, minecraft |
| 1.21.4 | neoforge, minecraft |
| 1.21.5 | neoforge, minecraft |

---

## 5. KubeJS Addon Expansion

### Three new integration addons

| Addon | Repo | MC Versions |
|---|---|---|
| kubejs-create | KubeJS-Mods/KubeJS-Create | 1.20.1 |
| kubejs-thermal | KubeJS-Mods/KubeJS-Thermal | 1.20.1 |
| kubejs-mekanism | KubeJS-Mods/KubeJS-Mekanism | 1.20.1 |

These addons are the official KubeJS integration bridges for three major tech mods. They register custom recipe types, events, and JS bindings that allow KubeJS scripts to interact with Create machines, Thermal Series machines, and Mekanism machines. Previously these were undocumented — the AI would guess or refuse when asked about KubeJS-Create recipes.

### Updated third-party corpus count

36 → 39 unique library loaders (some libraries span multiple MC versions but share one loader name in the third-party namespace).

---

## 6. Database State After v0.0.7

### `minecraft_sources.sqlite` — 1.45 GB

| Metric | Count |
|---|---|
| Source files | 76,525+ |
| Classes | 171,662+ |
| Methods | 1,104,762+ |
| Fields | 587,585+ |
| Events | 6,358+ |
| Third-party libraries | 23 KubeJS addons + 16 base libs |

### `minecraft_docs.sqlite` — ~31 MB

| Metric | Count |
|---|---|
| Doc pages | 338+ (18 new reference pages added in v0.0.7) |
| Libraries indexed | 50+ (library/version entries) |
| Reference guides | 18 (all `docs/reference/*.md`) |

### Release assets (v0.0.7)

| Asset | Size | Upload method |
|---|---|---|
| `mc-developing-mcp-lite-v0.0.7.zip` | 8.6 MB | CI (GitHub Actions) |
| `minecraft_docs.sqlite` | 30.7 MB | CI (GitHub Actions) |
| `mc-developing-mcp-full-v0.0.7.zip` | 383 MB | `upload_full_release.py` |
| `minecraft_sources.sqlite` | 1,450 MB | Custom streaming Python uploader |

---

## 7. Release Workflow — Lessons Learned

### The correct v0.0.7 release sequence

The release workflow had a non-obvious ordering requirement that caused a failed attempt before the correct sequence was found.

**Correct order:**
1. Update `version.json` → commit and push
2. GitHub Actions CI runs automatically, creates the GitHub Release, uploads lite zip + `minecraft_docs.sqlite`
3. Wait for CI to complete
4. Locally run `python scripts/upload_full_release.py` to add the full zip
5. Manually upload `minecraft_sources.sqlite` via the streaming uploader script

**What went wrong on first attempt:**
The release was manually created via GitHub API before `version.json` was pushed. When CI ran, it found an existing release with a different creation context and failed to upload to it correctly. Fix: delete the manually-created release, push `version.json`, let CI create the release, then run local uploader.

### 1.45 GB upload: streaming required

`upload_full_release.py` uses `asset.read_bytes()` (PyGithub) which reads the entire file into RAM before sending. This fails for `minecraft_sources.sqlite` (1.45 GB) with `BrokenPipeError` or OOM on most development machines.

**Workaround used for v0.0.7:** A custom streaming uploader using Python's `http.client.HTTPSConnection` with chunked send:

```python
conn = http.client.HTTPSConnection(host, context=ssl.create_default_context(), timeout=7200)
conn.putrequest("POST", path)
conn.putheader("Authorization", f"Bearer {token}")
conn.putheader("Content-Type", "application/octet-stream")
conn.putheader("Content-Length", str(file_size))
conn.endheaders()
with open(file_path, "rb") as f:
    while chunk := f.read(8 * 1024 * 1024):  # 8 MB chunks
        conn.send(chunk)
resp = conn.getresponse()
```

**Action required for v0.0.8:** Integrate this streaming pattern into `upload_full_release.py` as the default upload path for files over ~100 MB. The current `asset.read_bytes()` path should be kept as fallback for small files only.

---

## 8. Known Issues Carried Forward

These were documented in the v1 report and remain unfixed:

### `find_implementations` false positives on interface substring matching

`find_implementations` uses `interfaces LIKE '%TargetInterface%'`. If target is `IBlock`, results include classes implementing `IBlockState`. **Fix in v0.0.8**: normalize interfaces into a junction table and use exact match.

### No MC-version isolation for third-party addons

All KubeJS addons share `version="third_party"`. A library indexed for 1.20.1 cannot be distinguished from its 1.21.1 version at query time. **Fix in v0.0.8**: extend the registry with `mc_version` tagging and index third-party under `(mc_version, library_name)`.

### Method-level FTS5 not implemented

`search()` operates on file-level FTS5. Searching for a method name requires `get_class_detail` as a follow-up. **Fix in v0.0.8**: add `source_methods_fts` table.

### `upload_full_release.py` loads entire file into memory

Documented above. Fix pending for v0.0.8.

---

## 9. What v0.0.8 Should Address

Priority order based on impact:

### P0 — Correctness

1. **Fix `upload_full_release.py` for large files** — integrate streaming uploader. Without this, every release of `minecraft_sources.sqlite` requires a manual workaround.

2. **Third-party MC version isolation** — index third-party libs under `(mc_version, library_name)` so `search(version="1.20.1", loader="lootjs")` returns 1.20.1-specific API.

### P1 — Query Quality

3. **Method-level FTS5** — add `source_methods_fts` virtual table on `source_methods`. Enable `search_method(version, loader, query)` MCP method.

4. **Fix `find_implementations` interface matching** — normalize `interfaces` into a junction table. Eliminate false positives.

### P2 — Coverage

5. **Mixin/MixinExtras source indexing verification** — verify that `SpongePowered/Mixin` and `LlamaLad7/MixinExtras` are present in the sources DB under a consistent loader. Currently the coremod reference guide describes their API but the source index status is unconfirmed.

6. **Additional KubeJS addons** — evaluate newer addons in the KubeJS ecosystem (ProbeJS output types, ArmorPlus JS bindings, etc.).

### P3 — Developer Experience

7. **Automated NOTICE update script** — `third_party_registry.json` drives the NOTICE file. A script that regenerates NOTICE from the registry would prevent them from drifting out of sync.

8. **Cross-version structural diff** — `diff_versions(class_name, v1, v2)` MCP method that compares method/field sets between two indexed versions and returns what was added, removed, or changed.

---

*Report generated: 2026-03-16 | Version: v0.0.7 | Author: PickAID*
