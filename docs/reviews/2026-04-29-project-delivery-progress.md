# Project Delivery Progress
Date: 2026-04-30
Author: m1hono
Scope: `mc-developing-mcp` `skill-update`, sibling `mdm-sources`, conceptual `mdm-resources`

## Executive Summary
本地交付闭环切片已经完成。项目现在不再只是 MCP 能力集合，而是有了可验证的资源包源仓库、release artifact、MCP registry reader、runtime cache 状态、checksum 校验，以及 `mc_develop` structuredContent 中的资源状态输出。

功能完成阶段已经继续推进到 modpack JAR 底层缓存：mod archive inventory 现在有 runtime SQLite 持久化缓存、entry index、JarJar/content summary 保留、显式 refresh、stale fingerprint 重建、class owner index、以及实际 MCP 返回值验证。资源支持也进入了一等证据域的第一批实现：mod archive asset evidence summary 现在能分类 vanilla asset roots 和 selected GUI-related asset paths，JAR 内显式资源请求能追踪 blockstate -> model -> texture，loose `assets/**` 能按 vanilla asset format roots 分类，MCP datapack/resource executor 会返回 counts-only `resourceSummary` metadata，显式请求时能追踪 blockstate -> model -> texture 的资源引用链和 missing texture，并且纯 `assets/**` 资源目录不再依赖 `pack.mcmeta` 才能进入资源证据链。

当前仍不能视为完整公开交付版，因为远程下载/安装、资源包发布 workflow 的实际发布、资源驱动 docs retrieval、真实整合包大场景验证和 UX 文档还没有完成。但 alpha 本地闭环已经成立，可以回到功能完成阶段。

## Current Repository State
### MCP
- Worktree: `/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate`
- Branch: `skill-update`
- Remote: `origin/skill-update`
- Latest implementation state before this progress update: clean at `e85c430`
- Public MCP surface: one tool, `mc_develop`
- Latest full verification: `pnpm test` passed with 99 test files and 307 tests
- Latest typecheck: `pnpm typecheck` passed

Recent MCP resource, diagnostics, and mod archive commits:

- `0783dfc feat(resource-registry): read local mdm registries`
- `aff046f feat(resource-registry): summarize mdm cache status`
- `7fd6839 feat(mcp-server): inject mdm resource status`
- `fef95a8 feat(resource-registry): read mdm release manifests`
- `cca9050 feat(resource-registry): cache mdm release artifacts`
- `e112f8c feat(mcp-server): install mdm release artifacts on request`
- `ad5729e feat(mcp-server): use cached mdm docs resources`
- `18341e5 feat(mcp-server): report mdm docs resource diagnostics`
- `6bf2fd4 feat(mcp-server): read multiple mod archive files`
- `49ad940 feat(jar-source): batch read nested mod archives`
- `e5a9b76 feat(jar-source): summarize mod archive content inventory`
- `5015aca feat(jar-source): cache mod archive inventory inspections`
- `0344164 feat(jar-source): persist mod archive inventory cache`
- `7d0c2f4 feat(mcp-server): refresh mod archive inventory cache`
- `1b8d492 feat(jar-source): persist mod archive entry index`
- `4bab68d feat(jar-source): use entry index for class owners`
- `07b8734 feat(jar-source): classify mod archive asset entries`
- `3403433 feat(mcp-server): summarize mod archive asset resources`
- `6f047fa test(service-profile): guard guidance scope`
- `dd6b176 docs: record resource-pack asset evidence verification`
- `06c1186 feat(datapack): classify vanilla asset resource kinds`
- `0e6a148 feat(mcp-server): summarize local resource evidence`
- `265ef96 docs: record local resource evidence summary verification`
- `0ae2e54 feat(datapack): trace resource asset references`
- `e71ec56 feat(harness): route assets-only resources`
- `e85c430 feat(jar-source): summarize vanilla asset entries`
- current progress update: explicit resource reference tracing inside selected mod archives

### `mdm-sources`
- Path: `/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources`
- Branch: `main`
- Remote state: `origin/main`
- Git state after verification: clean

Committed baseline:

- `8c30ae8 chore: initialize mdm sources baseline`
- `7485169 feat: validate mdm resource packages`
- `2e2b894 feat: add required core docs package`
- `51cf66f feat: build local mdm resource releases`
- `ccfe2dc feat: publish mdm resource release artifacts`

The `mdm-sources` baseline and release artifact workflow now have a remote branch.

## Delivery Closure Status
Status: complete for the local loop.

Implemented:

