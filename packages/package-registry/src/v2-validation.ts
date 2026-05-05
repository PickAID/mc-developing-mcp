import type {
  ArtifactFormatV2,
  ArtifactKindV2,
  PackageCapabilityV2,
  PackageLifecycleV2,
  PackageLoaderV2,
  PackageManifestV2,
  PackageMappingV2,
  PackagePrivacyV2,
  QueryAdapterV2
} from "./v2-types.js";

const ARTIFACT_KINDS = [
  "docs_bundle",
  "source_tree",
  "source_index",
  "mapping_bundle",
  "datapack_bundle",
  "resourcepack_bundle",
  "probejs_snapshot",
  "mod_archive_index",
  "embedding_bundle"
] as const satisfies readonly ArtifactKindV2[];

const ARTIFACT_FORMATS = [
  "json",
  "jsonl",
  "sqlite",
  "zip",
  "directory",
  "tar.zst"
] as const satisfies readonly ArtifactFormatV2[];

const CAPABILITIES = [
  "docs_search",
  "docs_direct_read",
  "source_lookup",
  "source_chunk_search",
  "java_symbol_lookup",
  "kubejs_symbol_lookup",
  "mapping_lookup",
  "mapping_explain",
  "resource_location_lookup",
  "datapack_trace",
  "resourcepack_trace",
  "mod_archive_owner_lookup",
  "embedding_recall"
] as const satisfies readonly PackageCapabilityV2[];

const LIFECYCLES = [
  "downloadable",
  "generated_on_demand",
  "refreshable",
  "evictable",
  "pinned"
] as const satisfies readonly PackageLifecycleV2[];

const LOADERS = [
  "vanilla",
  "forge",
  "neoforge",
  "fabric",
  "quilt",
  "kubejs"
] as const satisfies readonly PackageLoaderV2[];

const MAPPINGS = [
  "official",
  "intermediary",
  "named",
  "parchment",
  "yarn",
  "mojmap"
] as const satisfies readonly PackageMappingV2[];

const PRIVACY = [
  "public_release",
  "local_generated",
  "user_private"
] as const satisfies readonly PackagePrivacyV2[];

const QUERY_ADAPTERS = [
  "json_docs",
  "sqlite_docs",
  "source_index_sqlite",
  "source_tree",
  "mapping_index",
  "archive_content",
  "embedding_index"
] as const satisfies readonly QueryAdapterV2[];

const RELEASE_CHANNELS = [
  "required",
  "docs",
  "sources",
  "mappings",
  "datapack",
  "resourcepack",
  "accelerators"
] as const;

export function parsePackageManifestV2(input: unknown): PackageManifestV2 {
  const record = objectAt(input, "PackageManifestV2");
  const manifest: PackageManifestV2 = stripUndefined({
    identity: parseIdentity(record.identity),
    target: parseTarget(record.target),
    artifact: parseArtifact(record.artifact),
    capabilities: enumArrayAt(record.capabilities, CAPABILITIES, "capabilities"),
    policy: parsePolicy(record.policy),
    query: parseQuery(record.query),
    release: record.release === undefined ? undefined : parseRelease(record.release),
    dependencies:
      record.dependencies === undefined
        ? undefined
        : parseDependencies(record.dependencies)
  });

  validateManifest(manifest);
  return manifest;
}

function parseIdentity(input: unknown): PackageManifestV2["identity"] {
  const record = objectAt(input, "identity");
  return {
    schemaVersion: constAt(record.schemaVersion, 2, "identity.schemaVersion"),
    packageId: stringAt(record.packageId, "identity.packageId"),
    packageVersion: stringAt(record.packageVersion, "identity.packageVersion"),
    namespace: stringAt(record.namespace, "identity.namespace"),
    displayName: stringAt(record.displayName, "identity.displayName"),
    description: stringAt(record.description, "identity.description")
  };
}

function parseTarget(input: unknown): PackageManifestV2["target"] {
  const record = objectAt(input, "target");
  return stripUndefined({
    minecraftVersions: optionalStringArrayAt(record.minecraftVersions, "target.minecraftVersions"),
    loaders: optionalEnumArrayAt(record.loaders, LOADERS, "target.loaders"),
    mappings: optionalEnumArrayAt(record.mappings, MAPPINGS, "target.mappings"),
    modIds: optionalStringArrayAt(record.modIds, "target.modIds"),
    kubeJsScopes: optionalEnumArrayAt(
      record.kubeJsScopes,
      ["startup", "server", "client", "probejs"] as const,
      "target.kubeJsScopes"
    )
  });
}

