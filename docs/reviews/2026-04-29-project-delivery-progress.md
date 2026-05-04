# Project Delivery Progress
Date: 2026-05-05
Author: m1hono
Scope: `mc-developing-mcp` `skill-update`, sibling `mdm-sources`, conceptual `mdm-resources`

## Executive Summary
本地交付闭环切片已经完成。项目现在不再只是 MCP 能力集合，而是有了可验证的资源包源仓库、release artifact、MCP registry reader、runtime cache 状态、checksum 校验，以及 `mc_develop` structuredContent 中的资源状态输出。

功能完成阶段已经继续推进到 modpack JAR 底层缓存：mod archive inventory 现在有 runtime SQLite 持久化缓存、entry index、JarJar/content summary 保留、显式 refresh、stale fingerprint 重建、class owner index、以及实际 MCP 返回值验证。资源支持也进入了一等证据域的第一批实现：mod archive asset evidence summary 现在能分类 vanilla asset roots 和 selected GUI-related asset paths，JAR 内显式资源请求能追踪 blockstate -> model -> texture，mod archive inventory 也能对 JAR 内 `data/**` 数据包内容输出 counts-only 分类摘要。loose `assets/**` 能按 vanilla asset format roots 分类，也能用 resource-location metadata 匹配 `demo:item/gear` 这类请求，不读取二进制纹理内容。MCP datapack/resource executor 会返回 counts-only `resourceSummary` metadata 和 compact `datapackVersionProfile`，并能从 `supported_formats` 报告兼容 pack format 范围和已知 MC 版本映射。datapack profile catalog 已修正为官方 `server.jar!/version.json` 的 datapack pack format，覆盖 release `1.18.2` 到 `26.1.2`，并支持 1.21.10+ 的 minor format。resource-pack profile catalog 也已基于官方 `server.jar!/version.json` 的 `pack_version.resource` 建立，覆盖同一 release 范围并与 datapack catalog 分离。source package manager 现在也能在用户确认后从 Mojang/Piston 风格 manifest 下载官方 archive，并生成只含 `data/**` 的 vanilla datapack runtime package 或 canonical `resource-pack` artifact 下只含 `assets/**` 的 vanilla resource-pack runtime package，不把 Mojang 内容存进仓库。旧 `assets` package id/API 仍保留为兼容入口。MCP datapack/resource executor 现在也能在没有本地 datapack/resource roots 时，通过现有 `mc_develop`/`source.bundle` 证据链读取已确认生成的 vanilla datapack package 或 vanilla resource-pack package，并能对 generated vanilla assets 执行显式 blockstate -> model -> texture 引用追踪。datapack 迁移也有了第一层 pack-format migration analysis，可对已知版本输出升级/降级方向、pack format delta、`pack.mcmeta` 更新动作，以及基于项目实际 data kind 的 compact risk hints。assets-only/resource-pack evidence 现在会输出独立的 compact `resourcePackVersionProfile` 和 `resourcePackMigrationAnalysis`，不再把 resource-pack `pack_format` 套用到 datapack catalog 上。显式请求时能追踪 blockstate -> model -> texture 的资源引用链和 missing texture，并且纯 `assets/**` 资源目录不再依赖 `pack.mcmeta` 才能进入资源证据链。external mod acquisition resolver 已落地到本地/Gradle/JAR 优先、Maven coordinate、Modrinth、credentialed CurseForge 的底层解析链；MCP external mod execution 能使用 Gradle-declared dependency cache JAR、local mod archives、runtime classifier JAR、Modrinth Maven/CurseMaven dispatch metadata 和用户显式 credential/fetch options，同时保持默认不自动下载远程 JAR。

本轮并行切片还完成了三个结构性底层改进：`datapack-adapter/src/files.ts` 和 `mod-archive-content-executor.ts` 已拆分出 helper，解除 500 行临界风险；`@mcpskill/resource-registry` 现在能区分 `sqlite_bundle`、`generated_local_cache`、`remote_manifest`、`optional_accelerator`，并把私有派生缓存标记为 `private_generated_cache`；KubeJS/ProbeJS language service 现在能宽容识别 `.probe`、`.probejs`、`probejs`、`kubejs/probejs` 等输出布局和 ProbeJS text snippets。Harness prompt injection 也新增 route-local evidence policy 和 KubeJS scripting policy，使 MCP description/brief 更接近小 agent 的引导效果，而不依赖 Skill。

