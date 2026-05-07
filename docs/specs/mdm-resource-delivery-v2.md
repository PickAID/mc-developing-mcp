# MDM Resource Delivery v2 Spec

## Status

Current status: install-smoke, SQLite docs E2E, generated vanilla
source/datapack/resourcepack/mapping profile channels, and opt-in Yarn mapping
metadata acquisition are capable. It is not yet a full product deliverable
because live release acceptance, signing/provenance, loader variants, and larger
public corpus coverage are still pending.

The public `mdm-sources` repository now has schema validation and initial
curated package families. It is still an early package source, not a complete
offline documentation/data distribution.

## Delivery Model

`mdm-sources` is the public package source. It may contain only curated,
redistributable packages.

MCP local cache owns derived/private/generated packages. This includes vanilla
source generated from official manifests, remapped source trees, jar indexes,
ProbeJS snapshots, modpack-derived registries, and embeddings.

Runtime mapping indexes are also local/private generated cache. Public mapping
profiles may describe namespace policy and acquisition routes, but provider
output such as Yarn/Parchment/Mojmap lookup rows must be materialized under the
MCP runtime root and never committed into the workspace or public package
source.

Mapping providers must be opt-in or explicitly injected. The MCP may parse Tiny
v2 mapping text and `.zip`/`.jar` artifacts containing `.tiny` files, and it may
resolve Yarn build artifacts from Maven metadata when
`MCPSKILL_YARN_MAVEN_BASE_URL` is configured. It may also resolve Mojang
official mapping artifacts from a configured version manifest when
`MCPSKILL_MOJANG_VERSION_MANIFEST_URL` is configured. It may resolve Parchment
Maven artifacts when `MCPSKILL_PARCHMENT_MAVEN_BASE_URL` is configured. It must
not perform default remote mapping downloads unless a provider, URL template,
Maven base URL, Mojang manifest URL, or Parchment Maven base URL is configured
by the runtime environment.

The public repository is therefore a seed and profile repository, not a dump of
every useful artifact.

## Required Package Families

- `required`: minimal package policy, offline behavior, and resource status
  guidance.
- `docs`: curated documentation bundles plus JSONL/SQLite search indexes.
- `datapack`: versioned datapack profiles, registry families, function/tag/loot
  table/recipe/advancement structure, and pack-format guidance.
- `resourcepack`: versioned asset profiles, models, blockstates, item models,
  atlases, language, particles, sounds, UI assets, and shader-related paths.
- `kubejs`: public generic KubeJS guidance and ProbeJS interpretation rules,
  never private user-generated ProbeJS dumps.
- `mappings`: mapping namespace profiles and legal acquisition guidance for
  official, intermediary, named, Yarn, Parchment, and Mojmap.
- `client-visual`: UI, rendering, shader, model, texture, atlas, animation, and
  resource-pack design evidence distilled into generic standards.
- `accelerators`: optional search indexes or embeddings, never mandatory and
  never the only retrieval path.

## Public/Private Boundary

Allowed in `mdm-sources`:

- Public JSON, JSONL, SQLite, or zipped curated profiles.
- Public source acquisition profiles that describe local generation and cache
  policy without bundling source code.
- Legal mapping explanations and acquisition instructions.
- Small reproducible package manifests and schema records.
- Generic MCP guidance that does not reveal private modpack content.

Forbidden in `mdm-sources`:

- Minecraft source code or remapped Minecraft source trees.
- User modpack ProbeJS dumps.
- Local Gradle, LSP, jar, or crash-derived indexes.
- Private mod inventories, recipes, registries, or snippets extracted from a
  user's instance.
- Generated embeddings over user-private content.

## Source and Mapping Split Rules

Source packages must be split by:

- Minecraft version.
- Loader: vanilla, Forge, NeoForge, Fabric, Quilt, or KubeJS.
- Mapping namespace: official, intermediary, named, Yarn, Parchment, Mojmap.
- Artifact form: source tree, source index, mapping bundle, jar archive index.

Mapping bundles do not replace source packages. They explain symbol names and
guide translation between namespaces without requiring the agent to download or
generate every source tree first.

When MCP sees a stack trace, jar class, Gradle dependency, or source path, it
must report both observed namespace evidence and mapped/explained namespace
evidence when available.

## Release Channels

Releases must be split by channel:

- `required`
- `docs`
- `sources`
- `mappings`
- `datapack`
- `resourcepack`
- `accelerators`

The builder must support selecting only the channels needed for a workspace.
Agents should not install monolithic all-channel releases by default.

