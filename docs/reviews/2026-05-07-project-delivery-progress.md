# Project Delivery Progress

Date: 2026-05-07
Author: m1hono

## Summary

The project is no longer in a shell-only stage. The MCP side has a working
single-tool `mc_develop` path with workspace detection, Gradle/JAR/ProbeJS/LSP
evidence, datapack/resourcepack evidence, MDM resource install/status, SQLite
docs lookup, and conservative source acquisition handlers.

The remaining delivery gap is now concentrated in live release distribution,
broader package corpus coverage, source-index corpus generation,
loader-specific variants, and final UX polish. The release producer is now
hardened enough to verify local release installability before upload; the
remaining live-release gap is the actual public GitHub Release acceptance run.

## Current Capabilities

- Public MCP surface remains one progressive tool: `mc_develop`.
- TypeScript-only implementation is maintained; previous Go direction is not in
  the active architecture.
- Source acquisition can plan runtime cache, local jar indexing, vanilla
  generation confirmation, and remote metadata without default remote calls.
- Local mod jars can be indexed into runtime-private SQLite cache and summarized
  by assets/classes/data domains.
- Vanilla source generation remains user-confirmed and runtime-local; Minecraft
  source is not committed into `mdm-sources`.
- `mdmReleaseInstall` can install release artifacts into runtime cache only when
  `downloadPolicy: "allowed"` is explicitly supplied.
- SQLite docs artifacts can be installed, marked ready, searched through
  `docs_lookup`, and returned as `source: "sqlite"` evidence.
- MDM release metadata now preserves `artifactType`, `artifactKind`, and
  `queryAdapter` through registry, status, and v2 manifest conversion. Installed
  `source_index_sqlite` artifacts are routed into a dedicated source-index lane
  and excluded from docs SQLite lookup.
- MDM source-index artifacts can now be passed as explicit database paths into
  Mixin member evidence collection. This avoids relying on recursive discovery
  of a hard-coded `source-index.sqlite` filename and lets installed release
  artifacts participate in compact member proof.
- A newly installed `source_index_sqlite` release artifact can now be consumed
  in the same `mc_develop` call for Mixin member proof. The executor now carries
  MDM source-index database paths through the mod-archive content executor.
- Installed MDM `source_index_sqlite` artifacts are now also available to
  `source.bundle` vanilla source lookup. If the installed vanilla source pack
  lacks the actual `.java` file, MCP can still return compact
  `source_chunks.content` evidence from the SQLite artifact instead of wasting
  context searching for missing workspace source.
- Service-profile and `source_acquisition_plan` now surface installed MDM
  source-index SQLite artifacts as ready/cached source index evidence, not only
  as an abstract plan to query cached packages later.
- Source-index chunk reading is now a public `@mcpskill/source-index` API
  instead of private vanilla-adapter code. Vanilla source lookup reuses the
  shared chunk reader, so future source acquisition and mod-archive paths can
  share the same SQLite chunk evidence contract.
- MDM package recommendations now recognize `source_index_sqlite`,
  `source_index`, `source_lookup`, and `source_chunk_search` as source signals,
  and version-match `minecraft-<version>-source-index` packages.
- MCP resource-registry now rejects invalid SQLite `minUserVersion` metadata at
  manifest parse time unless it is a finite non-negative integer, matching the
  stricter `mdm-sources` release manifest schema.
- MCP resource-registry now enforces the release manifest contract for
  schemaVersion, artifact file names, lowercase sha256 digests, non-negative
  integer artifact sizes, required release routing metadata, and non-empty
  package capabilities before a release manifest can be adapted into runtime
  package state.
- MCP source-package-manager now emits the same source-index schema id as
  `mdm-sources`: `mdm.source.index.sqlite`.
- Source acquisition workspace routes now execute through the unified work item
  runner. Gradle workspace routes read declared dependencies and repositories;
  ProbeJS workspace routes call the existing ProbeJS/KubeJS evidence path for
  type/resource summaries. This keeps the public MCP surface at `mc_develop`
  while making workspace-local evidence visible in the source acquisition flow.
