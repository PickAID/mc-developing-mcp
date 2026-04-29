import {
  readMdmDocsResourceRecords,
  type DocsPackageRecord
} from "@mcpskill/docs-retrieval";

import type { MdmResourceStatusContext } from "./mdm-resource-status.js";

export interface MdmDocsResourceLoadResult {
  records: DocsPackageRecord[];
  summary: MdmDocsResourceSummary;
}

export interface MdmDocsResourceSummary {
  status: "unconfigured" | "available" | "degraded" | "unavailable";
  artifactCount: number;
  recordCount: number;
  failedArtifactCount: number;
  errors: MdmDocsResourceError[];
}

export interface MdmDocsResourceError {
  packageId: string;
  artifactPath: string;
  message: string;
}

export async function loadMdmDocsResourcesFromStatus(
  context: MdmResourceStatusContext
): Promise<MdmDocsResourceLoadResult> {
  if (context.status !== "available") {
    return emptyResult(context.status);
  }

  const artifacts = (context.summary?.packages ?? [])
    .filter((resourcePackage) => resourcePackage.status === "ready")
    .map((resourcePackage) => ({
      packageId: resourcePackage.packageId,
      artifactPath: resourcePackage.artifactPath
    }))
    .filter(
      (artifact): artifact is { packageId: string; artifactPath: string } =>
        Boolean(artifact.artifactPath)
    );
  const settled = await Promise.all(
    artifacts.map(async (artifact) => {
      try {
        return {
          artifact,
          records: await readMdmDocsResourceRecords(artifact.artifactPath)
        };
      } catch (error) {
        return {
          artifact,
          records: [],
          error: toErrorMessage(error)
        };
      }
    })
  );
  const records = settled.flatMap((entry) => entry.records);
  const errors = settled
    .filter((entry) => entry.error)
    .map((entry) => ({
      packageId: entry.artifact.packageId,
      artifactPath: entry.artifact.artifactPath,
      message: entry.error ?? "Unknown MDM docs resource load failure."
    }))
    .slice(0, 8);

  return {
    records,
    summary: {
      status: errors.length > 0 ? "degraded" : "available",
      artifactCount: artifacts.length,
      recordCount: records.length,
      failedArtifactCount: errors.length,
      errors
    }
  };
}

export async function loadMdmDocsRecordsFromStatus(
  context: MdmResourceStatusContext
): Promise<DocsPackageRecord[]> {
  return (await loadMdmDocsResourcesFromStatus(context)).records;
}

function emptyResult(status: MdmResourceStatusContext["status"]): MdmDocsResourceLoadResult {
  return {
    records: [],
    summary: {
      status,
      artifactCount: 0,
      recordCount: 0,
      failedArtifactCount: 0,
      errors: []
    }
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
