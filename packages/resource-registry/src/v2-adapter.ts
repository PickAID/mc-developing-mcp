import {
  parsePackageManifestV2,
  type ArtifactFormatV2,
  type ArtifactKindV2,
  type PackageCapabilityV2,
  type PackageLifecycleV2,
  type PackageManifestV2,
  type QueryAdapterV2
} from "@mcpskill/package-registry";

import type {
  MdmResourcePackageMetadata,
  MdmResourcePackageSummary,
  MdmResourceRelease
} from "./manifest.js";

export function toPackageManifestV2(
  summary: MdmResourcePackageSummary
): PackageManifestV2 {
  const metadata = resolveMetadata(summary);
  const isPrivate = metadata.storageKind === "generated_local_cache";
  const capabilities = resolveCapabilities(summary);
  const queryAdapter = resolveQueryAdapter(summary, metadata);
  const packageVersion = resolvePackageVersion(summary, isPrivate);
  const artifactKind = resolveArtifactKind(summary);
  const manifest = {
    identity: {
      schemaVersion: 2,
      packageId: summary.id,
      packageVersion,
      namespace: resolveNamespace(summary.id),
      displayName: humanizePackageId(summary.id),
      description: `v2 view of mdm resource package ${summary.id}`
    },
    target: resolveTarget(summary),
    artifact: {
      kind: artifactKind,
      format: resolveArtifactFormat(summary.format),
      schemaId: resolveSchemaId(queryAdapter, artifactKind),
      schemaVersion: 1,
      entrypoint: resolveEntrypoint(summary),
      sha256: summary.currentRelease?.sha256,
      sizeBytes: summary.currentRelease?.sizeBytes,
      provenance: isPrivate
        ? {
            sourceKind: "generated_local" as const,
            source: summary.detail.sourcePath
          }
        : undefined
    },
    capabilities,
    policy: {
      privacy: isPrivate ? "user_private" as const : "public_release" as const,
      lifecycle: resolveLifecycle(summary, metadata),
      canCommitToRepository: metadata.commitPolicy !== "private_generated_cache",
      canUploadToPublicRelease: !isPrivate,
      requiresUserConsent: isPrivate
    },
    query: {
      adapter: queryAdapter,
      capabilities,
      defaultLimit: 8,
      maxLimit: 50,
      preferredFallbacks: queryAdapter === "sqlite_docs" ? ["json_docs" as const] : []
    },
    release: isPrivate
      ? undefined
      : {
          channel: resolveReleaseChannel(summary, metadata),
          family: summary.releaseFamily ?? resolveNamespace(summary.id)
        }
  };

  return parsePackageManifestV2(manifest);
}

export function toPackageManifestsV2(
  packages: MdmResourcePackageSummary[]
): PackageManifestV2[] {
  return packages.map(toPackageManifestV2);
}

function resolveMetadata(
  summary: MdmResourcePackageSummary
): MdmResourcePackageMetadata {
  return summary.metadata ?? summary.detail.metadata ?? {
    storageKind: "remote_manifest",
    installTier: summary.required ? "required_docs" : "optional_dataset",
    commitPolicy: "repository_manifest"
  };
}

function resolveTarget(summary: MdmResourcePackageSummary): PackageManifestV2["target"] {
  if (summary.artifactKind === "source_index" || summary.queryAdapter === "source_index_sqlite") {
    return {
      mappings: ["official", "mojmap"]
    };
  }

  return {};
}

function resolveCapabilities(summary: MdmResourcePackageSummary): PackageCapabilityV2[] {
  if (summary.capabilities?.length) {
    return summary.capabilities;
  }
  if (summary.artifactKind === "source_index" || summary.queryAdapter === "source_index_sqlite") {
    return ["source_lookup", "source_chunk_search", "java_symbol_lookup"];
  }
  if (summary.releaseChannel === "mappings") {
    return ["mapping_lookup", "mapping_explain"];
  }
  if (summary.releaseChannel === "datapack") {
    return ["resource_location_lookup", "datapack_trace"];
  }
  if (summary.releaseChannel === "resourcepack") {
    return ["resource_location_lookup", "resourcepack_trace"];
  }

  return ["docs_search", "docs_direct_read"];
}