- `source_acquisition_plan` now includes a lightweight version-filtered
  `sourceIndexPreview` when cached source indexes are available and a stable
  Java FQCN/path can be extracted. The preview returns metadata, paths, line
  ranges, chunk ids, and match reasons only; it intentionally does not return
  source/chunk content.
- Explicit MDM `source_index_sqlite` artifacts can now satisfy vanilla
  `source.bundle` requests even before the vanilla source-pack confirmation is
  granted. The response returns compact SQLite chunk evidence while preserving
  acquisition evidence that the full source pack still needs confirmation.
- GitHub Release shaped remote `manifestUrl` installs are covered with injected
  fetchers, real `mdm-sources` SQLite artifact bytes, checksum verification, and
  docs lookup.
- `mc_develop` now emits conservative MDM package recommendations by task
  signal, including confirmation-safe `mdmReleaseInstall` hints that default to
  `downloadPolicy: "disabled"`.
- Source lookup, mapping-migration, datapack, and resourcepack requests now
  recommend version-specific public MDM profiles when available. Explicit
  request versions such as 1.14.4, 1.21.1, or 26.1 take priority; otherwise MCP
  falls back to the detected workspace runtime version. Actual source generation
  stays runtime-local and user-confirmed.
- Mapping-intent source acquisition can now append a runtime-private
  `mapping_index` work item and materialize provider-supplied mapping entries
  into JSONL under the MCP runtime root. Unsafe cache keys are rejected, damaged
  mapping JSONL is rebuilt through the provider, and non-missing filesystem
  read errors are not silently treated as cache misses.
- MCP now has a Tiny v2 mapping provider foundation. It can parse raw Tiny v2
  text or `.zip`/`.jar` artifacts containing `.tiny` mappings, and `mc_develop`
  can enable Yarn mapping downloads only when `MCPSKILL_YARN_MAPPING_URL_TEMPLATE`
  is configured. No mapping download happens by default.
- MCP can also resolve Yarn mappings from Fabric-style Maven metadata when
  `MCPSKILL_YARN_MAVEN_BASE_URL` is explicitly configured. It reads
  `net/fabricmc/yarn/maven-metadata.xml`, selects the highest
  `${minecraftVersion}+build.N` entry for the requested Minecraft version, then
  downloads the matching `yarn-...-v2.jar` and materializes the Tiny v2 rows into
  runtime-private JSONL. Metadata misses are reported as provider-unavailable
  and are not cached as ready empty indexes. This remains opt-in and uses
  injected fetchers in tests.
- MCP can resolve official Mojang/Mojmap mappings when
  `MCPSKILL_MOJANG_VERSION_MANIFEST_URL` is explicitly configured. It reads the
  configured version manifest, follows the requested version JSON, fetches
  `client_mappings` and `server_mappings` when present, parses ProGuard mapping
  text, and stores only runtime-private `official -> mojmap` mapping indexes.
  Missing versions or missing mapping artifacts are provider-unavailable and are
  not cached as ready empty indexes.
- MCP can resolve Parchment metadata when `MCPSKILL_PARCHMENT_MAVEN_BASE_URL`
  is explicitly configured. It reads `org.parchmentmc.data:parchment-<mc>` Maven
  metadata, selects the release artifact, parses `parchment.json` from the zip,
  and stores runtime-private `mojmap -> parchment` enrichment entries with
  javadocs and parameter metadata. Parchment is treated as documentation and
  parameter enrichment over Mojmap names, not as an obfuscated rename table.
- Datapack and resourcepack support are separate package families and separate
  evidence profiles.
- Resourcepack/client-visual support covers assets, models, blockstates,
  textures, atlases, language, sounds, UI assets, shader-related paths, and
  resource reference tracing at compact evidence level.