function parseArtifact(input: unknown): PackageManifestV2["artifact"] {
  const record = objectAt(input, "artifact");
  return stripUndefined({
    kind: enumAt(record.kind, ARTIFACT_KINDS, "artifact.kind"),
    format: enumAt(record.format, ARTIFACT_FORMATS, "artifact.format"),
    schemaId: stringAt(record.schemaId, "artifact.schemaId"),
    schemaVersion: positiveIntegerAt(record.schemaVersion, "artifact.schemaVersion"),
    entrypoint: stringAt(record.entrypoint, "artifact.entrypoint"),
    sha256: optionalStringAt(record.sha256, "artifact.sha256"),
    sizeBytes: optionalPositiveIntegerAt(record.sizeBytes, "artifact.sizeBytes"),
    provenance:
      record.provenance === undefined ? undefined : parseProvenance(record.provenance),
    embedding:
      record.embedding === undefined ? undefined : parseEmbedding(record.embedding)
  });
}

function parseProvenance(input: unknown): PackageManifestV2["artifact"]["provenance"] {
  const record = objectAt(input, "artifact.provenance");
  return {
    sourceKind: enumAt(
      record.sourceKind,
      ["public_release", "workspace", "generated_local", "external_archive"] as const,
      "artifact.provenance.sourceKind"
    ),
    source: stringAt(record.source, "artifact.provenance.source")
  };
}

function parseEmbedding(input: unknown): NonNullable<PackageManifestV2["artifact"]["embedding"]> {
  const record = objectAt(input, "artifact.embedding");
  return {
    provider: stringAt(record.provider, "artifact.embedding.provider"),
    model: stringAt(record.model, "artifact.embedding.model"),
    vectorDimension: positiveIntegerAt(
      record.vectorDimension,
      "artifact.embedding.vectorDimension"
    ),
    chunkingAlgorithmVersion: stringAt(
      record.chunkingAlgorithmVersion,
      "artifact.embedding.chunkingAlgorithmVersion"
    ),
    sourcePackages: parseEmbeddingSources(record.sourcePackages),
    regenerationPolicy: stringAt(
      record.regenerationPolicy,
      "artifact.embedding.regenerationPolicy"
    )
  };
}

function parseEmbeddingSources(input: unknown): NonNullable<
  PackageManifestV2["artifact"]["embedding"]
>["sourcePackages"] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("artifact.embedding.sourcePackages: expected non-empty array");
  }
  return input.map((entry, index) => {
    const record = objectAt(entry, `artifact.embedding.sourcePackages[${index}]`);
    return {
      packageId: stringAt(
        record.packageId,
        `artifact.embedding.sourcePackages[${index}].packageId`
      ),
      contentHash: stringAt(
        record.contentHash,
        `artifact.embedding.sourcePackages[${index}].contentHash`
      )
    };
  });
}

function parsePolicy(input: unknown): PackageManifestV2["policy"] {
  const record = objectAt(input, "policy");
  return {
    privacy: enumAt(record.privacy, PRIVACY, "policy.privacy"),
    lifecycle: enumArrayAt(record.lifecycle, LIFECYCLES, "policy.lifecycle"),
    canCommitToRepository: booleanAt(record.canCommitToRepository, "policy.canCommitToRepository"),
    canUploadToPublicRelease: booleanAt(
      record.canUploadToPublicRelease,
      "policy.canUploadToPublicRelease"
    ),
    requiresUserConsent: booleanAt(record.requiresUserConsent, "policy.requiresUserConsent")
  };
}

function parseQuery(input: unknown): PackageManifestV2["query"] {
  const record = objectAt(input, "query");
  return {
    adapter: enumAt(record.adapter, QUERY_ADAPTERS, "query.adapter"),
    capabilities: enumArrayAt(record.capabilities, CAPABILITIES, "query.capabilities"),
    defaultLimit: positiveIntegerAt(record.defaultLimit, "query.defaultLimit"),
    maxLimit: positiveIntegerAt(record.maxLimit, "query.maxLimit"),
    preferredFallbacks: optionalEnumListAt(
      record.preferredFallbacks,
      QUERY_ADAPTERS,
      "query.preferredFallbacks"
    ) ?? []
  };
}

function parseRelease(input: unknown): NonNullable<PackageManifestV2["release"]> {
  const record = objectAt(input, "release");
  return {
    channel: enumAt(record.channel, RELEASE_CHANNELS, "release.channel"),
    family: stringAt(record.family, "release.family")
  };
}

function parseDependencies(input: unknown): NonNullable<PackageManifestV2["dependencies"]> {
  if (!Array.isArray(input)) {
    throw new Error("dependencies: expected array");
  }
  return input.map((entry, index) => {
    const record = objectAt(entry, `dependencies[${index}]`);
    return {
      packageId: stringAt(record.packageId, `dependencies[${index}].packageId`),
      versionRange: stringAt(record.versionRange, `dependencies[${index}].versionRange`),
      reason: stringAt(record.reason, `dependencies[${index}].reason`)
    };
  });
}

