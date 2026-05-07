import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  PackageCapabilityV2,
  PackageReleaseV2
} from "@mcpskill/package-registry";

import type {
  MdmResourcePackageMetadata,
  MdmResourceRegistry
} from "./manifest.js";
import { resolveMdmResourcePackageMetadata } from "./package-metadata.js";

export interface MdmReleaseManifestPackage {
  packageId: string;
  version: string;
  namespace: string;
  artifactType: string;
  artifactKind?: string;
  queryAdapter?: string;
  variant: string;
  required: boolean;
  format: string;
  artifactName: string;
  sha256: string;
  sizeBytes: number;
  metadata?: MdmResourcePackageMetadata;
  releaseChannel?: PackageReleaseV2["channel"];
  releaseFamily?: string;
  capabilities?: PackageCapabilityV2[];
}

export interface MdmReleaseManifest {
  source: string;
  schemaVersion: number;
  generatedAt: string;
  packages: MdmReleaseManifestPackage[];
}

export interface MdmReleaseFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type MdmReleaseFetch = (
  url: string
) => Promise<MdmReleaseFetchResponse>;

export async function readMdmReleaseManifestFile(
  path: string
): Promise<MdmReleaseManifest> {
  return readMdmReleaseManifest(JSON.parse(await readFile(path, "utf-8")), path);
}

