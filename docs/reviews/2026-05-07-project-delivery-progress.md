# Project Delivery Progress

Date: 2026-05-07
Author: m1hono

## Summary

The project is no longer in a shell-only stage. The MCP side has a working
single-tool `mc_develop` path with workspace detection, Gradle/JAR/ProbeJS/LSP
evidence, datapack/resourcepack evidence, MDM resource install/status, SQLite
docs lookup, and conservative source acquisition handlers.

The remaining delivery gap is now concentrated in resource package production,
real release distribution, broader package corpus coverage, and final UX polish.

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

Not done:

- Live published GitHub Release acceptance run.
- Signing/provenance/retention policy.
- Large public docs corpus.
- Full version coverage from 1.18.2 through the current target line.
- Source/mapping package corpus beyond initial profiles and runtime generation
  paths.

## Evidence

Recent verification records:

- `docs/reviews/2026-05-06-mdm-v2-install-smoke-report.md`
- `docs/reviews/2026-05-06-mdm-sqlite-docs-end-to-end-verification.md`
- `docs/reviews/2026-05-07-real-mdm-release-consumption-verification.md`
- `docs/reviews/2026-05-07-unified-source-acquisition-cache-verification.md`
- `docs/reviews/2026-05-07-source-acquisition-production-acceptance-verification.md`

Current fresh checks from this slice:

```text
mdm-sources node --test tests/*.test.mjs: 19 passed
mdm-sources node tools/validate.mjs: packageCount 14, errorCount 0
mdm-sources build --no-registry-update: cleaned stale output and did not mutate registry
mdm-sources SQLite artifact: userVersion 3, docs_entries 5, docs_entries_fts 5
MCP real mdm-sources release consumption: installed and searched core-docs-search-sqlite
MCP stdio real release consumption: installed and searched core-docs-search-sqlite through JSON-RPC
MCP remote URL acceptance: installed real SQLite bytes through GitHub Release shaped manifest/artifact URLs
```

## Completion Estimate

- MCP core capability: 93-95%.
- MDM resource/package delivery: 70-74%.
- Overall project deliverability: 76-80%.

The next large slice should focus on remote release acceptance and corpus growth:

- Run live GitHub Release acceptance once a release exists.
- Expand package coverage beyond the initial docs/datapack/resourcepack/mapping
  corpus.