function validateManifest(manifest: PackageManifestV2): void {
  const { artifact, capabilities, policy, query, target } = manifest;
  if (policy.privacy === "user_private" || policy.privacy === "local_generated") {
    if (policy.canCommitToRepository || policy.canUploadToPublicRelease) {
      throw new Error("private or generated packages cannot be committed or uploaded");
    }
    if (artifact.provenance === undefined) {
      throw new Error("private or generated packages must declare artifact.provenance");
    }
  }
  if (policy.privacy === "public_release" && manifest.release === undefined) {
    throw new Error("public_release packages must declare release channel metadata");
  }
  if (
    policy.privacy === "public_release" &&
    policy.lifecycle.length === 1 &&
    policy.lifecycle[0] === "generated_on_demand"
  ) {
    throw new Error("public_release packages cannot be only generated_on_demand");
  }
  for (const capability of query.capabilities) {
    if (!capabilities.includes(capability)) {
      throw new Error(`query capability ${capability} is not declared by package`);
    }
  }
  if (query.defaultLimit > query.maxLimit) {
    throw new Error("query.defaultLimit must be less than or equal to query.maxLimit");
  }
  if (artifact.kind === "embedding_bundle") {
    if (artifact.embedding === undefined) {
      throw new Error("embedding_bundle packages must declare artifact.embedding metadata");
    }
    if (query.adapter !== "embedding_index") {
      throw new Error("embedding_bundle packages must use embedding_index query adapter");
    }
    if (!query.preferredFallbacks.some((fallback) => fallback !== "embedding_index")) {
      throw new Error("embedding bundles must declare authoritative preferred fallbacks");
    }
  } else if (artifact.embedding !== undefined) {
    throw new Error("artifact.embedding metadata is only valid for embedding_bundle");
  }
  if (isSourceArtifact(artifact.kind) && target.mappings === undefined) {
    throw new Error("source packages must declare target.mappings");
  }
  if (artifact.kind === "mapping_bundle") {
    if (!capabilities.includes("mapping_lookup")) {
      throw new Error("mapping_bundle packages must declare mapping_lookup capability");
    }
    if (query.adapter !== "mapping_index" || !query.capabilities.includes("mapping_lookup")) {
      throw new Error("mapping_bundle packages must expose mapping_lookup via mapping_index");
    }
  }
}

function isSourceArtifact(kind: ArtifactKindV2): boolean {
  return kind === "source_tree" || kind === "source_index";
}

function objectAt(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`${path}: expected object`);
  }
  return input as Record<string, unknown>;
}

function stringAt(input: unknown, path: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new Error(`${path}: expected non-empty string`);
  }
  return input;
}

function optionalStringAt(input: unknown, path: string): string | undefined {
  return input === undefined ? undefined : stringAt(input, path);
}

function booleanAt(input: unknown, path: string): boolean {
  if (typeof input !== "boolean") {
    throw new Error(`${path}: expected boolean`);
  }
  return input;
}

function constAt<TValue>(input: unknown, expected: TValue, path: string): TValue {
  if (input !== expected) {
    throw new Error(`${path}: expected ${String(expected)}`);
  }
  return expected;
}

function positiveIntegerAt(input: unknown, path: string): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 1) {
    throw new Error(`${path}: expected positive integer`);
  }
  return input;
}

function optionalPositiveIntegerAt(input: unknown, path: string): number | undefined {
  return input === undefined ? undefined : positiveIntegerAt(input, path);
}

function optionalStringArrayAt(input: unknown, path: string): string[] | undefined {
  return input === undefined ? undefined : stringArrayAt(input, path);
}

function stringArrayAt(input: unknown, path: string): string[] {
  if (!Array.isArray(input)) {
    throw new Error(`${path}: expected array`);
  }
  return input.map((item, index) => stringAt(item, `${path}[${index}]`));
}

function optionalEnumArrayAt<TValue extends string>(
  input: unknown,
  allowedValues: readonly TValue[],
  path: string
): TValue[] | undefined {
  return input === undefined ? undefined : enumArrayAt(input, allowedValues, path);
}

function optionalEnumListAt<TValue extends string>(
  input: unknown,
  allowedValues: readonly TValue[],
  path: string
): TValue[] | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (!Array.isArray(input)) {
    throw new Error(`${path}: expected array`);
  }
  return input.map((item, index) => enumAt(item, allowedValues, `${path}[${index}]`));
}

function enumArrayAt<TValue extends string>(
  input: unknown,
  allowedValues: readonly TValue[],
  path: string
): TValue[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error(`${path}: expected non-empty array`);
  }
  return input.map((item, index) => enumAt(item, allowedValues, `${path}[${index}]`));
}

function enumAt<TValue extends string>(
  input: unknown,
  allowedValues: readonly TValue[],
  path: string
): TValue {
  if (typeof input !== "string" || !allowedValues.includes(input as TValue)) {
    throw new Error(`${path}: expected one of ${allowedValues.join(", ")}`);
  }
  return input as TValue;
}

function stripUndefined<TObject extends Record<string, unknown>>(object: TObject): TObject {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined)
  ) as TObject;
}