本轮兼容性切片覆盖了 local-library-heavy workspace、多版本多 loader KTS workspace、generated resources workspace 和 multi-module NeoForge workspace 结构。实现上已经把 root `libs/*.jar` 视为 Java mod workspace 的本地 JAR evidence，Gradle dependency evidence 能解析 root `gradle.properties` 的简单 `${prop}` 版本并匹配 workspace `libs/`、`build/libs/` 内的 `+build` 和 `-slim` runtime JAR，datapack/resource roots 现在带 `main_resources` / `generated_resources` provenance，ProbeJS `.d.ts` 也能抽取 item/fluid/tag/registry resource literals。这些都没有增加新的 public MCP tool。

当前仍不能视为完整公开交付版，因为远程下载/安装、资源包发布 workflow 的实际发布、资源驱动 docs retrieval、真实整合包大场景验证和 UX 文档还没有完成。但 alpha 本地闭环已经成立，可以回到功能完成阶段。

## Current Repository State
### MCP
- Worktree: local `SKillUpdate`
- Branch: `skill-update`
- Remote: `origin/skill-update`
- Latest committed base before this progress update: `85fd0d1`
- Public MCP surface: one tool, `mc_develop`
- Latest full verification: `pnpm test` passed with 146 test files and 471 tests
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
- `083d18c feat(jar-source): trace archive resource references`
- `3e9a778 feat(jar-source): trace nested archive resources`
- `953c4f9 feat(jar-source): summarize archive data resources`
- `86474f7 feat(datapack): add official version profile catalog`
- `24a7378 feat(datapack): generate vanilla datapack packages`
- `9d19c71 feat(mcp-server): use generated vanilla datapack evidence`
- `a8d72d0 feat(source-package-manager): generate vanilla assets packages`
- `2d2f0f8 feat(mcp-server): use generated vanilla assets evidence`
- `340c9d0 feat(mcp-server): trace generated vanilla asset references`
- `e9a91e8 feat(datapack): analyze pack format migrations`
- `425f655 feat(datapack): report migration risk hints`
- `2d13229 feat(resource-pack): separate asset version profiles`
- `7a5183f feat(resource-pack): add official format catalog`
- `a31c1b7 feat(resource-pack): analyze format migrations`
- `e0733d2 feat(evidence): expand resource and dependency lookup`
- `85fd0d1 feat(core): harden evidence foundations`
- current progress update: compatibility harness, resource provenance, Gradle libs evidence, and ProbeJS d.ts resource literals

