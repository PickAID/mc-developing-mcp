import type {
  ManagedRuntimeLayout,
  SourcePackageCoordinate,
  SourcePackageEnsureResult,
  SourcePackageInstallState
} from "minecraft-developing-mcp-shared-types";

import { readSourcePackageConfirmation } from "./confirmation.js";
import type {
  SourcePackageRecipeExecutor,
  SourcePackageRecipeProvider,
  SourcePackageRecipeRegistry
} from "./contracts.js";
import {
  inspectSourcePackageInstallLock,
  releaseSourcePackageInstallLock,
  tryAcquireSourcePackageInstallLock
} from "./install-lock.js";
import { findSourcePackageRecipe } from "./recipes.js";
import {
  buildSynchronousSourceAcquisitionJobRunner,
  type SourceAcquisitionJobRunner
} from "./source-job-runner.js";
import {
  readSourcePackageInstallState,
  writeSourcePackageInstallState
} from "./state.js";
import {
  createSourceAcquisitionJobState,
  heartbeatSourceAcquisitionJobState,
  transitionSourceAcquisitionJobState,
  writeSourceAcquisitionJobState,
  type SourceAcquisitionJobEvent,
  type SourceAcquisitionJobState
} from "./source-job-state.js";
import { validateSourcePackageInstall } from "./validation.js";
import { resolveSourcePackagePaths } from "./layout.js";

export interface EnsureSourcePackageInstalledInput {
  runtimeLayout: ManagedRuntimeLayout;
  sourcePackage: SourcePackageCoordinate;
  recipes: SourcePackageRecipeRegistry;
  recipeProvider?: SourcePackageRecipeProvider;
  executeRecipe: SourcePackageRecipeExecutor;
  jobRunner?: SourceAcquisitionJobRunner;
}

