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
  sourcePath: string;
  currentRelease: MdmResourceRelease | null;
  metadata?: MdmResourcePackageMetadata;
}

export interface MdmResourcePackageSummary {
  id: string;
  manifestPath: string;
  required: boolean;
  format: string;
  currentRelease?: MdmResourceRelease | null;
  metadata?: MdmResourcePackageMetadata;
  detail: MdmResourcePackageDetail;
}

export interface MdmResourceRegistry {
  root: string;
  schemaVersion: number;
  packages: MdmResourcePackageSummary[];
}