### `mdm-sources`
- Path: sibling `mdm-sources`
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
- MCP resource package metadata can distinguish required docs, optional datasets, optional accelerators, repository manifests, SQLite bundles, and private generated local caches.
- SQLite-oriented resource packages can declare database name, minimum user version, and required tables without forcing all packages to be SQLite.
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
- MCP inventory payloads expose `dataResourceSummary` as counts-only metadata when mod archives contain datapack `data/**` content, including recipes, tags, loot tables, worldgen, functions, structures, and generic registry JSON.
- MCP mod archive content executor can explicitly trace JAR-internal blockstate/model/texture references without extracting archives or reading binary texture content into payloads.
- MCP mod archive content executor can explicitly trace nested JarJar blockstate/model/texture references through `nested.jar!/assets/...` requests without extracting archives or reading binary texture content into payloads.
- Loose workspace/resource-pack `assets/**` classification now covers vanilla asset categories including atlases, blockstates, equipment, font, items, lang, models, particles, post_effect, shaders, sounds, texts, textures, waypoint_style, and pack metadata.
- Datapack/resource adapter now exposes compact summaries with counts by domain, kind, and namespace.
- MCP datapack/resource executor now includes counts-only `resourceSummary` metadata in evidence payloads.
- MCP datapack/resource executor now includes compact `datapackVersionProfile` metadata that combines `pack.mcmeta` and runtime evidence and explicitly reports that versioned schema validation and migration analysis are not implemented yet.
- MCP datapack/resource executor now includes `supportedFormats` and known compatible Minecraft versions in compact datapack profiles when `pack.mcmeta` provides `supported_formats`.
- MCP datapack/resource executor now includes compact `datapackMigrationAnalysis` when a request names source and target Minecraft versions such as `from 1.20.1 to 1.21.1`, including compact risk hints for observed local data kinds.
- MCP datapack/resource executor now includes compact `resourcePackVersionProfile` for assets-only/resource-pack evidence and avoids returning `datapackVersionProfile` for assets-only roots.
- Datapack profile catalog now uses official datapack formats from Mojang/Piston `server.jar!/version.json`, not resource pack format values.
- Datapack profile catalog covers release versions from `1.18.2` through `26.1.2`, including `1.21.10+` minor data formats such as `88.0`, `94.1`, and `101.1`.
- Resource-pack profile catalog now uses official resource formats from Mojang/Piston `server.jar!/version.json`, not datapack format values.
- Resource-pack profile catalog covers release versions from `1.18.2` through `26.1.2`, including minor resource formats such as `69.0`, `75.0`, and `84.0`.
- MCP datapack/resource executor now includes compact `resourcePackMigrationAnalysis` for assets-only/resource-pack migration requests.
- MCP datapack/resource executor now exposes `packFormatId` and structured `packFormatVersion` to avoid losing minor format information.
- `pack.mcmeta` parsing now supports new-style `min_format` and `max_format` ranges in addition to `pack_format` and `supported_formats`.
- Source package manager can now represent `artifactType: "datapack"` packages.
- Source package manager can now generate vanilla datapack packages by extracting only `data/**` from local official archives.
- Source package manager can now generate vanilla datapack packages from Mojang/Piston-style manifests through a remote archive recipe, still gated by explicit package confirmation.
- Source package manager can now generate canonical vanilla resource-pack packages by extracting only `assets/**` from local official archives or Mojang/Piston-style remote client archives, still gated by explicit package confirmation.
- Source package manager still keeps the older vanilla `assets` package coordinate and provider as a compatibility path for existing services.
- MCP datapack/resource executor can now use a generated vanilla datapack package as evidence when no local datapack roots exist and the request explicitly targets vanilla/official `minecraft:*` or `data/minecraft/...`.
- MCP datapack/resource executor can now use a generated canonical vanilla resource-pack package as evidence when no local resource roots exist and the request explicitly targets vanilla/official `assets/minecraft/...`.
- MCP datapack/resource executor can now trace blockstate/model/texture references over generated vanilla assets packages for explicit trace/reference requests.
- External mod acquisition is now specified as a bottom-layer resolver plan: local/Gradle/JAR evidence first, then Maven, Modrinth, and credentialed CurseForge API resolution.
- `@mcpskill/external-mod-resolver` now resolves Modrinth candidates with project/version/file/hash metadata, Modrinth Maven dispatch metadata, and explicit confirmation gates.
- `@mcpskill/external-mod-resolver` now resolves fixture-backed CurseForge candidates into CurseMaven dispatch metadata when a credential provider is configured, and returns setup guidance when credentials are missing.
- Harness and evidence planning now route explicit vanilla datapack requests to `datapack_files` without adding a new public MCP tool.
- Harness and evidence planning now route explicit vanilla assets requests to `datapack_files` without adding a new public MCP tool.
- Loose resource reference tracing now resolves blockstate model references, model parent references, model texture references, and missing targets without reading binary texture content.
- MCP datapack/resource executor now includes compact `resourceReferenceTrace` metadata only for explicit trace/reference requests that name traceable `assets/**` paths.
- Loose `assets/**` evidence can match resource-location metadata such as `demo:item/gear` against item/model/texture paths without dumping binary texture content.
- Datapack/resource roots now include `rootRelativePath` and provenance such as `main_resources` and `generated_resources`, with `byProvenance` summary counts for mod workspace resource roots.
- Datapack/resource file scanning helpers are split into entry creation, content reading, and resource-location metadata modules; `files.ts` is no longer a 500-line risk.
- Workspace detector now treats root-level and resource-root `assets/**` as datapack/resource evidence even without `pack.mcmeta` or `data/**`.
- Workspace detector now treats root `libs/*.jar` as local mod archive evidence while continuing to ignore `*-sources.jar`.
- Harness intent routing now recognizes explicit `data/...` and `assets/...` paths as datapack/resource lookup requests when datapack/resource roots exist.
- Java mod workspaces with local libs JARs now route `workspace_source -> mod_archive_content -> docs_lookup` by default, matching local-library-heavy workspace fixtures.
- Gradle dependency parsing now resolves simple root `gradle.properties` placeholders inside dependency notations.
- Gradle dependency binary archive discovery now checks workspace `libs/` and `build/libs/` flat directories and accepts runtime filenames with build metadata and classifiers such as `+11` and `-slim`.
- MCP Gradle dependency archive evidence now accepts workspace libs candidates and labels them separately from Gradle cache candidates.
- Class owner lookup uses the persistent entry index first and falls back to the existing JarJar scanner when needed.
- Natural-language refresh requests rebuild the SQLite mod archive inventory cache.
- Stale mod archive fingerprints rebuild inventory instead of returning old content summaries.
- Mod archive content execution helpers are split into selection, search, metadata, owner lookup, and constants modules; `mod-archive-content-executor.ts` is no longer a 500-line risk.
- KubeJS ProbeJS language project discovery supports multiple ProbeJS output layouts and snippet text files while staying scoped to Minecraft/KubeJS evidence.
- ProbeJS `.d.ts` semantic extraction now reports compact item, fluid, tag, and registry resource literals from recognized KubeJS/ProbeJS declaration contexts.
- Task briefs now inject route-local evidence policy and KubeJS scripting policy into MCP prompt assembly.
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
Estimated completion: 91-94%.