export async function ensureSourcePackageInstalled(
  input: EnsureSourcePackageInstalledInput
): Promise<SourcePackageEnsureResult> {
  const confirmation = await readSourcePackageConfirmation(
    input.runtimeLayout,
    input.sourcePackage
  );

  if (!confirmation) {
    await persistSourceJobState(
      input.runtimeLayout,
      input.sourcePackage,
      buildSourceJobState(input.sourcePackage, "needs_confirmation")
    );

    return {
      status: "needs_confirmation",
      package: input.sourcePackage,
      confirmationScope: "package-version",
      summary: `Source package ${input.sourcePackage.packageId} requires explicit confirmation before installation.`
    };
  }

  const existingState = await readSourcePackageInstallState(
    input.runtimeLayout,
    input.sourcePackage
  );

  if (existingState?.status === "ready") {
    const validation = await validateSourcePackageInstall(
      input.sourcePackage,
      existingState.installPath
    );

    if (!validation.valid) {
      const invalidState = buildInstallState(input.sourcePackage, confirmation, {
        status: "install_validation_failed",
        installPath: existingState.installPath,
        error: validation.summary
      });

      await writeSourcePackageInstallState(input.runtimeLayout, invalidState);
      await persistSourceJobState(
        input.runtimeLayout,
        input.sourcePackage,
        buildSourceJobState(input.sourcePackage, "failed", {
          statusReason: validation.summary
        })
      );
    } else {
      await persistSourceJobState(
        input.runtimeLayout,
        input.sourcePackage,
        buildSourceJobState(input.sourcePackage, "ready")
      );

      return {
        status: "ready",
        package: input.sourcePackage,
        installState: existingState,
        summary: `Source package ${input.sourcePackage.packageId} is already installed.`
      };
    }
  }

  if (existingState?.status === "install_validation_failed") {
    const validation = await validateSourcePackageInstall(
      input.sourcePackage,
      existingState.installPath
    );

    if (validation.valid) {
      const readyState = buildInstallState(input.sourcePackage, confirmation, {
        status: "ready",
        installPath: existingState.installPath
      });

      await writeSourcePackageInstallState(input.runtimeLayout, readyState);
      await persistSourceJobState(
        input.runtimeLayout,
        input.sourcePackage,
        buildSourceJobState(input.sourcePackage, "ready")
      );

      return {
        status: "ready",
        package: input.sourcePackage,
        installState: readyState,
        summary: `Source package ${input.sourcePackage.packageId} recovered from a previously invalid install state.`
      };
    }
  }

  const installLock = await tryAcquireSourcePackageInstallLock(
    input.runtimeLayout,
    input.sourcePackage
  );

  if (!installLock) {
    const activeLockPath = resolveSourcePackagePaths(
      input.runtimeLayout,
      input.sourcePackage
    ).installLockDir;
    const lockInspection = await inspectSourcePackageInstallLock(activeLockPath);
    const lockSummary = buildLockInspectionSummary(lockInspection);
    const statusReason = lockInspection.stale
      ? "Another process owns the atomic package install lock, but the lock appears stale. It was not removed automatically."
      : "Another process currently owns the atomic package install lock.";

    await persistSourceJobState(
      input.runtimeLayout,
      input.sourcePackage,
      buildSourceJobState(input.sourcePackage, "installing", {
        activeLockPath,
        statusReason,
        lockOwner: lockInspection.owner,
        lockAcquiredAt: lockInspection.acquiredAt,
        lockAgeMs: lockInspection.ageMs,
        lockStale: lockInspection.stale
      })
    );

    return {
      status: "installing",
      package: input.sourcePackage,
      summary: `Source package ${input.sourcePackage.packageId} is already being installed by another process under the atomic package install lock. Lock: ${activeLockPath}.${lockSummary}`
    };
  }

  try {
    const lockedExistingState = await readSourcePackageInstallState(
      input.runtimeLayout,
      input.sourcePackage
    );

    if (lockedExistingState?.status === "ready") {
      const validation = await validateSourcePackageInstall(
        input.sourcePackage,
        lockedExistingState.installPath
      );

      if (validation.valid) {
        await persistSourceJobState(
          input.runtimeLayout,
          input.sourcePackage,
          buildSourceJobState(input.sourcePackage, "ready")
        );

        return {
          status: "ready",
          package: input.sourcePackage,
          installState: lockedExistingState,
          summary: `Source package ${input.sourcePackage.packageId} is already installed.`
        };
      }
    }

    const recipe =
      findSourcePackageRecipe(input.recipes, input.sourcePackage.packageId) ??
      (input.recipeProvider
        ? await input.recipeProvider(input.sourcePackage)
        : undefined);

    if (!recipe) {
      const failedState = buildInstallState(input.sourcePackage, confirmation, {
        status: "install_failed",
        error: `No recipe registered for ${input.sourcePackage.packageId}.`
      });

      await writeSourcePackageInstallState(input.runtimeLayout, failedState);
      await persistSourceJobState(
        input.runtimeLayout,
        input.sourcePackage,
        buildSourceJobState(input.sourcePackage, "failed", {
          statusReason: failedState.error
        })
      );

      return {
        status: "install_failed",
        package: input.sourcePackage,
        installState: failedState,
        error: failedState.error ?? "Unknown install failure",
        summary: failedState.error ?? "Unknown install failure"
      };
    }

    const installingState = buildInstallState(input.sourcePackage, confirmation, {
      status: "installing"
    });
    await writeSourcePackageInstallState(input.runtimeLayout, installingState);
    await persistSourceJobState(
      input.runtimeLayout,
      input.sourcePackage,
      buildSourceJobState(input.sourcePackage, "installing", {
        activeLockPath: installLock.lockDir,
        statusReason: "This process owns the atomic package install lock."
      })
    );

    const jobRunner =
      input.jobRunner ?? buildSynchronousSourceAcquisitionJobRunner();
    const jobResult = await jobRunner({
      runtimeLayout: input.runtimeLayout,
      sourcePackage: input.sourcePackage,
      recipe,
      executeRecipe: input.executeRecipe
    });

    if (!("recipeResult" in jobResult)) {
      await persistSourceJobState(
        input.runtimeLayout,
        input.sourcePackage,
        buildSourceJobState(input.sourcePackage, "installing", {
          activeLockPath: installLock.lockDir,
          statusReason: jobResult.summary,
          execution: jobResult.execution
        })
      );

      return {
        status: "installing",
        package: input.sourcePackage,
        summary: jobResult.summary
      };
    }

    const result = jobResult.recipeResult;
    const validation = await validateSourcePackageInstall(
      input.sourcePackage,
      result.installPath
    );

    if (!validation.valid) {
      const invalidState = buildInstallState(input.sourcePackage, confirmation, {
        status: "install_validation_failed",
        installPath: result.installPath,
        error: validation.summary
      });

      await writeSourcePackageInstallState(input.runtimeLayout, invalidState);
      await persistSourceJobState(
        input.runtimeLayout,
        input.sourcePackage,
        buildSourceJobState(input.sourcePackage, "failed", {
          statusReason: validation.summary,
          execution: jobResult.execution
        })
      );

      return {
        status: "install_validation_failed",
        package: input.sourcePackage,
        installState: invalidState,
        error: validation.summary,
        summary: validation.summary
      };
    }

    const readyState = buildInstallState(input.sourcePackage, confirmation, {
      status: "ready",
      installPath: result.installPath
    });

    await writeSourcePackageInstallState(input.runtimeLayout, readyState);
    await persistSourceJobState(
      input.runtimeLayout,
      input.sourcePackage,
      buildSourceJobState(input.sourcePackage, "ready", {
        execution: jobResult.execution
      })
    );

    return {
      status: "ready",
      package: input.sourcePackage,
      installState: readyState,
      summary: result.summary
    };
  } catch (error) {
    const failedState = buildInstallState(input.sourcePackage, confirmation, {
      status: "install_failed",
      error: toErrorMessage(error)
    });

    await writeSourcePackageInstallState(input.runtimeLayout, failedState);
    await persistSourceJobState(
      input.runtimeLayout,
      input.sourcePackage,
      buildSourceJobState(input.sourcePackage, "failed", {
        statusReason: failedState.error
      })
    );

    return {
      status: "install_failed",
      package: input.sourcePackage,
      installState: failedState,
      error: failedState.error ?? "Unknown install failure",
      summary: failedState.error ?? "Unknown install failure"
    };
  } finally {
    await releaseSourcePackageInstallLock(installLock);
  }
}