The default install policy is:

- Always allow `required`.
- Install `datapack` only for datapack/resource registry tasks.
- Install `resourcepack` only for asset/client visual tasks.
- Install `mappings` only for source, stack trace, migration, or remapping tasks.
- Install `accelerators` only with explicit user consent.

## Validation Gate

A package cannot be considered release-ready unless:

- v2 schema validation passes.
- Public policy is `public_release`.
- Query capabilities are a subset of package capabilities.
- Artifact entrypoint exists.
- Release channel and family are declared.
- The artifact can be built by `tools/build-local-release.mjs`.
- MCP can read the release manifest and convert packages into v2 manifests.
- MCP can cache at least one selected artifact and read its payload.
- MCP can recommend relevant packages from task intent without downloading them.
- MCP can preserve package release channel, family, and capability metadata
  through local registry status so recommendations do not depend only on package
  id strings.
- Generated public profile payloads must state whether they bundle exact content
  or only describe runtime-local acquisition/resolution. Vanilla source,
  datapack, resourcepack, and mapping generated profiles must remain
  metadata-only.

## Current Evidence

Current smoke evidence is recorded in:

- `docs/reviews/2026-05-06-mdm-v2-install-smoke-report.md`
- `docs/reviews/2026-05-06-mdm-sqlite-docs-end-to-end-verification.md`
- `docs/reviews/2026-05-07-real-mdm-release-consumption-verification.md`
- `docs/reviews/2026-05-07-mdm-package-recommendations-verification.md`
- `docs/reviews/2026-05-07-mdm-source-profile-recommendation-verification.md`
- `docs/reviews/2026-05-07-source-acquisition-production-acceptance-verification.md`

Additional producer-side evidence:

- `mdm-sources/reports/2026-05-07-sources-profile-verification.md`

The verified path is:

1. Copy `mdm-sources` to a temporary repository.
2. Build a local release.
3. Read `mdm-release-manifest.json`.
4. Convert release summaries to v2 package manifests.
5. Cache `minecraft-1.20.1-vanilla-datapack-profile`.
6. Read `payload/datapack-profile.json` from the cached artifact.
7. Install a SQLite docs release artifact through `mc_develop`.
8. Verify `mdmResources.summary.counts.ready` and `docs_lookup` hits with
   `source: "sqlite"`.
9. Consume the same real SQLite artifact through a GitHub Release shaped remote
   `manifestUrl` using injected fetchers.
10. Verify sibling artifact URL resolution, checksum-verified cache install, and
    SQLite docs lookup.
11. Recommend KubeJS and datapack packages from task intent with
    confirmation-safe install hints.
12. Generate public `sources` channel profiles from the release catalog's
    official `releases[]` list. This must cover every cataloged official
    release, including older releases such as 1.14.4 and 1.12.2 plus current
    26.1.x releases. These profiles point to local generation and
    runtime-private cache ownership without bundling Minecraft source.
13. Generate `registry/index.json` and `registry/packages/*.json` from package
    manifests while preserving existing release metadata.
14. Provide a single producer-side sync entrypoint that runs source profile
    generation before registry synchronization.
15. Recommend version-specific MDM profiles from `mc_develop` for source
    lookup, mapping-migration, datapack, and resourcepack requests without
    auto-installing or generating private artifacts. Request text versions take
    priority; otherwise MCP uses detected workspace runtime version evidence.
16. Generate public `datapack` channel profiles from the official `releases[]`
    list. Current producer verification generates 101 packages and 101 local
    release artifacts, from `minecraft-1.0-vanilla-datapack-profile` through
    `minecraft-26.1-vanilla-datapack-profile`.
17. Generate public `resourcepack` channel profiles from the official
    `releases[]` list. Current producer verification generates 101 packages and
    101 local release artifacts, from
    `minecraft-1.0-vanilla-resourcepack-profile` through
    `minecraft-26.1-vanilla-resourcepack-profile`.
18. Datapack/resourcepack payloads must include `schemaVersion`, `profileKind`,
    `generatedFrom`, `target`, `packMcmeta.packFormatSource:
    "runtime_resolved"`, roots, trace rules, distribution policy, licensing
    notes, and runtime cache ownership. Exact pack formats and generated archive
    indexes are resolved from local jars/version metadata by MCP runtime, not
    hard-coded as public corpus truth.
19. Generate public `mappings` channel profiles from the official `releases[]`
    list. Current producer verification generates 101 packages and 101 local
    release artifacts, from `minecraft-1.0-yarn-mapping-profile` through
    `minecraft-26.1.2-yarn-mapping-profile`.