Completed:

- TypeScript monorepo
- `mc_develop` progressive public tool
- stdio MCP server
- request plan and evidence plan
- harness route and intent logic
- workspace detection
- Gradle source archive lookup
- Gradle dependency binary archive lookup
- Gradle root property placeholder resolution for dependency notation
- Workspace flat `libs/` and `build/libs/` dependency archive evidence
- JAR source/content lookup
- datapack file lookup
- ProbeJS/KubeJS type lookup and TypeScript language-service integration
- tolerant ProbeJS declaration/snippet discovery across legacy and `kubejs/probejs` layouts
- ProbeJS `.d.ts` resource literal evidence for items, fluids, tags, and registries
- JDTLS runtime, diagnostics registry, lifecycle cleanup, and diagnostic source path bridge
- on-demand vanilla source acquisition
- local source package installation
- SQLite source index build/query/read
- structured content payload budgeting
- MDM local registry/cache/status integration
- MDM package metadata for SQLite bundles, optional accelerators, remote manifests, and private generated caches
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
- Counts-only mod archive datapack data summary for recipes, tags, loot tables, worldgen, functions, structures, and registry JSON roots
- Explicit mod archive resource reference trace for selected blockstate/model asset paths
- Explicit nested JarJar resource reference trace for selected `nested.jar!/assets/...` blockstate/model asset paths
- Vanilla-aware loose `assets/**` kind classification
- Standard mod workspace resource root provenance for main and generated resources
- Counts-only local datapack/resource summary metadata
- Compact local datapack version profile metadata with known profile, unknown version, unresolved, and conflict states
- Compact local datapack supported format range metadata with known compatible Minecraft version mapping
- Compact datapack pack-format migration analysis and observed data-kind risk hints for known source/target Minecraft versions
- Official datapack release profile catalog from `1.18.2` through `26.1.2`, including minor pack formats
- Official resource-pack release profile catalog from `1.18.2` through `26.1.2`, separate from datapack formats
- Compact resource-pack pack-format migration analysis and observed asset-kind risk hints for known source/target Minecraft versions
- User-confirmed generated vanilla datapack runtime packages from official archive metadata
- MCP-side generated vanilla datapack package evidence through `source.bundle`
- User-confirmed generated vanilla assets runtime packages from official archive metadata
- MCP-side generated vanilla assets package evidence through `source.bundle`
- Explicit generated vanilla assets reference trace for blockstate/model/texture chains
- Canonical `resource-pack` source package artifact type with legacy `assets` compatibility
- Explicit loose resource reference trace for blockstate/model/texture chains
- Assets-only resource-pack routing without `pack.mcmeta`
- Assets-only resource-pack profile separation from datapack version profile
- Runtime guidance boundary guard for resource/UI scope
- Harness prompt evidence policy and KubeJS scripting policy injection through MCP request assembly
- Harness routing for libs-heavy Java mod workspaces through local JAR evidence before docs
- Refactored datapack file scanning and mod archive content execution internals below the 500-line danger zone

Still incomplete:

- published release workflow and package retention policy
- real-key CurseForge smoke validation outside committed tests
- broader docs retrieval from external resource package indexes
- versioned resource-pack asset validation
- full schema-level migration analysis across Java/KubeJS/datapack versions
- robust modpack-specific derived caches for ProbeJS items/registries/recipes
- persistent derived indexes beyond class paths and selected/local asset/data summaries, such as detailed item/registry/recipe lookup tables, nested resource reference lookup tables, and crash-triage lookup tables
- concentrated real-world scenario testing
- final install/usage docs and UX pass