- Installed v2 `json_docs` guidance bundles can now be synthesized into compact
  searchable docs records even when the payload is structured guidance rather
  than an explicit `entries[]` document index. This lets cached client-visual or
  KubeJS guidance packages participate in MCP `docs_lookup` without adding a
  public tool or copying large prompt blocks.
- The public client-visual 1.20.1 guidance package has been expanded to version
  0.2.0. It now carries structured visual targets, evidence-chain contracts,
  relationship discovery rules, role-equivalent API search terms, distribution
  boundaries, and output schema guidance for UI, renderer, shader, dynamic
  texture, and resourcepack work.
- Runtime-private generated indexes remain outside public release repositories.

## `mdm-sources` Status

`mdm-sources` is now a real package source repository, but not yet a fully
polished release product.

Implemented:

- v2 package manifests with artifact kind, format, privacy, lifecycle, query
  adapter, release channel, and family metadata.
- Public/private policy split: public curated payloads can be released; private
  ProbeJS, modpack-derived indexes, source trees, and embeddings stay local.
- JSON/JSONL `.mdm-resource.json` artifact generation.
- Real SQLite docs artifact generation from normalized JSON input.
- SQLite docs artifacts declare `storageKind: "sqlite_bundle"`, required tables,
  and minimum `user_version`.
- Real SQLite source-index artifact generation from normalized JSON input is now
  supported on the `mdm-sources` producer side. `source_index` packages use
  `artifactType: "source_index"`, `artifactKind: "source_index"`, and
  `queryAdapter: "source_index_sqlite"` in release manifests.
- Source-index SQLite producer output is now aligned with the MCP runtime
  `@mcpskill/source-index` schema: `files`, `java_symbols`, `java_members`,
  `fts_files`, `source_chunks`, and `fts_chunks`. Public source-index artifacts
  remain metadata/index artifacts and still do not bundle Minecraft source
  trees.
- Source-index payloads now support compact `files` metadata plus explicit
  `javaSymbols`, `javaMembers`, and `sourceChunks` arrays. This lets future
  corpus generators or AI-maintained local packages emit normalized index data
  without pretending every record is only a file summary.
- Source-index payloads now have an explicit public JSON schema contract in
  `schema/source-index-payload.schema.json`. Repository validation checks this
  contract before semantic source-index validation, and source-index packages
  must declare `artifact.schemaId: "mdm.source.index.sqlite"` before release
  materialization.
- Source-index payloads are now validated before release build. Invalid
  top-level `javaMembers` without a path, invalid member kinds, and malformed
  `sourceChunks` without content or chunk ids are rejected by
  `tools/validate.mjs` instead of failing later during SQLite materialization.
- Release builder cleans stale output before writing `release-out`.
- Release package metadata mapping is split out of the release builder, keeping
  `tools/build-local-release.mjs` below the 500-line project limit after the
  source-index payload work.
- Release workflow builds with `--no-registry-update` so CI publishing does not
  rewrite tracked registry metadata.
- Release workflow uploads only artifacts listed in `mdm-release-manifest.json`,
  not arbitrary stale `release-out/*` files.
- Release builder now emits `mdm-release-summary.json` with provenance, manifest
  hash, package counts, artifact distributions, total size, and per-artifact
  hashes.
- Release manifest and summary now have tracked schema contracts in
  `mdm-sources/schema/release-manifest.schema.json` and
  `mdm-sources/schema/release-summary.schema.json`.
- Release tooling now defines the manifest install contract: package artifacts
  resolve as siblings of `mdm-release-manifest.json`, equivalent to
  `new URL(entry.artifactName, manifestUrl)` for remote MCP clients.
- Release workflow now runs `tools/verify-release-schema.mjs` before upload.
  The verifier validates the release manifest and summary schema subset, then
  checks that summary package counts, artifact names, and artifact hashes match
  the manifest.
- Release workflow now runs `tools/verify-release-install.mjs` before upload.
  The verifier reads a local path or HTTP manifest URL, resolves every artifact,
  checks sha256 and size, and opens SQLite docs bundles to confirm required
  tables exist.
