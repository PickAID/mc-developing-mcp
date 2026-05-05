import type {
  SourcePackageCoordinate,
  SourcePackageEnsureResult,
  SourcePackageInstallStatus
} from "@mcpskill/shared-types";

import {
  createSourceAcquisitionJobState,
  transitionSourceAcquisitionJobState,
  type SourceAcquisitionJobEvent,
  type SourceAcquisitionJobExecutionEvidence,
  type SourceAcquisitionJobState,
  type SourceAcquisitionJobSupervisionSnapshot
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
  sourceJobExecution?: SourceAcquisitionJobExecutionEvidence;
  sourceJobSupervision?: SourceAcquisitionJobSupervisionSnapshot;
}

export interface BuildSourcePackageAcquisitionEvidenceOptions {
  sourceJob?: SourceAcquisitionJobState;
  sourceJobSupervision?: SourceAcquisitionJobSupervisionSnapshot;
}

export function buildSourcePackageAcquisitionEvidence(
  ensureResult: SourcePackageEnsureResult,
  options: BuildSourcePackageAcquisitionEvidenceOptions = {}
): SourcePackageAcquisitionEvidence {
  const sourcePackage = ensureResult.package;
  const status = normalizeInstallStatus(ensureResult.status);
  const installPath =
    "installState" in ensureResult ? ensureResult.installState.installPath : undefined;
  const error = "error" in ensureResult ? ensureResult.error : undefined;

  const sourceJob =
    sourcePackage.artifactType === "source-pack"
      ? options.sourceJob ?? buildSourceJobEvidence(sourcePackage, status)
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
    ...(sourceJob ? { sourceJob } : {}),
    ...(sourceJob?.execution
      ? { sourceJobExecution: sourceJob.execution }
      : {}),
    ...(sourcePackage.artifactType === "source-pack" &&
    options.sourceJobSupervision
      ? { sourceJobSupervision: options.sourceJobSupervision }
      : {})
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
    return {
      ...initial,
      statusReason:
        "Installation is gated until explicit package-version confirmation is recorded."
    };
  }
  if (status === "failed") {
    const failed = transitionSourceAcquisitionJobState(
      transitionSourceAcquisitionJobState(initial, "confirm"),
      "fail"
    );
    return {
      ...failed,
      statusReason: "Installation failed before all source acquisition artifacts were ready."
    };
  }
  if (status === "installing") {
    return {
      ...transitionSourceAcquisitionJobState(initial, "confirm"),
      statusReason:
        "Installation is in progress or another process currently owns the package install lock."
    };
  }

  const readyEvents: SourceAcquisitionJobEvent[] = [
    "confirm",
    "jar_ready",
    "mappings_ready",
    "remapped_ready",
    "decompiled_ready",
    "indexed"
  ];

  const ready = readyEvents.reduce(transitionSourceAcquisitionJobState, initial);
  return {
    ...ready,
    statusReason: "All source acquisition artifacts are present and indexed."
  };
}

function normalizeInstallStatus(
  status: SourcePackageInstallStatus
): SourcePackageAcquisitionStatus {
  if (status === "install_failed" || status === "install_validation_failed") {
    return "failed";
  }

  return status;
}
