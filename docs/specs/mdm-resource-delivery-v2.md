# MDM Resource Delivery v2 Spec

## Status

Current status: install-smoke and SQLite docs E2E capable, not full product
deliverable.

The public `mdm-sources` repository now has schema validation and initial
curated package families. It is still an early package source, not a complete
offline documentation/data distribution.

## Delivery Model

`mdm-sources` is the public package source. It may contain only curated,
redistributable packages.

MCP local cache owns derived/private/generated packages. This includes vanilla
source generated from official manifests, remapped source trees, jar indexes,
ProbeJS snapshots, modpack-derived registries, and embeddings.

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
12. Build a public `sources` channel profile for Minecraft 1.20.1 that points
    to local generation and runtime-private cache ownership without bundling
    Minecraft source.
13. Recommend that source profile from `mc_develop` for source lookup and
    mapping-migration requests without auto-installing or generating source.

The sibling `mdm-sources` release builder now also supports real `.sqlite`
artifacts, SQLite package metadata, output directory cleanup, and
`--no-registry-update` CI builds that do not mutate tracked registry metadata.

## Non-Deliverable Areas

The system is not complete until these exist:

- Larger docs search corpus beyond the initial JSONL/SQLite package.
- Deeper KubeJS guidance package coverage for ForgeEvents, NativeEvents,
  `global`, ProbeJS, and scope-specific rules.
- Deeper client visual package coverage for UI, rendering, shader, model, atlas,
  animation, and resource-pack patterns.
- Public `sources` channel profile coverage beyond the first Minecraft 1.20.1
  vanilla source acquisition profile.
- Version coverage beyond 1.20.1, at least from 1.18.2 through current target
  versions.
- Deeper MCP selection logic that uses package profile payloads, workspace
  version, and loader evidence beyond the current conservative text-signal
  selector.
- Live GitHub Release acceptance run.
- GitHub Release provenance/signing and retention policy.
