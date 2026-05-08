import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  readCachedResourceState,
  writeCachedResourceState,
  type MdmResourceCacheLayout,
  type MdmResourceCacheState
} from "./cache.js";
import {
  findMdmReleaseBundle,
  findMdmReleasePackage,
  resolveMdmReleaseArtifactUrl,
  type MdmReleaseManifest,
  type MdmReleaseManifestBundle,
  type MdmReleaseManifestPackage
} from "./release-manifest.js";
import { validateMdmSqliteArtifact } from "./sqlite-artifact-validation.js";

export type MdmArtifactDownloadPolicy = "disabled" | "allowed";

export type MdmArtifactInstallStatus =
  | "ready"
  | "needs_confirmation"
  | "downloaded"
  | "not_found"
  | "invalid_checksum"
  | "invalid_artifact"
  | "download_failed";

export interface MdmArtifactFetchResponse {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer | Buffer>;
}

export type MdmArtifactFetch = (
  url: string
) => Promise<MdmArtifactFetchResponse>;

export interface EnsureMdmReleasePackageCachedInput {
  manifest: MdmReleaseManifest;
  packageId: string;
  cacheLayout: MdmResourceCacheLayout;
  downloadPolicy?: MdmArtifactDownloadPolicy;
  fetcher?: MdmArtifactFetch;
  now?: () => string;
}

export interface EnsureMdmReleasePackageCachedResult {
  status: MdmArtifactInstallStatus;
  packageId: string;
  artifactUrl?: string;
  state?: MdmResourceCacheState;
  expectedSha256?: string;
  actualSha256?: string;
  message: string;
}

export async function ensureMdmReleasePackageCached(
  input: EnsureMdmReleasePackageCachedInput
): Promise<EnsureMdmReleasePackageCachedResult> {
  const resourcePackage = findMdmReleasePackage(input.manifest, input.packageId);
  if (!resourcePackage) {
    return {
      status: "not_found",
      packageId: input.packageId,
      message: `MDM release package ${input.packageId} was not found.`
    };
  }

  const cached = await readReadyCacheState(input.cacheLayout, resourcePackage);
  if (cached) {
    return {
      status: "ready",
      packageId: resourcePackage.packageId,
      state: cached,
      message: `MDM release package ${resourcePackage.packageId} is already cached.`
    };
  }

  const bundle = resourcePackage.bundleRef
    ? findMdmReleaseBundle(input.manifest, resourcePackage.bundleRef.bundleName)
    : undefined;
  if (resourcePackage.bundleRef && !bundle) {
    return {
      status: "not_found",
      packageId: resourcePackage.packageId,
      message: `MDM release package ${resourcePackage.packageId} references missing bundle ${resourcePackage.bundleRef.bundleName}.`
    };
  }
  const releaseArtifact = bundle ?? resourcePackage;
  const artifactUrl = resolveMdmReleaseArtifactUrl(
    input.manifest.source,
    releaseArtifact
  );

  if ((input.downloadPolicy ?? "disabled") !== "allowed") {
    return {
      status: "needs_confirmation",
      packageId: resourcePackage.packageId,
      artifactUrl,
      expectedSha256: resourcePackage.sha256,
      message: `MDM release package ${resourcePackage.packageId} requires explicit confirmation before download.`
    };
  }

  return downloadAndCacheArtifact({
    cacheLayout: input.cacheLayout,
    resourcePackage,
    bundle,
    artifactUrl,
    fetcher: input.fetcher ?? defaultFetch,
    now: input.now ?? (() => new Date().toISOString())
  });
}

async function readReadyCacheState(
  layout: MdmResourceCacheLayout,
  resourcePackage: MdmReleaseManifestPackage
): Promise<MdmResourceCacheState | undefined> {
  const state = await readCachedResourceState(layout, resourcePackage.packageId);
  if (!state || state.sha256 !== resourcePackage.sha256) {
    return undefined;
  }

  const actualSha256 = await hashFile(state.artifactPath).catch(() => undefined);
  return actualSha256 === resourcePackage.sha256 ? state : undefined;
}

