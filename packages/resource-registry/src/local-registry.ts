import { readFile } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve } from "node:path";

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
    currentRelease: releaseField(entry.currentRelease),
    metadata: resolveMdmResourcePackageMetadata(entry.metadata, {
      packageId: id,
      required,
      format,
      sourcePath: detail.sourcePath
    }),
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
    currentRelease: releaseField(value.currentRelease),
    metadata: resolveMdmResourcePackageMetadata(value.metadata ?? summary.metadata, {
      packageId: id,
      required,
      format,
      sourcePath
    })
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