- `mdm-sources` baseline, schema, registry, validation, required core docs package, local release builder, and validation workflow.
- Deterministic `.mdm-resource.json` local artifact for `core-docs-required`.
- MCP `@mcpskill/resource-registry` package for local registry reading.
- MCP runtime cache layout and cache state read/write helpers.
- MCP resource status summary with `ready`, `missing_required`, `missing_optional`, and `invalid_checksum`.
- `mc_develop` structured content now includes `mdmResources` when `MDM_SOURCES_ROOT` is configured.
- `mc_develop` can install an MDM release artifact on request only when `mdmReleaseInstall.downloadPolicy` is explicitly `allowed`.
- The install flow supports local manifest paths and manifest URLs, verifies SHA-256, and writes runtime cache state.
- Cached `.mdm-resource.json` docs artifacts are loaded into docs retrieval without treating markdown as runtime content.
- Invalid cached docs artifacts are reported through compact `mdmDocs` diagnostics without failing the whole request.
- Mod archive inventory requests are persisted in runtime SQLite at `runtimeRoot/caches/mod-archives/mod-archive-inventory.sqlite`.
- Mod archive inventory cache validity uses workspace root, archive limits, nested archive limits, archive relative paths, sizes, and mtimes.
- Mod archive entry index persists data/assets/java/class entry paths and sizes into the same runtime SQLite cache.
- Mod archive entry index persists selected asset kinds for GUI textures, GUI sprites, and vanilla asset roots such as blockstates, models, textures, atlases, fonts, items, lang, shaders, sounds, texts, and waypoint styles.
- MCP inventory payloads expose compact entry index counts/cache state with `limit: 0`, avoiding full path dumps.
- MCP inventory payloads expose `assetResourceSummary` as counts-only metadata when supported asset resources exist, including `assetEntryCount`, UI-focused count, and per-kind counts.
- MCP mod archive content executor can explicitly trace JAR-internal blockstate/model/texture references without extracting archives or reading binary texture content into payloads.
- Loose workspace/resource-pack `assets/**` classification now covers vanilla asset categories including atlases, blockstates, equipment, font, items, lang, models, particles, post_effect, shaders, sounds, texts, textures, waypoint_style, and pack metadata.
- Datapack/resource adapter now exposes compact summaries with counts by domain, kind, and namespace.
- MCP datapack/resource executor now includes counts-only `resourceSummary` metadata in evidence payloads.
- Loose resource reference tracing now resolves blockstate model references, model parent references, model texture references, and missing targets without reading binary texture content.
- MCP datapack/resource executor now includes compact `resourceReferenceTrace` metadata only for explicit trace/reference requests that name traceable `assets/**` paths.
- Workspace detector now treats root-level and resource-root `assets/**` as datapack/resource evidence even without `pack.mcmeta` or `data/**`.
- Harness intent routing now recognizes explicit `data/...` and `assets/...` paths as datapack/resource lookup requests when datapack/resource roots exist.
- Class owner lookup uses the persistent entry index first and falls back to the existing JarJar scanner when needed.
- Natural-language refresh requests rebuild the SQLite mod archive inventory cache.
- Stale mod archive fingerprints rebuild inventory instead of returning old content summaries.
- Runtime service-profile tests prevent long UI/design methodology from entering guidance.
- Public MCP tool count remains one.
- File size guard passes: no source/test JSON/JS/TS file above 500 lines.
- Go residue guard passes: no Go files or Go module files remain.

Not implemented in this slice:

- Published GitHub Release workflow automation and retention policy.
- User confirmation flow for large/private/generated local packages.
- Full resource-backed docs search replacement beyond the first required docs package.
- Real-world LostCivilization/PrismLauncher full scenario validation.

## Completion Estimate
### MCP Core Capability
Estimated completion: 82-86%.

Completed:

- TypeScript monorepo
- `mc_develop` progressive public tool
- stdio MCP server
- request plan and evidence plan
- harness route and intent logic
- workspace detection
- Gradle source archive lookup
- Gradle dependency binary archive lookup
- JAR source/content lookup
- datapack file lookup
- ProbeJS/KubeJS type lookup and TypeScript language-service integration
- JDTLS runtime, diagnostics registry, lifecycle cleanup, and diagnostic source path bridge
- on-demand vanilla source acquisition
- local source package installation
- SQLite source index build/query/read
- structured content payload budgeting
- MDM local registry/cache/status integration
- MDM release manifest read/install/cache flow
- MDM docs resource loading into docs retrieval
- Compact MDM docs resource diagnostics
- Mod archive batch file reads
- JarJar nested archive batch reads
- Mod archive inventory summary with data/assets/class/java counts
- SQLite-backed persistent mod archive inventory cache
- SQLite-backed persistent mod archive entry index
- SQLite-backed class owner lookup for top-level mod classes with JarJar fallback
- Explicit mod archive inventory refresh and stale rebuild behavior
- Counts-only mod archive asset evidence summary for selected resource kinds
- Counts-only mod archive vanilla asset evidence summary for blockstates, models, textures, lang, and related roots
- Explicit mod archive resource reference trace for selected blockstate/model asset paths
- Vanilla-aware loose `assets/**` kind classification
- Counts-only local datapack/resource summary metadata
- Explicit loose resource reference trace for blockstate/model/texture chains
- Assets-only resource-pack routing without `pack.mcmeta`
- Runtime guidance boundary guard for resource/UI scope

