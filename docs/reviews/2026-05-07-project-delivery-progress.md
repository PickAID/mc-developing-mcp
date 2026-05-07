# Project Delivery Progress

Date: 2026-05-07
Author: m1hono

## Summary

The project is no longer in a shell-only stage. The MCP side has a working
single-tool `mc_develop` path with workspace detection, Gradle/JAR/ProbeJS/LSP
evidence, datapack/resourcepack evidence, MDM resource install/status, SQLite
docs lookup, and conservative source acquisition handlers.

The remaining delivery gap is now concentrated in live release distribution,
broader package corpus coverage, loader-specific variants, real mapping table
providers, and final UX polish.

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
- Datapack and resourcepack support are separate package families and separate
  evidence profiles.
- Resourcepack/client-visual support covers assets, models, blockstates,
  textures, atlases, language, sounds, UI assets, shader-related paths, and
  resource reference tracing at compact evidence level.
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
- Release builder cleans stale output before writing `release-out`.
- Release workflow builds with `--no-registry-update` so CI publishing does not
  rewrite tracked registry metadata.
- Release workflow uploads only artifacts listed in `mdm-release-manifest.json`,
  not arbitrary stale `release-out/*` files.
- Public `sources` channel coverage is now generated from the release catalog's
  official release list. Current catalog coverage is 101 vanilla source profile
  packages, including older releases such as 1.14.4 and 1.12.2 plus current
  26.1.x releases. These are profile/guidance artifacts only and do not bundle
  Minecraft source.
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

Not done:

- Live published GitHub Release acceptance run.
- Signing/provenance/retention policy.
- Large public docs corpus.
- Loader-specific and mapping-specific source profile variants beyond vanilla.
- Real Yarn/Parchment/Mojmap mapping table download/generation providers beyond
  the runtime-private mapping index adapter and public metadata profiles.
- Loader-specific source/data/resource profile variants beyond vanilla.

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
mdm-sources node --test tests/*.test.mjs: 24 passed
mdm-sources node tools/validate.mjs: packageCount 411, errorCount 0
mdm-sources build --no-registry-update: cleaned stale output and did not mutate registry
mdm-sources SQLite artifact: userVersion 3, docs_entries 5, docs_entries_fts 5
mdm-sources sources profile: packageCount 115, sources artifacts 101, sync tools tested, full tests 24 passed
mdm-sources datapack profiles: generated packages 101, release artifacts 101, first minecraft-1.0-vanilla-datapack-profile, last minecraft-26.1-vanilla-datapack-profile
mdm-sources resourcepack profiles: generated packages 101, release artifacts 101, first minecraft-1.0-vanilla-resourcepack-profile, last minecraft-26.1-vanilla-resourcepack-profile
mdm-sources mapping profiles: generated packages 101, release artifacts 101, first minecraft-1.0-yarn-mapping-profile, last minecraft-26.1.2-yarn-mapping-profile
MCP real mdm-sources release consumption: installed and searched core-docs-search-sqlite
MCP stdio real release consumption: installed and searched core-docs-search-sqlite through JSON-RPC
MCP remote URL acceptance: installed real SQLite bytes through GitHub Release shaped manifest/artifact URLs
MCP MDM package recommendations: KubeJS/datapack task produced safe install hints without auto-download
MCP versioned profile recommendations: source/datapack/resourcepack/mapping tasks selected requested Minecraft versions
MCP runtime mapping index adapter: source-package-manager 16 files / 65 tests passed
MCP runtime mapping index adapter: mcp-server 95 files / 302 tests passed
MCP runtime mapping index cache hardening: unsafe version segment rejected, corrupt JSONL rebuilt, EISDIR read error propagated
```

## Completion Estimate

- MCP core capability: 95%.
- MDM resource/package delivery: 83-86%.
- Overall project deliverability: 85-88%.

The next large slice should focus on source-channel package coverage and corpus
growth:

- Run live GitHub Release acceptance once a release exists.
- Add real Yarn/Parchment/Mojmap mapping providers behind the existing
  runtime-private mapping index adapter, without committing generated mapping
  tables to public repositories.
- Expand package coverage beyond the initial docs/datapack/resourcepack/mapping
  corpus, especially KubeJS, client visual, loader-specific, and API-specific
  guidance packages.
