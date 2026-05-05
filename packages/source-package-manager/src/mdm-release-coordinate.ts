import type {
  SourcePackageArtifactType,
  SourcePackageCoordinate,
  SourcePackageNamespace,
  SourcePackageVariant
} from "@mcpskill/shared-types";

export interface MdmReleaseSourcePackageLike {
  packageId: string;
  namespace: string;
  artifactType: string;
  variant: string;
  version: string;
}

export interface MdmReleaseCoordinateOptions {
  minecraftVersion?: string;
}

const SOURCE_PACKAGE_ARTIFACT_TYPES = new Set<SourcePackageArtifactType>([
  "source-pack",
  "source-index",
  "datapack",
  "resource-pack",
  "assets",
  "docs/core",
  "docs/search",
  "docs/ui",
  "docs/rendering",
  "docs/shader",
  "docs/coremod",
  "distilled-patterns",
  "api-proof-index"
]);

const SOURCE_PACKAGE_VARIANTS = new Set<SourcePackageVariant>([
  "named",
  "official",
  "intermediary"
]);

export function resolveSourcePackageCoordinateFromMdmReleasePackage(
  releasePackage: MdmReleaseSourcePackageLike,
  options: MdmReleaseCoordinateOptions = {}
): SourcePackageCoordinate {
  if (!options.minecraftVersion) {
    throw new Error(
      "minecraftVersion is required for mdm release source package coordinates."
    );
  }

  const namespace = readSourcePackageNamespace(releasePackage.namespace);
  const artifactType = readSourcePackageArtifactType(releasePackage.artifactType);
  const variant = readSourcePackageVariant(releasePackage.variant);

  return {
    packageId: releasePackage.packageId,
    namespace,
    minecraftVersion: options.minecraftVersion,
    artifactType,
    variant
  };
}

function readSourcePackageArtifactType(value: string): SourcePackageArtifactType {
  if (SOURCE_PACKAGE_ARTIFACT_TYPES.has(value as SourcePackageArtifactType)) {
    return value as SourcePackageArtifactType;
  }

  throw new Error(`unsupported source package artifactType: ${value}`);
}

function readSourcePackageVariant(value: string): SourcePackageVariant {
  if (SOURCE_PACKAGE_VARIANTS.has(value as SourcePackageVariant)) {
    return value as SourcePackageVariant;
  }

  throw new Error(`unsupported source package variant: ${value}`);
}

function readSourcePackageNamespace(value: string): SourcePackageNamespace {
  if (
    value === "minecraft" ||
    value === "neoforge" ||
    value === "forge" ||
    value === "fabric" ||
    value === "quilt" ||
    /^mod\/[a-z0-9_.-]+$/i.test(value)
  ) {
    return value as SourcePackageNamespace;
  }

  throw new Error(`unsupported source package namespace: ${value}`);
}