### `mdm-sources` / `mdm-resources`
Estimated completion: 40-45%.

Completed:

- committed baseline
- package schema and registry schema
- local validation tooling
- required core docs package
- deterministic local release artifact builder
- local release artifact metadata written into registry
- MCP-side metadata model for SQLite bundles, optional accelerators, remote manifests, and private generated caches
- CI validation workflow

Still incomplete:

- GitHub Release automation and retention policy
- package compatibility policy
- split package catalog for docs, libraries, content mods, generated indexes, and local/private derived packages
- MCP clear/list/status UX beyond current structured status and explicit install flow
- resource package signing or stronger provenance model
- real package payload expansion beyond the first required core docs package

### Overall Deliverability
Estimated alpha deliverability: 80-84%.

Interpretation:

- Local alpha loop is real and verified.
- MCP can explain whether required/optional resource packages are ready or missing.
- The system is not public-deliverable until remote package acquisition and UX docs are finished.

## Recommended Sequence
### Step 1: Feature Completion To Near 100%
Now that delivery closure is complete, return to MCP capability completion.

Priority:

1. Expand docs retrieval packages beyond the first required cached docs artifact.
2. Expand remote/local resource install semantics with confirmation UX for large/private/generated packages.
3. Expand persistent modpack JAR indexes beyond inventory/class ownership/asset/data summaries into detailed recipes, datapack content lookup, nested resource reference indexes, full resource evidence, and crash-triage lookup tables.
4. Validate external mod acquisition with real Modrinth/CurseForge/Maven smoke tests while keeping user-supplied credentials out of the repo.
5. Improve Gradle workspace model extraction for multi-loader KTS modules and aggregate loader run modules.
6. Expand KubeJS support from d.ts resource literal extraction into persistent item, registry, and recipe lookup tables.
7. Add migration analysis for Java/KubeJS/datapack version moves.
8. Harden JDTLS setup guidance and fallback behavior.

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

`docs/reviews/2026-04-30-datapack-official-version-catalog-verification.md`

`docs/reviews/2026-05-01-vanilla-datapack-package-generation-verification.md`

`docs/reviews/2026-05-01-mcp-vanilla-datapack-package-evidence-verification.md`

`docs/reviews/2026-05-01-vanilla-assets-package-generation-verification.md`

`docs/reviews/2026-05-01-mcp-vanilla-assets-package-evidence-verification.md`

`docs/reviews/2026-05-01-mcp-vanilla-assets-reference-trace-verification.md`

`docs/reviews/2026-05-01-datapack-pack-format-migration-analysis-verification.md`

`docs/reviews/2026-05-01-resource-pack-profile-separation-verification.md`

`docs/reviews/2026-04-30-assets-only-resource-route-verification.md`

`docs/reviews/2026-04-30-mod-archive-vanilla-asset-summary-verification.md`

`docs/reviews/2026-04-30-mod-archive-resource-reference-trace-verification.md`

`docs/reviews/2026-04-30-nested-mod-archive-resource-reference-trace-verification.md`

`docs/reviews/2026-04-30-mod-archive-data-summary-verification.md`

`docs/reviews/2026-04-30-datapack-version-profile-verification.md`

`docs/reviews/2026-04-30-datapack-supported-formats-profile-verification.md`

`docs/reviews/2026-05-05-resource-location-metadata-match-verification.md`

`docs/reviews/2026-05-05-external-mod-gradle-dependency-archive-verification.md`

`docs/reviews/2026-05-05-loader-dependency-owner-metadata-verification.md`

`docs/reviews/2026-05-05-agent-harness-evidence-injection-verification.md`

`docs/reviews/2026-05-05-kubejs-probejs-tolerant-discovery-verification.md`

`docs/reviews/2026-05-05-resource-registry-sqlite-package-status-verification.md`

`docs/reviews/2026-05-05-external-case-harness-verification.md`

`docs/reviews/2026-05-05-external-case-resource-pack-evidence-verification.md`

`docs/reviews/2026-05-05-external-case-gradle-jar-evidence-verification.md`

`docs/reviews/2026-05-05-external-case-kubejs-data-evidence-verification.md`

`docs/reviews/2026-05-05-anonymized-client-visual-systems-spec-verification.md`