export async function fetchMdmReleaseManifest(
  url: string,
  fetcher: MdmReleaseFetch = defaultFetch
): Promise<MdmReleaseManifest> {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch mdm release manifest: HTTP ${response.status}.`);
  }

  return readMdmReleaseManifest(JSON.parse(await response.text()), url);
}

export function readMdmReleaseManifest(
  value: unknown,
  source = "unknown"
): MdmReleaseManifest {
  if (!isRecord(value)) {
    throw new Error("mdm release manifest must be an object.");
  }
  if (!Array.isArray(value.packages)) {
    throw new Error("mdm release manifest packages must be an array.");
  }

  return {
    source,
    schemaVersion: schemaVersionField(value),
    generatedAt: stringField(value, "generatedAt"),
    packages: value.packages.map(readReleasePackage)
  };
}

export function findMdmReleasePackage(
  manifest: MdmReleaseManifest,
  packageId: string
): MdmReleaseManifestPackage | undefined {
  return manifest.packages.find((resourcePackage) => {
    return resourcePackage.packageId === packageId;
  });
}

export function resolveMdmReleaseArtifactUrl(
  manifestUrl: string,
  resourcePackage: Pick<MdmReleaseManifestPackage, "artifactName">
): string {
  try {
    return new URL(resourcePackage.artifactName, manifestUrl).toString();
  } catch {
    return join(dirname(manifestUrl), resourcePackage.artifactName);
  }
}

export function toMdmResourceRegistryFromReleaseManifest(
  manifest: MdmReleaseManifest
): MdmResourceRegistry {
  return {
    root: manifest.source,
    schemaVersion: manifest.schemaVersion,
    packages: manifest.packages.map((resourcePackage) => {
      const metadata = resolveReleasePackageMetadata(resourcePackage);

      return {
        id: resourcePackage.packageId,
        packageVersion: resourcePackage.version,
        manifestPath: manifest.source,
        required: resourcePackage.required,
        format: resourcePackage.format,
        artifactType: resourcePackage.artifactType,
        artifactKind: resourcePackage.artifactKind,
        queryAdapter: resourcePackage.queryAdapter,
        metadata,
        releaseChannel: resourcePackage.releaseChannel,
        releaseFamily: resourcePackage.releaseFamily,
        capabilities: resourcePackage.capabilities,
        currentRelease: {
          artifactName: resourcePackage.artifactName,
          sha256: resourcePackage.sha256,
          sizeBytes: resourcePackage.sizeBytes,
          builtAt: manifest.generatedAt
        },
        detail: {
          schemaVersion: manifest.schemaVersion,
          id: resourcePackage.packageId,
          packageVersion: resourcePackage.version,
          sourcePath: `release:${resourcePackage.artifactName}`,
          artifactType: resourcePackage.artifactType,
          artifactKind: resourcePackage.artifactKind,
          queryAdapter: resourcePackage.queryAdapter,
          metadata,
          releaseChannel: resourcePackage.releaseChannel,
          releaseFamily: resourcePackage.releaseFamily,
          capabilities: resourcePackage.capabilities,
          currentRelease: {
            artifactName: resourcePackage.artifactName,
            sha256: resourcePackage.sha256,
            sizeBytes: resourcePackage.sizeBytes,
            builtAt: manifest.generatedAt
          }
        }
      };
    })
  };
}

function readReleasePackage(value: unknown): MdmReleaseManifestPackage {
  if (!isRecord(value)) {
    throw new Error("mdm release package must be an object.");
  }

  const packageId = stringField(value, "packageId");
  const required = booleanField(value, "required");
  const format = stringField(value, "format");
  const artifactType = stringField(value, "artifactType");
  const variant = stringField(value, "variant");

  return {
    packageId,
    version: stringField(value, "version"),
    namespace: stringField(value, "namespace"),
    artifactType,
    variant,
    required,
    format,
    artifactName: artifactNameField(value),
    sha256: sha256Field(value),
    sizeBytes: nonNegativeIntegerField(value, "sizeBytes"),
    metadata: resolveMdmResourcePackageMetadata(value.metadata, {
      packageId,
      required,
      format,
      artifactType,
      variant
    }),
    artifactKind: optionalString(value.artifactKind, "artifactKind"),
    queryAdapter: optionalString(value.queryAdapter, "queryAdapter"),
    releaseChannel: releaseChannelField(value.releaseChannel),
    releaseFamily: stringField(value, "releaseFamily"),
    capabilities: capabilitiesField(value.capabilities)
  };
}

function resolveReleasePackageMetadata(
  resourcePackage: MdmReleaseManifestPackage
): MdmResourcePackageMetadata {
  return resourcePackage.metadata ??
    resolveMdmResourcePackageMetadata(undefined, {
      packageId: resourcePackage.packageId,
      required: resourcePackage.required,
      format: resourcePackage.format,
      artifactType: resourcePackage.artifactType,
      variant: resourcePackage.variant
    });
}

async function defaultFetch(url: string): Promise<MdmReleaseFetchResponse> {
  return fetch(url);
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `mdm release package field ${field} must be a non-empty string.`
    );
  }

  return value;
}

function numberField(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== "number") {
    throw new Error(`mdm release package field ${field} must be a number.`);
  }

  return value;
}

function schemaVersionField(record: Record<string, unknown>): number {
  const schemaVersion = numberField(record, "schemaVersion");
  if (schemaVersion !== 1) {
    throw new Error("mdm release manifest schemaVersion must be 1.");
  }

  return schemaVersion;
}

function nonNegativeIntegerField(
  record: Record<string, unknown>,
  field: string
): number {
  const value = numberField(record, field);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `mdm release package field ${field} must be a non-negative integer.`
    );
  }

  return value;
}

function artifactNameField(record: Record<string, unknown>): string {
  const artifactName = stringField(record, "artifactName");
  if (artifactName.includes("/") || artifactName.includes("\\")) {
    throw new Error("mdm release package field artifactName must be a file name.");
  }

  return artifactName;
}

function sha256Field(record: Record<string, unknown>): string {
  const sha256 = stringField(record, "sha256");
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(
      "mdm release package field sha256 must be a lowercase sha256."
    );
  }

  return sha256;
}

function booleanField(record: Record<string, unknown>, field: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new Error(`mdm release package field ${field} must be a boolean.`);
  }

  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return stringValue(value, field);
}

function optionalReleaseChannel(
  value: unknown
): PackageReleaseV2["channel"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const allowed: PackageReleaseV2["channel"][] = [
    "required",
    "docs",
    "sources",
    "mappings",
    "datapack",
    "resourcepack",
    "accelerators"
  ];
  if (
    typeof value !== "string" ||
    !allowed.includes(value as PackageReleaseV2["channel"])
  ) {
    throw new Error(`mdm release package field releaseChannel is invalid.`);
  }

  return value as PackageReleaseV2["channel"];
}

function releaseChannelField(value: unknown): PackageReleaseV2["channel"] {
  if (value === undefined) {
    throw new Error("mdm release package field releaseChannel is required.");
  }
  const releaseChannel = optionalReleaseChannel(value);
  if (releaseChannel === undefined) {
    throw new Error("mdm release package field releaseChannel is required.");
  }

  return releaseChannel;
}

function capabilitiesField(value: unknown): PackageCapabilityV2[] {
  if (value === undefined) {
    throw new Error("mdm release package field capabilities is required.");
  }
  if (!Array.isArray(value)) {
    throw new Error("mdm release package field capabilities must be an array.");
  }

  return value.map((entry) => {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error(
        "mdm release package field capabilities must contain non-empty strings."
      );
    }

    return entry as PackageCapabilityV2;
  });
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `mdm release package field ${field} must be a non-empty string.`
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
