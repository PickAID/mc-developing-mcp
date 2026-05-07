import type {
  MdmResourcePackageCommitPolicy,
  MdmResourcePackageInstallTier,
  MdmResourcePackageMetadata,
  MdmResourcePackageStorageKind,
  MdmSqliteArtifactValidation
} from "./manifest.js";

export interface MdmPackageMetadataDefaults {
  packageId: string;
  required: boolean;
  format: string;
  artifactType?: string;
  variant?: string;
  sourcePath?: string;
}

export function resolveMdmResourcePackageMetadata(
  value: unknown,
  defaults: MdmPackageMetadataDefaults
): MdmResourcePackageMetadata {
  const record = value === undefined ? {} : requireRecord(value);
  const storageKind =
    optionalStorageKind(record.storageKind) ?? inferStorageKind(defaults);

  return {
    storageKind,
    installTier:
      optionalInstallTier(record.installTier) ??
      inferInstallTier(storageKind, defaults.required),
    commitPolicy:
      optionalCommitPolicy(record.commitPolicy) ??
      inferCommitPolicy(storageKind),
    sqlite: optionalSqliteValidation(record.sqlite)
  };
}

function inferStorageKind(
  defaults: MdmPackageMetadataDefaults
): MdmResourcePackageStorageKind {
  if (defaults.sourcePath?.startsWith("generated:")) {
    return "generated_local_cache";
  }
  if (defaults.format === "sqlite" || defaults.artifactType === "sqlite") {
    return "sqlite_bundle";
  }
  if (!defaults.required && isAccelerator(defaults)) {
    return "optional_accelerator";
  }

  return "remote_manifest";
}

function inferInstallTier(
  storageKind: MdmResourcePackageStorageKind,
  required: boolean
): MdmResourcePackageInstallTier {
  if (storageKind === "generated_local_cache") {
    return "private_local_cache";
  }
  if (storageKind === "optional_accelerator") {
    return "optional_accelerator";
  }

  return required ? "required_docs" : "optional_dataset";
}

function inferCommitPolicy(
  storageKind: MdmResourcePackageStorageKind
): MdmResourcePackageCommitPolicy {
  return storageKind === "generated_local_cache"
    ? "private_generated_cache"
    : "repository_manifest";
}

function optionalStorageKind(
  value: unknown
): MdmResourcePackageStorageKind | undefined {
  return optionalEnum(value, [
    "sqlite_bundle",
    "generated_local_cache",
    "remote_manifest",
    "optional_accelerator"
  ]);
}

function optionalInstallTier(
  value: unknown
): MdmResourcePackageInstallTier | undefined {
  return optionalEnum(value, [
    "required_docs",
    "optional_dataset",
    "runtime_or_optional_dataset",
    "optional_accelerator",
    "private_local_cache"
  ]);
}

function optionalCommitPolicy(
  value: unknown
): MdmResourcePackageCommitPolicy | undefined {
  return optionalEnum(value, [
    "repository_manifest",
    "private_generated_cache"
  ]);
}

function optionalSqliteValidation(
  value: unknown
): MdmSqliteArtifactValidation | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = requireRecord(value);
  const requiredTables = record.requiredTables;

  return {
    databaseName: optionalString(record.databaseName, "databaseName"),
    minUserVersion: optionalNonNegativeInteger(
      record.minUserVersion,
      "minUserVersion"
    ),
    requiredTables:
      requiredTables === undefined
        ? undefined
        : requireStringArray(requiredTables, "requiredTables")
  };
}

function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`mdm package metadata value ${String(value)} is invalid.`);
  }

  return value as T;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireString(value, field);
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number") {
    throw new Error(`mdm package metadata field ${field} must be a number.`);
  }

  return value;
}

function optionalNonNegativeInteger(
  value: unknown,
  field: string
): number | undefined {
  const numberValue = optionalNumber(value, field);
  if (numberValue === undefined) {
    return undefined;
  }
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(
      `mdm package metadata field ${field} must be a non-negative integer.`
    );
  }

  return numberValue;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`mdm package metadata field ${field} must be an array.`);
  }

  return value.map((entry) => requireString(entry, field));
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `mdm package metadata field ${field} must be a non-empty string.`
    );
  }

  return value;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error("mdm package metadata must be an object.");
  }

  return value as Record<string, unknown>;
}

function isAccelerator(defaults: MdmPackageMetadataDefaults): boolean {
  return [defaults.packageId, defaults.artifactType, defaults.variant]
    .filter((value): value is string => typeof value === "string")
    .some((value) => value.includes("accelerator"));
}
