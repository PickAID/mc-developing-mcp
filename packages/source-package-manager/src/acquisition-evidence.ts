import type {
  SourcePackageCoordinate,
  SourcePackageEnsureResult,
  SourcePackageInstallStatus
} from "@mcpskill/shared-types";

import {
  createSourceAcquisitionJobState,
  transitionSourceAcquisitionJobState,
  type SourceAcquisitionJobEvent,
  type SourceAcquisitionJobState
} from "./source-job-state.js";

export type SourcePackageAcquisitionStatus =
  | "needs_confirmation"
  | "installing"
  | "ready"
  | "failed";

export interface SourcePackageAcquisitionEvidence {
  packageId: string;
  namespace: SourcePackageCoordinate["namespace"];
  minecraftVersion: string;
  artifactType: SourcePackageCoordinate["artifactType"];
  variant: SourcePackageCoordinate["variant"];
  status: SourcePackageAcquisitionStatus;
  confirmationScope?: "package-version";
  installPath?: string;
  error?: string;
  summary: string;
  sourceJob?: SourceAcquisitionJobState;
}

export function buildSourcePackageAcquisitionEvidence(
  ensureResult: SourcePackageEnsureResult
): SourcePackageAcquisitionEvidence {
  const sourcePackage = ensureResult.package;
  const status = normalizeInstallStatus(ensureResult.status);
  const installPath =
    "installState" in ensureResult ? ensureResult.installState.installPath : undefined;
  const error = "error" in ensureResult ? ensureResult.error : undefined;

  const sourceJob =
    sourcePackage.artifactType === "source-pack"
      ? buildSourceJobEvidence(sourcePackage, status)
      : undefined;

  return {
    packageId: sourcePackage.packageId,
    namespace: sourcePackage.namespace,
    minecraftVersion: sourcePackage.minecraftVersion,
    artifactType: sourcePackage.artifactType,
    variant: sourcePackage.variant,
    status,
    confirmationScope:
      ensureResult.status === "needs_confirmation"
        ? ensureResult.confirmationScope
        : undefined,
    installPath,
    error,
    summary: ensureResult.summary,
    ...(sourceJob ? { sourceJob } : {})
  };
}

function buildSourceJobEvidence(
  sourcePackage: SourcePackageCoordinate,
  status: SourcePackageAcquisitionStatus
): SourceAcquisitionJobState {
  const initial = createSourceAcquisitionJobState({
    packageId: sourcePackage.packageId,
    minecraftVersion: sourcePackage.minecraftVersion,
    artifact: "merged"
  });

  if (status === "needs_confirmation") {
    return initial;
  }
  if (status === "failed") {
    return transitionSourceAcquisitionJobState(
      transitionSourceAcquisitionJobState(initial, "confirm"),
      "fail"
    );
  }
  if (status === "installing") {
    return transitionSourceAcquisitionJobState(initial, "confirm");
  }

  const readyEvents: SourceAcquisitionJobEvent[] = [
    "confirm",
    "jar_ready",
    "mappings_ready",
    "remapped_ready",
    "decompiled_ready",
    "indexed"
  ];

  return readyEvents.reduce(transitionSourceAcquisitionJobState, initial);
}

function normalizeInstallStatus(
  status: SourcePackageInstallStatus
): SourcePackageAcquisitionStatus {
  if (status === "install_failed" || status === "install_validation_failed") {
    return "failed";
  }

  return status;
}
