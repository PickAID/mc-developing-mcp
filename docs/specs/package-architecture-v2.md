# Package Architecture v2 Spec

## Status

Current status: design corrective spec. The existing package/database/cache layer is useful as a prototype, but it is not mature enough to treat `mdm-resource` as deliverable.

This spec covers both sides of the system:

- MCP local package/query substrate in `SKillUpdate`.
- Public curated resource repository in sibling `mdm-sources`.

## Problem Statement

The current implementation has multiple partial concepts:

- `resource-registry` can read a small MDM release manifest and classify packages.
- `source-package-manager` can install source packages and create local `source-index.sqlite`.
- `source-index` can build SQLite-backed source lookup and symbol evidence.
- `docs-retrieval` can read JSON docs resources and SQLite docs artifacts.
- `mdm-sources` has a thin release skeleton with one `core-docs-required` package.

This is not yet a coherent package architecture. It works for specific tests and prototypes, but it does not define a stable contract for generated caches, source indexes, docs bundles, resource packs, embeddings, or private user-derived packages.

## Current Maturity Gaps

### Schema

- `storageKind` mixes format, origin, privacy, and lifecycle.
- `artifactType` is open-ended string taxonomy without capability semantics.
- `installTier` and `commitPolicy` are useful but not enough to describe generation, refresh, eviction, and privacy.
- There is no unified artifact contract shared by source packages, resource packages, docs packages, indexes, and future embedding bundles.
- Schema versioning exists as numbers in several places, but there is no compatibility policy or migration model.

### Local Cache and Privacy

- Public repository packages and local generated caches are represented too similarly.
- User-private ProbeJS output, modpack-derived indexes, and local runtime caches need first-class privacy classification.
- Cache eviction is not specified as part of the manifest contract.
- Derived artifacts do not consistently point back to authoritative source material.

### Query Architecture

- Query adapters are implicit in code paths rather than declared by package capabilities.
- SQLite, JSON, source tree, jar archive, and future embedding index readers have no shared adapter registry.
- There is no stable query budget model per package/capability.
- There is no formal fallback order between exact symbol lookup, FTS, resource path search, and semantic recall.

### mdm-sources Deliverability

The sibling `mdm-sources` repo is not yet deliverable:

- It has a small schema and one package example.
- It lacks real curated package families for datapack, resourcepack, KubeJS, mappings, client visual docs, and modding docs.
- It lacks version-family splits for Minecraft/loader targets.
- Its release artifacts are thin JSON examples, not production resource datasets.
- It has validation tooling, but not enough semantic validation for package capabilities and artifact contents.

### Delivery Gate

`mdm-resource` must be treated as non-deliverable until all of these are true:

- Public package manifests use v2 identity, target, artifact, capability, policy, and query facets.
- Public packages cannot express `user_private` or generated local cache policies.
- Release validation checks artifact existence, artifact schema ID, capability/query compatibility, and package privacy.
- At least one real docs package and one real datapack or resourcepack package ship useful payloads, not placeholder JSON.
- MCP can install a local release manifest and explain selected packages by declared capability.
- Local generated packages remain MCP-owned caches and are never committed to `mdm-sources`.

## Design Goals

- Make packages self-describing enough that MCP can decide how to query them without hardcoded assumptions.
- Keep public curated packages separate from local generated private caches.
- Keep authoritative source material separate from optional accelerators.
- Support SQLite, JSONL, source tree, archive content, and embedding bundles through the same manifest model.
- Allow embeddings later without making embeddings the default retrieval path.
- Keep generated large/private artifacts outside public repos and public npm packages.
- Make schema migration explicit and testable.

## Non-Goals

- Do not replace all existing registry code in one rewrite.
- Do not make embeddings mandatory.
- Do not publish generated vanilla source, private modpack ProbeJS dumps, or user-local indexes.
- Do not add many public MCP tools for package internals.

## v2 Package Model

Package v2 must be split into independent facets.

### Identity

```ts
interface PackageIdentityV2 {
  schemaVersion: 2;
  packageId: string;
  packageVersion: string;
  namespace: string;
  displayName: string;
  description: string;
}
```

### Target

```ts
interface PackageTargetV2 {
  minecraftVersions?: string[];
  loaders?: Array<"vanilla" | "forge" | "neoforge" | "fabric" | "quilt" | "kubejs">;
  mappings?: Array<"official" | "named" | "parchment" | "yarn" | "mojmap">;
  modIds?: string[];
  kubeJsScopes?: Array<"startup" | "server" | "client" | "probejs">;
}
```

### Artifact

