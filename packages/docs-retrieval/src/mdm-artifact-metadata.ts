export interface MdmDocsArtifactMetadata {
  packageId: string;
  artifactType: string;
  displayName: string;
  searchTerms: string[];
}

export function readMdmDocsArtifactMetadata(
  packageRecord: Record<string, unknown>
): MdmDocsArtifactMetadata {
  const packageId = readPackageId(packageRecord);

  return {
    packageId,
    artifactType: readArtifactType(packageRecord),
    displayName: readPackageDisplayName(packageRecord, packageId),
    searchTerms: readPackageSearchTerms(packageRecord)
  };
}

function readPackageId(packageRecord: Record<string, unknown>): string {
  if (typeof packageRecord.id === "string") {
    return packageRecord.id;
  }
  const identity = optionalObjectField(packageRecord.identity);
  if (identity) {
    return stringField(identity, "packageId");
  }

  return stringField(packageRecord, "id");
}

function readArtifactType(packageRecord: Record<string, unknown>): string {
  if (typeof packageRecord.artifactType === "string") {
    return packageRecord.artifactType;
  }
  const artifact = optionalObjectField(packageRecord.artifact);
  if (artifact?.kind === "docs_bundle") {
    return "docs";
  }

  return stringField(packageRecord, "artifactType");
}

function readPackageDisplayName(
  packageRecord: Record<string, unknown>,
  fallback: string
): string {
  const identity = optionalObjectField(packageRecord.identity);
  return typeof identity?.displayName === "string"
    ? identity.displayName
    : fallback;
}

function readPackageSearchTerms(packageRecord: Record<string, unknown>): string[] {
  const terms: string[] = [];
  const identity = optionalObjectField(packageRecord.identity);

  pushString(terms, identity?.packageId);
  pushString(terms, identity?.namespace);
  pushString(terms, identity?.description);
  pushStringArray(terms, packageRecord.capabilities);

  return [...new Set(terms)];
}

function optionalObjectField(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`mdm docs field ${field} must be a non-empty string.`);
  }

  return value;
}

function pushString(values: string[], value: unknown): void {
  if (typeof value === "string" && value.length > 0) {
    values.push(value);
  }
}

function pushStringArray(values: string[], value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const entry of value) {
    pushString(values, entry);
  }
}