Still incomplete:

- published release workflow and package retention policy
- broader docs retrieval from external resource package indexes
- full migration analysis across Java/KubeJS/datapack versions
- robust modpack-specific derived caches for ProbeJS snippets/items/registries
- persistent derived indexes beyond class paths and selected/local asset summaries, such as item/registry/recipe summaries and crash-triage lookup tables
- concentrated real-world scenario testing
- final install/usage docs and UX pass

### `mdm-sources` / `mdm-resources`
Estimated completion: 35-40%.

Completed:

- committed baseline
- package schema and registry schema
- local validation tooling
- required core docs package
- deterministic local release artifact builder
- local release artifact metadata written into registry
- CI validation workflow
- release artifact publication metadata baseline

Still incomplete:

- GitHub Release automation and retention policy
- package compatibility policy
- split package catalog for docs, libraries, content mods, generated indexes, and local/private derived packages
- MCP clear/list/status UX beyond current structured status and explicit install flow
- resource package signing or stronger provenance model
- real package payload expansion beyond the first required core docs package

### Overall Deliverability
Estimated alpha deliverability: 70-74%.

Interpretation:

- Local alpha loop is real and verified.
- MCP can explain whether required/optional resource packages are ready or missing.
- The system is not public-deliverable until remote package acquisition and UX docs are finished.

## Recommended Sequence
### Step 1: Feature Completion To Near 100%
Now that delivery closure is complete, return to MCP capability completion.

Priority:

1. Expand docs retrieval packages beyond the first required cached docs artifact.
2. Expand remote/local resource install semantics with confirmation for large/private/generated packages.
3. Expand persistent modpack JAR indexes beyond inventory/class ownership/asset summaries into data, recipes, datapack content, full resource evidence, and crash-triage lookup tables.
4. Improve Gradle workspace model extraction.
5. Expand KubeJS support for d.ts, snippets, items, registries, recipes, and generated ProbeJS variants.
6. Add migration analysis for Java/KubeJS/datapack version moves.
7. Harden JDTLS setup guidance and fallback behavior.

### Step 2: Concentrated Testing And UX
Do this after feature-completion work stabilizes.

Priority:

- Real PrismLauncher LostCivilization validation.
- Real Java mod workspace validation.
- Real KubeJS/ProbeJS validation.
- Real datapack validation.
- Crash triage with external mod JARs.
- Offline mode and cache-miss UX.
- Missing JDTLS/Gradle/ProbeJS setup UX.
- Clean install docs for MCP clients.

## Delivery Timeline Estimate
If work continues at the current pace:

- Local alpha delivery closure: complete.
- Beta replacement for day-to-day MC development: about 2-3 weeks.
- Public-quality delivery with remote resource releases and UX docs: about 4-6 weeks.

The next risk is scope expansion. Keep the next phase feature-focused and continue using review docs with real outputs.

## Verification Reference
Detailed verification output is recorded in:

`docs/reviews/2026-04-30-mdm-delivery-closure-verification.md`

`docs/reviews/2026-04-29-mod-archive-persistent-inventory-verification.md`

`docs/reviews/2026-04-29-mod-archive-refresh-stale-verification.md`

`docs/reviews/2026-04-30-mod-archive-entry-index-verification.md`

`docs/reviews/2026-04-30-mod-archive-class-owner-index-verification.md`

`docs/reviews/2026-04-30-resource-pack-asset-evidence-verification.md`

`docs/reviews/2026-04-30-local-resource-evidence-summary-verification.md`

`docs/reviews/2026-04-30-resource-reference-trace-verification.md`

`docs/reviews/2026-04-30-assets-only-resource-route-verification.md`

`docs/reviews/2026-04-30-mod-archive-vanilla-asset-summary-verification.md`

`docs/reviews/2026-04-30-mod-archive-resource-reference-trace-verification.md`