function buildInstallState(
  sourcePackage: SourcePackageCoordinate,
  confirmation: NonNullable<
    Awaited<ReturnType<typeof readSourcePackageConfirmation>>
  >,
  state: {
    status: SourcePackageInstallState["status"];
    error?: string;
    installPath?: string;
  }
): SourcePackageInstallState {
  return {
    ...sourcePackage,
    status: state.status,
    updatedAt: new Date().toISOString(),
    installPath: state.installPath,
    error: state.error,
    confirmation
  };
}

async function persistSourceJobState(
  runtimeLayout: ManagedRuntimeLayout,
  sourcePackage: SourcePackageCoordinate,
  state: SourceAcquisitionJobState | undefined
): Promise<void> {
  if (!state) {
    return;
  }

  await writeSourceAcquisitionJobState(runtimeLayout, sourcePackage, state);
}

function buildSourceJobState(
  sourcePackage: SourcePackageCoordinate,
  status: "needs_confirmation" | "installing" | "ready" | "failed",
  details: Pick<
    SourceAcquisitionJobState,
    | "statusReason"
    | "activeLockPath"
    | "lockOwner"
    | "lockAcquiredAt"
    | "lockAgeMs"
    | "lockStale"
    | "execution"
  > = {}
): SourceAcquisitionJobState | undefined {
  if (sourcePackage.artifactType !== "source-pack") {
    return undefined;
  }

  const initial = createSourceAcquisitionJobState({
    packageId: sourcePackage.packageId,
    minecraftVersion: sourcePackage.minecraftVersion,
    artifact: "merged"
  });

  if (status === "needs_confirmation") {
    return {
      ...initial,
      statusReason:
        details.statusReason ??
        "Installation is gated until explicit package-version confirmation is recorded.",
      ...details
    };
  }

  const confirmed = transitionSourceAcquisitionJobState(initial, "confirm");
  if (status === "installing") {
    return {
      ...heartbeatSourceAcquisitionJobState(confirmed),
      statusReason:
        details.statusReason ??
        "Installation is in progress under the package install lock.",
      ...details
    };
  }
  if (status === "failed") {
    return {
      ...transitionSourceAcquisitionJobState(confirmed, "fail"),
      statusReason:
        details.statusReason ??
        "Installation failed before all source acquisition artifacts were ready.",
      ...details
    };
  }

  const readyEvents: SourceAcquisitionJobEvent[] = [
    "jar_ready",
    "mappings_ready",
    "remapped_ready",
    "decompiled_ready",
    "indexed"
  ];

  return {
    ...readyEvents.reduce(transitionSourceAcquisitionJobState, confirmed),
    statusReason:
      details.statusReason ??
      "All source acquisition artifacts are present and indexed.",
    ...details
  };
}

function buildLockInspectionSummary(
  lockInspection: Awaited<ReturnType<typeof inspectSourcePackageInstallLock>>
): string {
  const ownerSummary = lockInspection.owner
    ? ` Lock owner: ${lockInspection.owner.trim()}.`
    : "";
  const staleSummary = lockInspection.stale
    ? " Lock appears stale; it was not removed automatically."
    : "";

  return `${ownerSummary}${staleSummary}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