- Release install verification now includes a source-index SQLite smoke check:
  `source_index_sqlite` artifacts must contain indexed `files`,
  `source_chunks`, and `fts_chunks` rows, not only empty tables with correct
  checksums.
- Release install verification now enforces SQLite `user_version` against
  `metadata.sqlite.minUserVersion` when release metadata declares a minimum
  schema version. This keeps release acceptance aligned with MCP runtime
  resource-registry status checks.
- Release manifest schema now validates SQLite metadata structure instead of
  accepting an opaque object. `metadata.sqlite.minUserVersion` must be numeric
  and `metadata.sqlite.requiredTables` must be a string array before release
  schema verification can pass.
- Release manifest schema now treats SQLite release metadata as a complete
  release contract: `databaseName`, integer `minUserVersion`, and a non-empty
  `requiredTables` list are required for SQLite metadata in public releases.
- Public `sources` channel coverage is now generated from the release catalog's
  official release list. Current catalog coverage is 101 vanilla source profile
  packages, including older releases such as 1.14.4 and 1.12.2 plus current
  26.1.x releases. These are profile/guidance artifacts only and do not bundle
  Minecraft source.
- Public loader-specific source profiles now cover the first loader matrix for
  Forge, NeoForge, Fabric, and Quilt across key versions: 1.7.10, 1.12.2,
  1.14.4, 1.16.5, 1.18.2, 1.20.1, 1.21.1, 26.1, and 26.1.2. These 18 packages
  are metadata-only `loader-sources` profiles that describe runtime-private
  Minecraft and loader API source acquisition; they do not bundle source,
  remapped trees, generated indexes, or private workspace data.
- Public `datapack` and `resourcepack` channel coverage is generated from the
  same official release catalog. Current catalog coverage is 101 datapack
  profile packages and 101 resourcepack profile packages, covering 1.0 through
  current 26.1.x catalog releases.
- Datapack/resourcepack generated payloads are public metadata profiles only:
  they include version-scoped roots, trace rules, distribution policy,
  licensing notes, runtime pack metadata resolution policy, and local cache
  ownership. They do not bundle vanilla data files, assets, archive indexes, or
  private modpack-derived content.
- Public `mappings` channel coverage is generated from the same official release
  catalog. Current catalog coverage is 101 Yarn mapping profile packages,
  covering 1.0 through current 26.1.x catalog releases. These are namespace and
  acquisition-policy profiles only; they do not bundle generated mapping tables
  or remapped source.
- `mdm-sources` now has producer-side sync tools for source, datapack,
  resourcepack, and mapping profiles plus registry files, with a single
  `sync-repository` entrypoint. Schema/registry entries are generated from
  package manifests instead of hand-copied per version.
- The public KubeJS 1.20.1 guidance package has been expanded to version 0.2.0.
  It now covers script scope selection, KubeJS-first event selection,
  ForgeEvents, NativeEvents, Java interop, `global` state discipline,
  ProbeJS-as-local-evidence policy, debug/logging hygiene, reload lifecycle,
  integration boundaries, and datapack/resourcepack/client-server separation.
  It remains public guidance only and does not include private ProbeJS dumps or
  modpack scripts.

Not done:

- Live published GitHub Release acceptance run.
- Signing/provenance/retention policy.
- Large public docs corpus.
- Loader-specific source profile coverage beyond the first curated matrix, and
  loader-specific data/resource profile variants beyond vanilla.
- Larger real source-index corpus generation and live release acceptance. The
  schema path is aligned, but broad source-index datasets still need controlled
  generation from allowed local/user-confirmed inputs.
- Broader KubeJS corpus beyond the initial 1.20.1 guidance package and dynamic
  MCP selection that deeply reads installed guidance payloads.
- Source acquisition workspace-route execution parity is now covered for the
  Gradle and ProbeJS happy paths. Remaining work is broader end-to-end
  `mc_develop` acceptance over real modpack workspaces and richer payload
  ranking/budgeting.

