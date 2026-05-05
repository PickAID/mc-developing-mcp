export interface PackageIdentityV2 {
  schemaVersion: 2;
  packageId: string;
  packageVersion: string;
  namespace: string;
  displayName: string;
  description: string;
}

export interface PackageTargetV2 {
  minecraftVersions?: string[];
  loaders?: PackageLoaderV2[];
  mappings?: PackageMappingV2[];
  modIds?: string[];
  kubeJsScopes?: PackageKubeJsScopeV2[];
}

export type PackageLoaderV2 =
  | "vanilla"
  | "forge"
  | "neoforge"
  | "fabric"
  | "quilt"
  | "kubejs";

export type PackageMappingV2 =
  | "official"
  | "intermediary"
  | "named"
  | "parchment"
  | "yarn"
  | "mojmap";

export type PackageKubeJsScopeV2 =
  | "startup"
  | "server"
  | "client"
  | "probejs";

export type ArtifactKindV2 =
  | "docs_bundle"
  | "source_tree"
  | "source_index"
  | "mapping_bundle"
  | "datapack_bundle"
  | "resourcepack_bundle"
  | "probejs_snapshot"
  | "mod_archive_index"
  | "embedding_bundle";

export type ArtifactFormatV2 =
  | "json"
  | "jsonl"
  | "sqlite"
  | "zip"
  | "directory"
  | "tar.zst";

export interface ArtifactContractV2 {
  kind: ArtifactKindV2;
  format: ArtifactFormatV2;
  schemaId: string;
  schemaVersion: number;
  entrypoint: string;
  sha256?: string;
  sizeBytes?: number;
  provenance?: ArtifactProvenanceV2;
  embedding?: EmbeddingBundleContractV2;
}

export interface ArtifactProvenanceV2 {
  sourceKind: "public_release" | "workspace" | "generated_local" | "external_archive";
  source: string;
}

export interface EmbeddingBundleContractV2 {
  provider: string;
  model: string;
  vectorDimension: number;
  chunkingAlgorithmVersion: string;
  sourcePackages: EmbeddingSourcePackageV2[];
  regenerationPolicy: string;
}

export interface EmbeddingSourcePackageV2 {
  packageId: string;
  contentHash: string;
}

export type PackageCapabilityV2 =
  | "docs_search"
  | "docs_direct_read"
  | "source_lookup"
  | "source_chunk_search"
  | "java_symbol_lookup"
  | "kubejs_symbol_lookup"
  | "mapping_lookup"
  | "mapping_explain"
  | "resource_location_lookup"
  | "datapack_trace"
  | "resourcepack_trace"
  | "mod_archive_owner_lookup"
  | "embedding_recall";

export type PackagePrivacyV2 =
  | "public_release"
  | "local_generated"
  | "user_private";

export type PackageLifecycleV2 =
  | "downloadable"
  | "generated_on_demand"
  | "refreshable"
  | "evictable"
  | "pinned";

export interface PackagePolicyV2 {
  privacy: PackagePrivacyV2;
  lifecycle: PackageLifecycleV2[];
  canCommitToRepository: boolean;
  canUploadToPublicRelease: boolean;
  requiresUserConsent: boolean;
}

export type QueryAdapterV2 =
  | "json_docs"
  | "sqlite_docs"
  | "source_index_sqlite"
  | "source_tree"
  | "mapping_index"
  | "archive_content"
  | "embedding_index";

export interface QueryContractV2 {
  adapter: QueryAdapterV2;
  capabilities: PackageCapabilityV2[];
  defaultLimit: number;
  maxLimit: number;
  preferredFallbacks: QueryAdapterV2[];
}

export interface PackageDependencyV2 {
  packageId: string;
  versionRange: string;
  reason: string;
}

export interface PackageReleaseV2 {
  channel: "required" | "docs" | "sources" | "mappings" | "datapack" | "resourcepack" | "accelerators";
  family: string;
}

export interface PackageManifestV2 {
  identity: PackageIdentityV2;
  target: PackageTargetV2;
  artifact: ArtifactContractV2;
  capabilities: PackageCapabilityV2[];
  policy: PackagePolicyV2;
  query: QueryContractV2;
  release?: PackageReleaseV2;
  dependencies?: PackageDependencyV2[];
}
