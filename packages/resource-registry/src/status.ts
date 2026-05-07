import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type {
  MdmResourcePackageMetadata,
  MdmResourcePackageSummary,
  MdmResourceRelease,
  MdmResourceRegistry
} from "./manifest.js";
import {
  readCachedResourceState,
  type MdmResourceCacheLayout,
  type MdmResourceCacheState
} from "./cache.js";
import { validateMdmSqliteArtifact } from "./sqlite-artifact-validation.js";

export type MdmResourcePackageStatus =
  | "missing_required"
  | "missing_optional"
  | "ready"
  | "invalid_checksum"
  | "invalid_artifact";

export interface MdmResourceStatusEntry {
  packageId: string;
  required: boolean;
  status: MdmResourcePackageStatus;
  metadata?: MdmResourcePackageMetadata;
  artifactType?: string;
  artifactKind?: string;
  queryAdapter?: string;
  releaseChannel?: MdmResourcePackageSummary["releaseChannel"];
  releaseFamily?: string;
  capabilities?: NonNullable<MdmResourcePackageSummary["capabilities"]>;
  artifactName?: string;
  artifactPath?: string;
  expectedSha256?: string;
  actualSha256?: string;
  message: string;
}

export interface MdmResourceStatusSummary {
  packages: MdmResourceStatusEntry[];
  counts: Record<MdmResourcePackageStatus, number>;
}

export interface SummarizeMdmResourceStatusInput {
  registry: MdmResourceRegistry;
  cacheLayout: MdmResourceCacheLayout;
}

export async function summarizeMdmResourceStatus(
  input: SummarizeMdmResourceStatusInput
): Promise<MdmResourceStatusSummary> {
  const packages = await Promise.all(
    input.registry.packages.map(async (resourcePackage) => {
      const release = resourcePackage.detail.currentRelease ?? null;
      const state = await readCachedResourceState(
        input.cacheLayout,
        resourcePackage.id
      );

      return summarizePackage({
        packageId: resourcePackage.id,
        required: resourcePackage.required,
        release,
        state,
        metadata: resourcePackage.detail.metadata ?? resourcePackage.metadata,
        artifactType:
          resourcePackage.detail.artifactType ?? resourcePackage.artifactType,
        artifactKind:
          resourcePackage.detail.artifactKind ?? resourcePackage.artifactKind,
        queryAdapter:
          resourcePackage.detail.queryAdapter ?? resourcePackage.queryAdapter,
        releaseChannel:
          resourcePackage.detail.releaseChannel ?? resourcePackage.releaseChannel,
        releaseFamily:
          resourcePackage.detail.releaseFamily ?? resourcePackage.releaseFamily,
        capabilities:
          resourcePackage.detail.capabilities ?? resourcePackage.capabilities
      });
    })
  );

  return {
    packages,
    counts: countStatuses(packages)
  };
}

async function summarizePackage(input: {
  packageId: string;
  required: boolean;
  release: MdmResourceRelease | null;
  state: MdmResourceCacheState | undefined;
  metadata: MdmResourcePackageMetadata | undefined;
  artifactType: string | undefined;
  artifactKind: string | undefined;
  queryAdapter: string | undefined;
  releaseChannel: MdmResourcePackageSummary["releaseChannel"];
  releaseFamily: string | undefined;
  capabilities: NonNullable<MdmResourcePackageSummary["capabilities"]> | undefined;
}): Promise<MdmResourceStatusEntry> {
  if (!input.release || !input.state) {
    return missingEntry(
      input.packageId,
      input.required,
      input.release,
      input.metadata,
      input.artifactType,
      input.artifactKind,
      input.queryAdapter,
      input.releaseChannel,
      input.releaseFamily,
      input.capabilities
    );
  }

  const actualSha256 = await hashFile(input.state.artifactPath);
  if (
    actualSha256 !== input.release.sha256 ||
    input.state.sha256 !== input.release.sha256
  ) {
    return {
      packageId: input.packageId,
      required: input.required,
      status: "invalid_checksum",
      metadata: input.metadata,
      artifactType: input.artifactType,
      artifactKind: input.artifactKind,
      queryAdapter: input.queryAdapter,
      releaseChannel: input.releaseChannel,
      releaseFamily: input.releaseFamily,
      capabilities: input.capabilities,
      artifactName: input.release.artifactName,
      artifactPath: input.state.artifactPath,
      expectedSha256: input.release.sha256,
      actualSha256,
      message: `Cached resource ${input.packageId} checksum does not match registry.`
    };
  }

  const validationError = validateArtifact(
    input.state.artifactPath,
    input.metadata,
    input.queryAdapter
  );
  if (validationError) {
    return {
      packageId: input.packageId,
      required: input.required,
      status: "invalid_artifact",
      metadata: input.metadata,
      artifactType: input.artifactType,
      artifactKind: input.artifactKind,
      queryAdapter: input.queryAdapter,
      releaseChannel: input.releaseChannel,
      releaseFamily: input.releaseFamily,
      capabilities: input.capabilities,
      artifactName: input.release.artifactName,
      artifactPath: input.state.artifactPath,
      expectedSha256: input.release.sha256,
      actualSha256,
      message: validationError
    };
  }

  return {
    packageId: input.packageId,
    required: input.required,
    status: "ready",
    metadata: input.metadata,
    artifactType: input.artifactType,
    artifactKind: input.artifactKind,
    queryAdapter: input.queryAdapter,
    releaseChannel: input.releaseChannel,
    releaseFamily: input.releaseFamily,
    capabilities: input.capabilities,
    artifactName: input.release.artifactName,
    artifactPath: input.state.artifactPath,
    expectedSha256: input.release.sha256,
    actualSha256,
    message: `Cached resource ${input.packageId} is ready.`
  };
}

function missingEntry(
  packageId: string,
  required: boolean,
  release: MdmResourceRelease | null,
  metadata: MdmResourcePackageMetadata | undefined,
  artifactType: string | undefined,
  artifactKind: string | undefined,
  queryAdapter: string | undefined,
  releaseChannel: MdmResourcePackageSummary["releaseChannel"],
  releaseFamily: string | undefined,
  capabilities: NonNullable<MdmResourcePackageSummary["capabilities"]> | undefined
): MdmResourceStatusEntry {
  const status = required ? "missing_required" : "missing_optional";

  return {
    packageId,
    required,
    status,
    metadata,
    artifactType,
    artifactKind,
    queryAdapter,
    releaseChannel,
    releaseFamily,
    capabilities,
    artifactName: release?.artifactName,
    expectedSha256: release?.sha256,
    message: required
      ? `Required resource ${packageId} is not cached.`
      : `Optional resource ${packageId} is not cached.`
  };
}

function countStatuses(
  packages: MdmResourceStatusEntry[]
): Record<MdmResourcePackageStatus, number> {
  const counts: Record<MdmResourcePackageStatus, number> = {
    missing_required: 0,
    missing_optional: 0,
    ready: 0,
    invalid_checksum: 0,
    invalid_artifact: 0
  };

  for (const resourcePackage of packages) {
    counts[resourcePackage.status] += 1;
  }

  return counts;
}

function validateArtifact(
  artifactPath: string,
  metadata: MdmResourcePackageMetadata | undefined,
  queryAdapter?: string
): string | undefined {
  return validateMdmSqliteArtifact({ artifactPath, metadata, queryAdapter });
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}