async function downloadAndCacheArtifact(input: {
  cacheLayout: MdmResourceCacheLayout;
  resourcePackage: MdmReleaseManifestPackage;
  bundle?: MdmReleaseManifestBundle;
  artifactUrl: string;
  fetcher: MdmArtifactFetch;
  now: () => string;
}): Promise<EnsureMdmReleasePackageCachedResult> {
  const response = await input.fetcher(input.artifactUrl);
  if (!response.ok) {
    return {
      status: "download_failed",
      packageId: input.resourcePackage.packageId,
      artifactUrl: input.artifactUrl,
      message: `Failed to download MDM release package ${input.resourcePackage.packageId}: HTTP ${response.status}.`
    };
  }

  const downloadedBytes = toBuffer(await response.arrayBuffer());
  if (input.bundle) {
    const actualBundleSha256 = hashBytes(downloadedBytes);
    if (actualBundleSha256 !== input.bundle.sha256) {
      return {
        status: "invalid_checksum",
        packageId: input.resourcePackage.packageId,
        artifactUrl: input.artifactUrl,
        expectedSha256: input.bundle.sha256,
        actualSha256: actualBundleSha256,
        message: `Downloaded MDM release bundle ${input.bundle.bundleName} failed checksum validation.`
      };
    }
  }

  let bytes = downloadedBytes;
  if (input.bundle) {
    try {
      bytes = readBundledPackageBytes({
        bundleBytes: downloadedBytes,
        bundle: input.bundle,
        resourcePackage: input.resourcePackage
      });
    } catch (error) {
      return {
        status: "invalid_artifact",
        packageId: input.resourcePackage.packageId,
        artifactUrl: input.artifactUrl,
        message: error instanceof Error ? error.message : "Invalid MDM release bundle."
      };
    }
  }
  const actualSha256 = hashBytes(bytes);
  if (actualSha256 !== input.resourcePackage.sha256) {
    return {
      status: "invalid_checksum",
      packageId: input.resourcePackage.packageId,
      artifactUrl: input.artifactUrl,
      expectedSha256: input.resourcePackage.sha256,
      actualSha256,
      message: `Downloaded MDM release package ${input.resourcePackage.packageId} failed checksum validation.`
    };
  }

  const artifactPath = join(
    input.cacheLayout.artifactsDir,
    input.resourcePackage.packageId,
    input.resourcePackage.artifactName
  );
  const state: MdmResourceCacheState = {
    packageId: input.resourcePackage.packageId,
    artifactName: input.resourcePackage.artifactName,
    artifactPath,
    sha256: input.resourcePackage.sha256,
    updatedAt: input.now()
  };

  await mkdir(join(input.cacheLayout.artifactsDir, input.resourcePackage.packageId), {
    recursive: true
  });
  await writeFile(artifactPath, bytes);
  const artifactError = validateMdmSqliteArtifact({
    artifactPath,
    metadata: input.resourcePackage.metadata,
    queryAdapter: input.resourcePackage.queryAdapter
  });
  if (artifactError) {
    await rm(artifactPath, { force: true });
    return {
      status: "invalid_artifact",
      packageId: input.resourcePackage.packageId,
      artifactUrl: input.artifactUrl,
      expectedSha256: input.resourcePackage.sha256,
      actualSha256,
      message: artifactError
    };
  }
  await writeCachedResourceState(input.cacheLayout, state);

  return {
    status: "downloaded",
    packageId: input.resourcePackage.packageId,
    artifactUrl: input.artifactUrl,
    state,
    message: `Downloaded and cached MDM release package ${input.resourcePackage.packageId}.`
  };
}

function readBundledPackageBytes(input: {
  bundleBytes: Buffer;
  bundle: MdmReleaseManifestBundle;
  resourcePackage: MdmReleaseManifestPackage;
}): Buffer {
  const bundleDocument = JSON.parse(input.bundleBytes.toString("utf-8")) as {
    members?: unknown;
  };
  if (!Array.isArray(bundleDocument.members)) {
    throw new Error(`MDM release bundle ${input.bundle.bundleName} members must be an array.`);
  }

  const member = bundleDocument.members.find((candidate) => {
    return isRecord(candidate) &&
      candidate.packageId === input.resourcePackage.packageId &&
      candidate.memberName === input.resourcePackage.bundleRef?.memberName;
  });
  if (!isRecord(member)) {
    throw new Error(
      `MDM release package ${input.resourcePackage.packageId} was not found in bundle ${input.bundle.bundleName}.`
    );
  }

  const contentBase64 = stringField(member, "contentBase64");
  const bytes = Buffer.from(contentBase64, "base64");
  const memberSha256 = stringField(member, "sha256");
  const memberSizeBytes = numberField(member, "sizeBytes");
  if (
    memberSha256 !== input.resourcePackage.bundleRef?.sha256 ||
    memberSha256 !== input.resourcePackage.sha256
  ) {
    throw new Error(
      `MDM release package ${input.resourcePackage.packageId} bundled member sha256 does not match manifest.`
    );
  }
  if (
    memberSizeBytes !== input.resourcePackage.bundleRef.sizeBytes ||
    memberSizeBytes !== input.resourcePackage.sizeBytes
  ) {
    throw new Error(
      `MDM release package ${input.resourcePackage.packageId} bundled member size does not match manifest.`
    );
  }

  return bytes;
}

async function defaultFetch(url: string): Promise<MdmArtifactFetchResponse> {
  return fetch(url);
}

async function hashFile(path: string): Promise<string> {
  return hashBytes(await readFile(path));
}

function hashBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function toBuffer(value: ArrayBuffer | Buffer): Buffer {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`MDM release bundle field ${field} must be a non-empty string.`);
  }

  return value;
}

function numberField(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`MDM release bundle field ${field} must be a non-negative integer.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
