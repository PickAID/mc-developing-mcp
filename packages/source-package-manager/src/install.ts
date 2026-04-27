import type {
  ManagedRuntimeLayout,
  SourcePackageCoordinate,
  SourcePackageEnsureResult,
  SourcePackageInstallState
} from "@mcpskill/shared-types";

import { readSourcePackageConfirmation } from "./confirmation.js";
import type {
  SourcePackageRecipeExecutor,
  SourcePackageRecipeProvider,
  SourcePackageRecipeRegistry
} from "./contracts.js";
import { findSourcePackageRecipe } from "./recipes.js";
import {
  readSourcePackageInstallState,
  writeSourcePackageInstallState
} from "./state.js";
import { validateSourcePackageInstall } from "./validation.js";

export interface EnsureSourcePackageInstalledInput {
  runtimeLayout: ManagedRuntimeLayout;
  sourcePackage: SourcePackageCoordinate;
  recipes: SourcePackageRecipeRegistry;
  recipeProvider?: SourcePackageRecipeProvider;
  executeRecipe: SourcePackageRecipeExecutor;
}

export async function ensureSourcePackageInstalled(
  input: EnsureSourcePackageInstalledInput
): Promise<SourcePackageEnsureResult> {
  const confirmation = await readSourcePackageConfirmation(
    input.runtimeLayout,
    input.sourcePackage
  );

  if (!confirmation) {
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
    } else {
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

      return {
        status: "ready",
        package: input.sourcePackage,
        installState: readyState,
        summary: `Source package ${input.sourcePackage.packageId} recovered from a previously invalid install state.`
      };
    }
  }

  if (existingState?.status === "installing") {
    return {
      status: "installing",
      package: input.sourcePackage,
      summary: `Source package ${input.sourcePackage.packageId} is already being installed.`
    };
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

  try {
    const result = await input.executeRecipe({
      runtimeLayout: input.runtimeLayout,
      recipe
    });
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

    return {
      status: "install_failed",
      package: input.sourcePackage,
      installState: failedState,
      error: failedState.error ?? "Unknown install failure",
      summary: failedState.error ?? "Unknown install failure"
    };
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