```ts
type ArtifactKindV2 =
  | "docs_bundle"
  | "source_tree"
  | "source_index"
  | "datapack_bundle"
  | "resourcepack_bundle"
  | "probejs_snapshot"
  | "mod_archive_index"
  | "embedding_bundle";

type ArtifactFormatV2 =
  | "json"
  | "jsonl"
  | "sqlite"
  | "zip"
  | "directory"
  | "tar.zst";

interface ArtifactContractV2 {
  kind: ArtifactKindV2;
  format: ArtifactFormatV2;
  schemaId: string;
  schemaVersion: number;
  entrypoint: string;
  sha256?: string;
  sizeBytes?: number;
}
```

### Capabilities

Capabilities define how MCP can use the artifact.

```ts
type PackageCapabilityV2 =
  | "docs_search"
  | "docs_direct_read"
  | "source_lookup"
  | "source_chunk_search"
  | "java_symbol_lookup"
  | "kubejs_symbol_lookup"
  | "resource_location_lookup"
  | "datapack_trace"
  | "resourcepack_trace"
  | "mod_archive_owner_lookup"
  | "embedding_recall";
```

### Privacy and Lifecycle

```ts
type PackagePrivacyV2 =
  | "public_release"
  | "local_generated"
  | "user_private";

type PackageLifecycleV2 =
  | "downloadable"
  | "generated_on_demand"
  | "refreshable"
  | "evictable"
  | "pinned";

interface PackagePolicyV2 {
  privacy: PackagePrivacyV2;
  lifecycle: PackageLifecycleV2[];
  canCommitToRepository: boolean;
  canUploadToPublicRelease: boolean;
  requiresUserConsent: boolean;
}
```

### Query Adapter

```ts
type QueryAdapterV2 =
  | "json_docs"
  | "sqlite_docs"
  | "source_index_sqlite"
  | "source_tree"
  | "archive_content"
  | "embedding_index";

interface QueryContractV2 {
  adapter: QueryAdapterV2;
  capabilities: PackageCapabilityV2[];
  defaultLimit: number;
  maxLimit: number;
  preferredFallbacks: QueryAdapterV2[];
}
```

### Full Manifest

```ts
interface PackageManifestV2 {
  identity: PackageIdentityV2;
  target: PackageTargetV2;
  artifact: ArtifactContractV2;
  capabilities: PackageCapabilityV2[];
  policy: PackagePolicyV2;
  query: QueryContractV2;
  dependencies?: Array<{
    packageId: string;
    versionRange: string;
    reason: string;
  }>;
}
```

## Retrieval Order

The default retrieval order should be:

1. Workspace-local exact evidence: files, Gradle, LSP, ProbeJS, jars.
2. Installed source/package exact evidence: source index, resource paths, Java symbols.
3. Docs and SQLite/FTS evidence.
4. Optional embedding recall.
5. Agent rerank and bounded response assembly.

Embeddings must never replace authoritative evidence. They only help when exact lookup has weak recall or the user query is conceptual.

## Embedding Bundle Rules

`embedding_bundle` is optional and must declare:

- Provider model identity.
- Source package IDs and content hashes used to create vectors.
- Chunking algorithm version.
- Vector dimension.
- Privacy level.
- Regeneration policy.

Embedding bundles derived from private modpacks must be `user_private` and must not be committed or uploaded.

## mdm-sources v2 Requirements

`mdm-sources` must evolve from skeleton to deliverable by adding:

- `packages/` families for docs, datapack, resourcepack, client visual, KubeJS, mappings, and distilled patterns.
- v2 package manifests with artifact/capability/policy/query facets.
- Validation that checks artifact presence, schema IDs, capability compatibility, and public/private policy.
- Release manifest that can publish package summaries without leaking private/generated payloads.
- At least one real curated package per required capability before claiming deliverability.

## Migration Strategy

Phase 1: Add v2 types and adapters without deleting v1.

Phase 2: Generate v2 manifest views from existing v1 packages.

Phase 3: Teach MCP package selection to consume v2 capabilities.

Phase 4: Migrate `mdm-sources` schema and release builder to v2.

Phase 5: Add optional embedding bundle contract and local generation only.

Phase 6: Only after v2 is stable, deprecate ambiguous v1 fields.

## Acceptance Criteria

- MCP can explain why a package is selected using declared capabilities.
- Public packages and user-private generated caches are impossible to confuse in schema.
- `mdm-sources` can validate at least one real docs package and one real resource/datapack package.
- Generated local caches can be evicted without deleting authoritative material.
- Embedding support can be added as an optional capability without changing core retrieval semantics.