function resolveQueryAdapter(
  summary: MdmResourcePackageSummary,
  metadata: MdmResourcePackageMetadata
): QueryAdapterV2 {
  if (summary.queryAdapter === "source_index_sqlite") {
    return "source_index_sqlite";
  }
  if (summary.releaseChannel === "mappings") {
    return "mapping_index";
  }
  if (
    summary.releaseChannel === "datapack" ||
    summary.releaseChannel === "resourcepack"
  ) {
    return "archive_content";
  }
  if (metadata.storageKind === "sqlite_bundle" || summary.format === "sqlite") {
    return "sqlite_docs";
  }

  return "json_docs";
}

function resolveArtifactKind(summary: MdmResourcePackageSummary): ArtifactKindV2 {
  if (summary.artifactKind === "source_index") {
    return "source_index";
  }
  if (summary.releaseChannel === "mappings") {
    return "mapping_bundle";
  }
  if (summary.releaseChannel === "datapack") {
    return "datapack_bundle";
  }
  if (summary.releaseChannel === "resourcepack") {
    return "resourcepack_bundle";
  }

  return "docs_bundle";
}

function resolveArtifactFormat(format: string): ArtifactFormatV2 {
  if (format === "json" || format === "jsonl" || format === "sqlite") {
    return format;
  }

  throw new Error(`Unsupported mdm v1 resource format: ${format}`);
}

function resolveSchemaId(
  queryAdapter: QueryAdapterV2,
  artifactKind: ArtifactKindV2
): string {
  if (artifactKind === "mapping_bundle") {
    return "mdm.mapping.json";
  }
  if (artifactKind === "datapack_bundle") {
    return "mdm.datapack.json";
  }
  if (artifactKind === "resourcepack_bundle") {
    return "mdm.resourcepack.json";
  }
  if (artifactKind === "source_index") {
    return "mdm.source.index.sqlite";
  }

  return queryAdapter === "sqlite_docs" ? "mdm.docs.sqlite" : "mdm.docs.json";
}

function resolveEntrypoint(summary: MdmResourcePackageSummary): string {
  return summary.currentRelease?.artifactName ?? summary.detail.sourcePath;
}

function resolveLifecycle(
  summary: MdmResourcePackageSummary,
  metadata: MdmResourcePackageMetadata
): PackageLifecycleV2[] {
  if (metadata.storageKind === "generated_local_cache") {
    return ["generated_on_demand", "evictable"];
  }
  if (metadata.storageKind === "optional_accelerator") {
    return ["downloadable", "refreshable"];
  }
  if (summary.required) {
    return ["downloadable", "pinned"];
  }

  return ["downloadable"];
}

function resolveReleaseChannel(
  summary: MdmResourcePackageSummary,
  metadata: MdmResourcePackageMetadata
): NonNullable<PackageManifestV2["release"]>["channel"] {
  if (metadata.storageKind === "optional_accelerator") {
    return "accelerators";
  }
  if (summary.releaseChannel) {
    return summary.releaseChannel;
  }
  if (summary.required || metadata.installTier === "required_docs") {
    return "required";
  }

  return "docs";
}

function resolvePackageVersion(
  summary: MdmResourcePackageSummary,
  isPrivate: boolean
): string {
  if (summary.packageVersion) {
    return summary.packageVersion;
  }
  if (summary.detail.packageVersion) {
    return summary.detail.packageVersion;
  }

  const artifactName = summary.currentRelease?.artifactName;
  const prefix = `${summary.id}-`;
  if (artifactName?.startsWith(prefix)) {
    return artifactName.slice(prefix.length).replace(/\.mdm-resource\.json$/u, "");
  }
  if (isPrivate) {
    return "0.0.0";
  }

  throw new Error(`Cannot infer public mdm package version for ${summary.id}`);
}

function resolveNamespace(packageId: string): string {
  return packageId.split("-")[0] ?? "mdm";
}

function humanizePackageId(packageId: string): string {
  return packageId
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
