import { readFile } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve } from "node:path";

import type {
  PackageCapabilityV2,
  PackageReleaseV2
} from "minecraft-developing-mcp-package-registry";

import type {
  MdmResourcePackageDetail,
  MdmResourcePackageSummary,
  MdmResourceRegistry
} from "./manifest.js";
import { resolveMdmResourcePackageMetadata } from "./package-metadata.js";

export async function readLocalMdmResourceRegistry(
  root: string
): Promise<MdmResourceRegistry> {
  const registryRoot = normalize(resolve(root));
  const index = readRegistryIndex(
    await readJson(resolve(registryRoot, "registry", "index.json"))
  );
  const packages = await Promise.all(
    readPackageEntries(index).map((entry) =>
      readPackageSummary(registryRoot, entry)
    )
  );

  return {
    root: registryRoot,
    schemaVersion: numberField(index, "schemaVersion"),
    packages
  };
}

function readRegistryIndex(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("mdm registry index must be an object.");
  }

  return value;
}

async function readPackageSummary(
  registryRoot: string,
  entry: Record<string, unknown>
): Promise<MdmResourcePackageSummary> {
  const manifestPath = stringField(entry, "manifestPath");
  const detailPath = resolveRegistryPath(registryRoot, manifestPath);
  const detail = readDetail(await readJson(detailPath), entry);
  const id = stringField(entry, "id");
  const required = booleanField(entry, "required");
  const format = stringField(entry, "format");

  return {
    id,
    manifestPath,
    required,
    format,
    artifactType: optionalString(entry.artifactType),
    artifactKind: optionalString(entry.artifactKind),
    queryAdapter: optionalString(entry.queryAdapter),
    currentRelease: releaseField(entry.currentRelease),
    metadata: resolveMdmResourcePackageMetadata(entry.metadata, {
      packageId: id,
      required,
      format,
      sourcePath: detail.sourcePath
    }),
    releaseChannel: optionalReleaseChannel(entry.releaseChannel),
    releaseFamily: optionalString(entry.releaseFamily),
    capabilities: optionalCapabilities(entry.capabilities),
    detail
  };
}

function readPackageEntries(index: unknown): Record<string, unknown>[] {
  if (!isRecord(index) || !Array.isArray(index.packages)) {
    throw new Error("mdm registry index packages must be an array.");
  }

  return index.packages.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error("mdm registry package entry must be an object.");
    }

    return entry;
  });
}

function readDetail(
  value: unknown,
  summary: Record<string, unknown>
): MdmResourcePackageDetail {
  if (!isRecord(value)) {
    throw new Error("mdm registry package detail must be an object.");
  }
  const sourcePath = stringField(value, "sourcePath");
  const id = stringField(value, "id");
  const required = booleanField(summary, "required");
  const format = stringField(summary, "format");

  return {
    schemaVersion: numberField(value, "schemaVersion"),
    id,
    sourcePath,
    artifactType: optionalString(value.artifactType ?? summary.artifactType),
    artifactKind: optionalString(value.artifactKind ?? summary.artifactKind),
    queryAdapter: optionalString(value.queryAdapter ?? summary.queryAdapter),
    currentRelease: releaseField(value.currentRelease),
    metadata: resolveMdmResourcePackageMetadata(value.metadata ?? summary.metadata, {
      packageId: id,
      required,
      format,
      sourcePath
    }),
    releaseChannel: optionalReleaseChannel(value.releaseChannel ?? summary.releaseChannel),
    releaseFamily: optionalString(value.releaseFamily ?? summary.releaseFamily),
    capabilities: optionalCapabilities(value.capabilities ?? summary.capabilities)
  };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf-8"));
}

function resolveRegistryPath(root: string, path: string): string {
  if (isAbsolute(path)) {
    throw new Error(`Path ${path} escapes mdm registry root.`);
  }

  const resolved = normalize(resolve(root, path));
  const rel = relative(root, resolved);
  if (rel.length === 0 || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Path ${path} escapes mdm registry root.`);
  }

  return resolved;
}

function releaseField(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error("mdm resource release must be an object or null.");
  }

  return {
    artifactName: stringField(value, "artifactName"),
    sha256: stringField(value, "sha256"),
    sizeBytes:
      typeof value.sizeBytes === "number" ? value.sizeBytes : undefined,
    builtAt: typeof value.builtAt === "string" ? value.builtAt : undefined
  };
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`mdm registry field ${field} must be a non-empty string.`);
  }

  return value;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("mdm registry optional string field must be a non-empty string.");
  }

  return value;
}

function optionalReleaseChannel(
  value: unknown
): PackageReleaseV2["channel"] | undefined {
  const channel = optionalString(value);
  if (channel === undefined) {
    return undefined;
  }
  const allowed: PackageReleaseV2["channel"][] = [
    "required",
    "docs",
    "sources",
    "mappings",
    "datapack",
    "resourcepack",
    "accelerators",
    "external-libraries"
  ];
  if (!allowed.includes(channel as PackageReleaseV2["channel"])) {
    throw new Error(`mdm registry releaseChannel ${channel} is invalid.`);
  }

  return channel as PackageReleaseV2["channel"];
}

function optionalCapabilities(value: unknown): PackageCapabilityV2[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("mdm registry optional string array field must be an array.");
  }

  return value.map((entry) => optionalString(entry) as PackageCapabilityV2);
}

function numberField(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== "number") {
    throw new Error(`mdm registry field ${field} must be a number.`);
  }

  return value;
}

function booleanField(record: Record<string, unknown>, field: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new Error(`mdm registry field ${field} must be a boolean.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