20. Mapping profile payloads must include `schemaVersion`, `profileKind`,
    `generatedFrom`, namespace graph, lookup policy, upstream licensing notes,
    and runtime cache ownership. They must set `bundlesGeneratedMappings:
    false`, `bundlesRemappedSource: false`, and `localGenerationOnly: true`.
21. MCP may append a `mapping_index` source acquisition work item when request
    text has mapping/remap/obfuscation intent and a Minecraft version is known.
    This work item must use `cacheScope: "private_runtime"`, reject unsafe path
    segments, validate cached JSONL headers/entries, rebuild corrupt JSONL only
    through an explicit provider, and propagate non-`ENOENT` filesystem read
    errors.
22. Current MCP implementation can materialize provider-supplied mapping entries
    into runtime JSONL and parse Tiny v2 mapping text or zip/jar artifacts. Yarn
    Tiny v2 download can be enabled with `MCPSKILL_YARN_MAPPING_URL_TEMPLATE`;
    Yarn Maven metadata resolution can be enabled with
    `MCPSKILL_YARN_MAVEN_BASE_URL`. The Maven resolver reads Fabric-style
    `net/fabricmc/yarn/maven-metadata.xml`, selects the highest matching
    `${minecraftVersion}+build.N` version, fetches the corresponding
    `yarn-...-v2.jar`, and writes only runtime-private mapping indexes.
    Metadata misses are provider-unavailable results and must not be cached as
    ready empty indexes.
23. Mojmap acquisition can be enabled with
    `MCPSKILL_MOJANG_VERSION_MANIFEST_URL`. The resolver follows the configured
    Mojang version manifest to the requested version JSON, fetches optional
    `client_mappings` and `server_mappings` artifacts when present, parses
    ProGuard text into `official -> mojmap` mapping entries, and writes only
    runtime-private mapping indexes. Missing versions or missing mapping
    artifacts are provider-unavailable results and must not be cached as ready
    empty indexes.
24. Parchment acquisition can be enabled with
    `MCPSKILL_PARCHMENT_MAVEN_BASE_URL`. The resolver reads
    `org.parchmentmc.data:parchment-<minecraftVersion>` Maven metadata, selects
    a release artifact, fetches the zip, parses `parchment.json`, and writes
    runtime-private `mojmap -> parchment` enrichment entries. Parchment entries
    preserve javadocs and parameter metadata; they are enrichment over Mojmap
    names, not an obfuscated rename table. Missing release metadata is
    provider-unavailable and must not be cached as a ready empty index.

The sibling `mdm-sources` release builder now also supports real `.sqlite`
artifacts, SQLite package metadata, output directory cleanup, and
`--no-registry-update` CI builds that do not mutate tracked registry metadata.

Latest producer-side verification for this slice:

```text
mdm-sources node --test tests/*.test.mjs: 24 passed
mdm-sources node tools/validate.mjs: packageCount 411, errorCount 0
mdm-sources datapack release build: packages 101, first minecraft-1.0-vanilla-datapack-profile, last minecraft-26.1-vanilla-datapack-profile
mdm-sources resourcepack release build: packages 101, first minecraft-1.0-vanilla-resourcepack-profile, last minecraft-26.1-vanilla-resourcepack-profile
mdm-sources mappings release build: packages 101, first minecraft-1.0-yarn-mapping-profile, last minecraft-26.1.2-yarn-mapping-profile
mdm-sources file size guard: no source/test tool file exceeds 500 lines
MCP mapping index work item runner: source-package-manager 16 files, 65 tests passed
MCP runtime mapping index adapter, Tiny v2 provider, Yarn Maven resolver, Mojmap manifest resolver, and Parchment Maven resolver: mcp-server 100 files, 328 tests passed in focused acceptance run
```

## Non-Deliverable Areas

The system is not complete until these exist:

- Larger docs search corpus beyond the initial JSONL/SQLite package.
- Deeper KubeJS guidance package coverage for ForgeEvents, NativeEvents,
  `global`, ProbeJS, and scope-specific rules.
- Deeper client visual package coverage for UI, rendering, shader, model, atlas,
  animation, and resource-pack patterns.
- Loader and mapping-specific source/data/resource profile variants beyond the
  generated vanilla profiles.
- Deeper MCP selection logic that uses package profile payloads, workspace
  version, and loader evidence beyond the current conservative text-signal
  selector.
- Live GitHub Release acceptance run.
- GitHub Release provenance/signing and retention policy.
