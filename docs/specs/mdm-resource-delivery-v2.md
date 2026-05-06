# MDM Resource Delivery v2 Spec

## Status

Current status: install-smoke capable, not full product deliverable.

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
- `docs`: curated documentation bundles and future JSONL/SQLite search indexes.
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

## Current Evidence

Current smoke evidence is recorded in:

- `docs/reviews/2026-05-06-mdm-v2-install-smoke-report.md`

The verified path is:

1. Copy `mdm-sources` to a temporary repository.
2. Build a local release.
3. Read `mdm-release-manifest.json`.
4. Convert release summaries to v2 package manifests.
5. Cache `minecraft-1.20.1-vanilla-datapack-profile`.
6. Read `payload/datapack-profile.json` from the cached artifact.

## Non-Deliverable Areas

The system is not complete until these exist:

- Real docs search package, preferably JSONL first and SQLite later.
- KubeJS guidance package with ForgeEvents, NativeEvents, `global`, ProbeJS, and
  scope-specific rules.
- Client visual package covering UI, rendering, shader, model, atlas, animation,
  and resource-pack patterns in a useful depth.
- Version coverage beyond 1.20.1, at least from 1.18.2 through current target
  versions.
- MCP selection logic that chooses packages by workspace context and task intent.
