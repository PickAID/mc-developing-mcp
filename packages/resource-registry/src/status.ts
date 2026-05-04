import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type {
  MdmResourcePackageMetadata,
  MdmResourceRelease,
  MdmResourceRegistry
} from "./manifest.js";
import {
  readCachedResourceState,
  type MdmResourceCacheLayout,
  type MdmResourceCacheState
} from "./cache.js";

export type MdmResourcePackageStatus =
  | "missing_required"
  | "missing_optional"
  | "ready"
  | "invalid_checksum";

export interface MdmResourceStatusEntry {
  packageId: string;
  required: boolean;
  status: MdmResourcePackageStatus;
  metadata?: MdmResourcePackageMetadata;
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
        metadata: resourcePackage.detail.metadata ?? resourcePackage.metadata
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
}): Promise<MdmResourceStatusEntry> {
  if (!input.release || !input.state) {
    return missingEntry(
      input.packageId,
      input.required,
      input.release,
      input.metadata
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
      artifactName: input.release.artifactName,
      artifactPath: input.state.artifactPath,
      expectedSha256: input.release.sha256,
      actualSha256,
      message: `Cached resource ${input.packageId} checksum does not match registry.`
    };
  }

  return {
    packageId: input.packageId,
    required: input.required,
    status: "ready",
    metadata: input.metadata,
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
  metadata: MdmResourcePackageMetadata | undefined
): MdmResourceStatusEntry {
  const status = required ? "missing_required" : "missing_optional";

  return {
    packageId,
    required,
    status,
    metadata,
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
    invalid_checksum: 0
  };

  for (const resourcePackage of packages) {
    counts[resourcePackage.status] += 1;
  }

  return counts;
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}
