import type {
  PackageCapabilityV2,
  PackageReleaseV2
} from "@mcpskill/package-registry";

export interface MdmResourceRelease {
  artifactName: string;
  sha256: string;
  sizeBytes?: number;
  builtAt?: string;
}

export type MdmResourcePackageStorageKind =
  | "sqlite_bundle"
  | "generated_local_cache"
  | "remote_manifest"
  | "optional_accelerator";

export type MdmResourcePackageInstallTier =
  | "required_docs"
  | "optional_dataset"
  | "runtime_or_optional_dataset"
  | "optional_accelerator"
  | "private_local_cache";

export type MdmResourcePackageCommitPolicy =
  | "repository_manifest"
  | "private_generated_cache";

export interface MdmSqliteArtifactValidation {
  databaseName?: string;
  minUserVersion?: number;
  requiredTables?: string[];
}

export interface MdmResourcePackageMetadata {
  storageKind: MdmResourcePackageStorageKind;
  installTier: MdmResourcePackageInstallTier;
  commitPolicy: MdmResourcePackageCommitPolicy;
  sqlite?: MdmSqliteArtifactValidation;
}

export interface MdmResourcePackageDetail {
  schemaVersion: number;
  id: string;
  packageVersion?: string;
  sourcePath: string;
  artifactType?: string;
  artifactKind?: string;
  queryAdapter?: string;
  currentRelease: MdmResourceRelease | null;
  metadata?: MdmResourcePackageMetadata;
  releaseChannel?: PackageReleaseV2["channel"];
  releaseFamily?: string;
  capabilities?: PackageCapabilityV2[];
}

export interface MdmResourcePackageSummary {
  id: string;
  packageVersion?: string;
  manifestPath: string;
  required: boolean;
  format: string;
  artifactType?: string;
  artifactKind?: string;
  queryAdapter?: string;
  currentRelease?: MdmResourceRelease | null;
  metadata?: MdmResourcePackageMetadata;
  releaseChannel?: PackageReleaseV2["channel"];
  releaseFamily?: string;
  capabilities?: PackageCapabilityV2[];
  detail: MdmResourcePackageDetail;
}

export interface MdmResourceRegistry {
  root: string;
  schemaVersion: number;
  packages: MdmResourcePackageSummary[];
}