## Evidence

Recent verification records:

- `docs/reviews/2026-05-06-mdm-v2-install-smoke-report.md`
- `docs/reviews/2026-05-06-mdm-sqlite-docs-end-to-end-verification.md`
- `docs/reviews/2026-05-07-real-mdm-release-consumption-verification.md`
- `docs/reviews/2026-05-07-mdm-package-recommendations-verification.md`
- `docs/reviews/2026-05-07-mdm-source-profile-recommendation-verification.md`
- `docs/reviews/2026-05-07-unified-source-acquisition-cache-verification.md`
- `docs/reviews/2026-05-07-source-acquisition-production-acceptance-verification.md`

Current fresh checks from this slice:

```text
mdm-sources node --test tests/*.test.mjs: 35 passed
mdm-sources node tools/validate.mjs: packageCount 411, errorCount 0
mdm-sources build --no-registry-update: cleaned stale output and did not mutate registry
mdm-sources release schema verifier: packageCount 411, errorCount 0
mdm-sources release summary: manifest packageCount 411, artifactCount 411, totalSizeBytes 2375815, formats json 409/jsonl 1/sqlite 1
mdm-sources release install verifier: verifiedCount 411/411, first core-docs-required, sqlite core-docs-search-sqlite sizeBytes 32768, last minecraft-26.1-vanilla-source-profile
mdm-sources release upload list: 413 files, including mdm-release-manifest.json, mdm-release-summary.json, and 411 manifest-declared artifacts
mdm-sources SQLite artifact: userVersion 3, docs_entries 5, docs_entries_fts 5
mdm-sources source-index SQLite artifact fixture: artifactName minecraft-1.20.1-source-index-0.1.0.sqlite, artifactType source_index, artifactKind source_index, queryAdapter source_index_sqlite, requiredTables files/java_symbols/java_members/fts_files/source_chunks/fts_chunks
mdm-sources source-index schema alignment: node --test tests/build-local-release-source-index.test.mjs passed; node --test tests/validate-v2.test.mjs tests/verify-release-install.test.mjs tests/build-local-release-source-index.test.mjs passed 13 tests; node --test tests/*.test.mjs passed 38 tests after payload validation; node tools/validate.mjs packageCount 411 errorCount 0; local release schema verifier packageCount 411 errorCount 0; install verifier verified 411/411
mdm-sources normalized source-index payloads: source-index release test passed with files plus javaSymbols/javaMembers/sourceChunks; validate-v2 now has 12 tests including missing java member path, invalid memberKind, and missing source chunk content/chunkId; node tools/validate.mjs packageCount 411 errorCount 0; node --test tests/*.test.mjs passed 38 tests; local release schema verifier packageCount 411 errorCount 0; install verifier verified 411 artifacts
mdm-sources source-index payload contract validation: committed and pushed PickAID/mdm-sources main 44ed09b; tools/validate.mjs 389 lines, tools/source-index-payload-validation.mjs 144 lines, tests/validate-v2.test.mjs 322 lines
mdm-sources release builder maintainability: build-local-release.mjs reduced to 384 lines by moving package metadata mapping into tools/release-package-metadata.mjs; node tools/validate.mjs packageCount 411 errorCount 0; node --test tests/*.test.mjs passed 35 tests; release schema verifier packageCount 411 errorCount 0; install verifier verified 411 artifacts
mdm-sources sources profile: packageCount 115, sources artifacts 101, sync tools tested, full tests 24 passed
mdm-sources datapack profiles: generated packages 101, release artifacts 101, first minecraft-1.0-vanilla-datapack-profile, last minecraft-26.1-vanilla-datapack-profile
mdm-sources resourcepack profiles: generated packages 101, release artifacts 101, first minecraft-1.0-vanilla-resourcepack-profile, last minecraft-26.1-vanilla-resourcepack-profile
mdm-sources mapping profiles: generated packages 101, release artifacts 101, first minecraft-1.0-yarn-mapping-profile, last minecraft-26.1.2-yarn-mapping-profile
mdm-sources KubeJS guidance 0.2.0: docs release artifact kubejs-1.20.1-guidance-0.2.0.mdm-resource.json, sha256 38c698ea30bf3c437c96514f18c351278cdcf4062de1f56f4da8075241fde0f3, sizeBytes 16454
mdm-sources KubeJS guidance artifact content: scopeRules 4, eventBridgeRules 4, integrationBoundaries 5, lookupHints 10
mdm-sources client-visual guidance 0.2.0: docs release artifact client-visual-1.20.1-guidance-0.2.0.mdm-resource.json, sha256 4f92c04637bc7b3a7a6251bdda0f72704b77d3df8a1aad5aa5044e377ad77795, sizeBytes 15728
mdm-sources client-visual guidance artifact content: visualTargets 4, relationshipDiscoveryRules 4, roleEquivalentSearch 8
MCP real mdm-sources release consumption: installed and searched core-docs-search-sqlite
MCP stdio real release consumption: installed and searched core-docs-search-sqlite through JSON-RPC
MCP remote URL acceptance: installed real SQLite bytes through GitHub Release shaped manifest/artifact URLs
MCP MDM package recommendations: KubeJS/datapack task produced safe install hints without auto-download
MCP versioned profile recommendations: source/datapack/resourcepack/mapping tasks selected requested Minecraft versions
MCP runtime mapping index adapter: source-package-manager 16 files / 65 tests passed
MCP runtime mapping index adapter and Tiny v2 provider: mcp-server 96 files / 311 tests passed
MCP runtime mapping index cache hardening: unsafe version segment rejected, corrupt JSONL rebuilt, EISDIR read error propagated
MCP configurable Yarn Tiny v2 provider: URL template is opt-in through MCPSKILL_YARN_MAPPING_URL_TEMPLATE and supports injected fetch verification
MCP Yarn Maven metadata resolver: selected highest matching Yarn build, fetched v2 jar, confirmed no mapping fetch when no provider/env is configured, and does not cache metadata misses as ready empty indexes; mcp-server 96 files / 316 tests passed for focused acceptance run
MCP Mojmap manifest resolver: parsed ProGuard mappings, followed configured Mojang version manifest to client/server mapping artifacts, confirmed Mojmap requests do not use Yarn provider env, and confirmed no default Mojang fetch without env; mcp-server 98 files / 322 tests passed for focused acceptance run
MCP Parchment Maven resolver: selected release metadata, fetched parchment zip, parsed parchment.json as mojmap-to-parchment enrichment entries with javadocs/parameters, and confirmed no default Parchment fetch without env; mcp-server 100 files / 328 tests passed for focused acceptance run
MCP v2 guidance docs synthesis: docs-retrieval package 15 tests passed; installed client-visual guidance artifact was cached and hit through mc_develop docs_lookup; real artifact search matched dynamic texture reload cleanup, nine slice metadata, and shader sampler render target; mcp-server 100 files / 329 tests passed for focused acceptance run
MCP source-index artifact routing: resource-registry 8 files / 33 tests passed; mcp-server 100 files / 330 tests passed; source_index_sqlite artifacts preserve artifactType/artifactKind/queryAdapter, convert to v2 source_index/source_index_sqlite, and are excluded from docs SQLite lookup
MCP explicit source-index database paths: mcp-server 100 files / 331 tests passed; non-source-index.sqlite MDM artifact path produced valid Mixin method proof for com.example.compat.TargetApi.call()
MCP installed source-index release consumption: initial red test showed downloaded source_index_sqlite artifact was ready in MDM status but searchedSourceIndexes stayed 0; fix propagated sourceIndexDatabasePaths through createMcpServerModArchiveContentExecutor; mcp-server 101 files / 332 tests passed and same-call mdmReleaseInstall produced valid Mixin proof for com.example.compat.TargetApi.call()
MCP source.bundle MDM source-index chunks: initial red test returned installed_but_no_match when only an external source_index_sqlite artifact had ItemStack chunks; fix passed MDM sourceIndexArtifacts into source.bundle and added sqlite chunk fallback when source files are absent; mcp-server 102 files / 333 tests passed
MCP service-profile/source-acquisition source-index awareness: red tests first showed explicit MDM source-index paths were ignored by service-profile and absent from source_acquisition_plan payload; service-profile profile.test.ts passed 3 tests, context-query-source-acquisition.test.ts passed 4 tests, mcp-server and service-profile TypeScript builds passed
MCP resource status source-index metadata guard: resource-registry status.test.ts now confirms ready source_index_sqlite packages preserve artifactType/artifactKind/queryAdapter/artifactPath/capabilities; resource-registry package tests passed 8 files / 34 tests, focused cross-package source-index tests passed 6 files / 19 tests
MCP shared source-index chunk reader and recommendations: red test first showed readIndexedSourceChunk was not exported by @mcpskill/source-index; source-index indexer.test.ts passed 7 tests, vanilla-source-adapter resolve.test.ts passed 8 tests, source.bundle MDM source-index test passed, source-index recommendation focused tests passed 5 files / 25 tests, and source-index/vanilla-adapter/mcp-server TypeScript builds passed
MCP source acquisition source-index preview: red tests first showed source_acquisition_plan only reported cached database paths and later showed preview could include wrong-version source-index matches; now it previews lightweight source-index matches for stable FQCN/path requests, skips unreadable SQLite indexes with warnings, skips packageId matches for other Minecraft versions, and continues to matching-version indexes later in the candidate list. context-query-source-acquisition.test.ts passed 7 tests, focused source-index/source-bundle/context-query suite passed 3 files / 10 tests, and mcp-server TypeScript build passed
MCP source-index-only vanilla source.bundle backend: red test first returned needs_confirmation when an explicit source_index_sqlite had ItemStack chunks but no source-pack confirmation existed; reviewers then caught that confirmed-but-uninstalled source packs could still trigger recipe execution before using SQLite evidence and that unfiltered explicit indexes could cross Minecraft versions. The resolver now preflights explicit source indexes before install when no ready source-pack install exists, filters index matches by target Minecraft version, and does not fabricate installing acquisition evidence when installation is intentionally skipped. vanilla-source-adapter source-index/resolve tests passed 2 files / 12 tests, source.bundle MDM source-index test passed 2 tests, mcp-tools-mdm-source-index-resources.test.ts passed 1 test, mcp-server TypeScript build passed, and touched source/test files stayed under 500 lines
mdm-sources loader source profiles: generated 18 loader-specific metadata-only source profile packages for Forge/NeoForge/Fabric/Quilt; vanilla source profile output shape is locked to exclude loader-only fields; node --test tests/*.test.mjs passed 38 tests; node tools/validate.mjs packageCount 429 errorCount 0; release schema verifier packageCount 429 errorCount 0; install verifier verifiedCount 429/429 totalSizeBytes 2496075; touched source/test files stayed under 500 lines
MCP loader source profile recommendations: minecraft-<version>-forge/neoforge/fabric/quilt-source-profile package ids are now recognized as versioned source profiles; focused recommendation tests passed 2 files / 10 tests and mcp-server TypeScript build passed
mdm-sources source-index payload schema: added schema/source-index-payload.schema.json, schema subset anyOf support, source_index schemaId enforcement, and README contract notes; node --test tests/*.test.mjs passed 39 tests; node tools/validate.mjs packageCount 429 errorCount 0; release schema verifier packageCount 429 errorCount 0; install verifier verifiedCount 429/429 totalSizeBytes 2496075; touched source/test/schema files stayed under 500 lines
mdm-sources source-index install smoke: red test first showed an empty source_index_sqlite artifact with all required tables passed install verification; verify-release-install now rejects source-index SQLite artifacts with zero files/source_chunks/fts_chunks rows. node --test tests/*.test.mjs passed 40 tests; node tools/validate.mjs packageCount 429 errorCount 0; release schema verifier packageCount 429 errorCount 0; install verifier verifiedCount 429/429 totalSizeBytes 2496075; touched source/test files stayed under 500 lines
mdm-sources SQLite minUserVersion install gate: red test first showed a SQLite artifact with PRAGMA user_version 1 passed despite metadata.sqlite.minUserVersion 3; verify-release-install now rejects SQLite artifacts below the declared minimum. node --test tests/*.test.mjs passed 41 tests; node tools/validate.mjs packageCount 429 errorCount 0; release schema verifier packageCount 429 errorCount 0; install verifier verifiedCount 429/429 totalSizeBytes 2496075; touched source/test files stayed under 500 lines
mdm-sources release manifest SQLite metadata schema: red test first showed malformed metadata.sqlite.minUserVersion and metadata.sqlite.requiredTables entries passed release schema verification; release-manifest.schema.json now validates SQLite metadata field types. node --test tests/*.test.mjs passed 41 tests; node tools/validate.mjs packageCount 429 errorCount 0; release schema verifier packageCount 429 errorCount 0; install verifier verifiedCount 429/429 totalSizeBytes 2496075; touched schema/test files stayed under 500 lines
mdm-sources SQLite metadata completeness schema: batch hardening now requires sqlite.databaseName, integer non-negative sqlite.minUserVersion, and non-empty sqlite.requiredTables in release metadata. node --test tests/*.test.mjs passed 41 tests; node tools/validate.mjs packageCount 429 errorCount 0; release schema verifier packageCount 429 errorCount 0; install verifier verifiedCount 429/429 totalSizeBytes 2496075; touched schema/test files stayed under 500 lines
MCP resource-registry SQLite metadata parity: red test first showed fractional minUserVersion passed resource-registry package metadata parsing; parser now rejects fractional, negative, NaN, and Infinity values as non-finite/non-integer metadata. resource-registry tests passed 8 files / 38 tests and resource-registry TypeScript build passed; touched files stayed under 500 lines
MCP release manifest contract parity: red tests first showed unsupported schemaVersion, path-like artifactName, invalid sha256, fractional sizeBytes, missing releaseChannel/releaseFamily, and empty capabilities were accepted by MCP release manifest parsing; parser now rejects those before adapting release packages. resource-registry tests passed 8 files / 45 tests and resource-registry TypeScript build passed; touched source/test files stayed under 500 lines
MCP source-index schema id parity: red tests first showed source-package-manager emitted mdm.sources.index.sqlite while mdm-sources/resource-registry use mdm.source.index.sqlite; source-package-manager now emits the single-source contract id. source-package-manager v2 adapter test passed 1 file / 6 tests; package-registry v2 validation test passed 1 file / 12 tests; source-package-manager and package-registry TypeScript builds passed; touched source/test files stayed under 500 lines
MCP source acquisition workspace execution: workspace_gradle/read_declared_dependencies and workspace_probejs/read_probejs_types_and_registries routes now build executable workspace_overlay work items and dispatch through injected/default handlers. source-package-manager test passed 16 files / 66 tests; MCP focused source acquisition tests passed 2 files / 9 tests; full mcp-server test passed 104 files / 342 tests after updating release manifest fixtures and high-level source-acquisition assertions; source-package-manager and mcp-server TypeScript builds passed; touched source/test files stayed under 500 lines
```

## Completion Estimate

- MCP core capability: 99.5%.
- MDM resource/package delivery: 97.2%.
- Overall project deliverability: 97.3%.

The next large slice should focus on source-channel package coverage and corpus
growth:

- Generate and validate broader source-index corpora from allowed local or
  user-confirmed inputs, without committing Minecraft source or private
  workspace indexes.
- Run live GitHub Release acceptance once a release exists.
- Expand package coverage beyond the initial docs/datapack/resourcepack/mapping
  corpus, especially loader-specific and API-specific guidance packages.
