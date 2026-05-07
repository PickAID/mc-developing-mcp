import {
  readMdmDocsResourceRecords,
  type DocsPackageRecord
} from "@mcpskill/docs-retrieval";
import type { MdmResourcePackageStorageKind } from "@mcpskill/resource-registry";

import type { MdmResourceStatusContext } from "../mdm-resource/mdm-resource-status.js";

export interface MdmDocsResourceLoadResult {
  records: DocsPackageRecord[];
  sqliteArtifacts: MdmDocsSqliteArtifact[];
  sourceIndexArtifacts: MdmSourceIndexArtifact[];
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

export interface MdmDocsSqliteArtifact {
  packageId: string;
  artifactPath: string;
}

export interface MdmSourceIndexArtifact {
  packageId: string;
  artifactPath: string;
}

interface ReadyMdmDocsArtifact {
  packageId: string;
  artifactPath: string;
  storageKind: MdmResourcePackageStorageKind | undefined;
  queryAdapter: string | undefined;
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
      artifactPath: resourcePackage.artifactPath,
      storageKind: resourcePackage.metadata?.storageKind,
      queryAdapter: resourcePackage.queryAdapter
    }))
    .filter(isReadyMdmDocsArtifact);
  const sourceIndexArtifacts = artifacts
    .filter((artifact) => artifact.queryAdapter === "source_index_sqlite")
    .map(({ packageId, artifactPath }) => ({ packageId, artifactPath }));
  const sqliteArtifacts = artifacts
    .filter((artifact) =>
      artifact.storageKind === "sqlite_bundle" &&
      artifact.queryAdapter !== "source_index_sqlite"
    )
    .map(({ packageId, artifactPath }) => ({ packageId, artifactPath }));
  const recordArtifacts = artifacts.filter(
    (artifact) =>
      artifact.storageKind !== "sqlite_bundle" &&
      artifact.queryAdapter !== "source_index_sqlite"
  );
  const settled = await Promise.all(
    recordArtifacts.map(async (artifact) => {
      try {
        return {
          artifact,
          records: await readMdmDocsResourceRecords(artifact.artifactPath, {
            storageKind: artifact.storageKind
          })
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
    sqliteArtifacts,
    sourceIndexArtifacts,
    summary: {
      status: errors.length > 0 ? "degraded" : "available",
      artifactCount: artifacts.length,
      recordCount: records.length,
      failedArtifactCount: errors.length,
      errors
    }
  };
}

function isReadyMdmDocsArtifact(
  artifact: {
    packageId: string;
    artifactPath: string | undefined;
    storageKind: MdmResourcePackageStorageKind | undefined;
    queryAdapter: string | undefined;
  }
): artifact is ReadyMdmDocsArtifact {
  return typeof artifact.artifactPath === "string" && artifact.artifactPath.length > 0;
}

export async function loadMdmDocsRecordsFromStatus(
  context: MdmResourceStatusContext
): Promise<DocsPackageRecord[]> {
  return (await loadMdmDocsResourcesFromStatus(context)).records;
}

function emptyResult(status: MdmResourceStatusContext["status"]): MdmDocsResourceLoadResult {
  return {
    records: [],
    sqliteArtifacts: [],
    sourceIndexArtifacts: [],
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
