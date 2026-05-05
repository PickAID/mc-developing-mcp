import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  ManagedRuntimeLayout,
  SourcePackageCoordinate
} from "@mcpskill/shared-types";

import type {
  SourcePackageRecipe,
  SourcePackageRecipeExecutionResult,
  SourcePackageRecipeExecutor
} from "./contracts.js";
import type {
  SourceAcquisitionJobExecutionEvidence,
  SourceAcquisitionJobExecutionStatus
} from "./source-job-state.js";
import { resolveSourcePackagePaths } from "./layout.js";

export interface SourceAcquisitionJobRunnerInput {
  runtimeLayout: ManagedRuntimeLayout;
  sourcePackage: SourcePackageCoordinate;
  recipe: SourcePackageRecipe;
  executeRecipe: SourcePackageRecipeExecutor;
}

export type SourceAcquisitionJobRunnerResult =
  | {
      status: "synchronous_install" | "background_ready";
      recipeResult: SourcePackageRecipeExecutionResult;
      execution: SourceAcquisitionJobExecutionEvidence;
    }
  | {
      status: "queued" | "background_unavailable";
      summary: string;
      execution: SourceAcquisitionJobExecutionEvidence;
    };

export type SourceAcquisitionJobRunner = (
  input: SourceAcquisitionJobRunnerInput
) => Promise<SourceAcquisitionJobRunnerResult>;

export interface SourceAcquisitionQueuedJobRequest {
  jobId: string;
  queuedAt: string;
  sourcePackage: SourcePackageCoordinate;
  recipe: SourcePackageRecipe;
  runner: string;
}

export function buildSynchronousSourceAcquisitionJobRunner(): SourceAcquisitionJobRunner {
  return async (input) => {
    const recipeResult = await input.executeRecipe({
      runtimeLayout: input.runtimeLayout,
      recipe: input.recipe
    });

    return {
      status: "synchronous_install",
      recipeResult,
      execution: buildSourceAcquisitionJobExecutionEvidence({
        status: "synchronous_install",
        summary:
          "Source acquisition executed synchronously in the current process."
      })
    };
  };
}

export function buildFileQueuedSourceAcquisitionJobRunner(input: {
  jobId?: string;
  now?: () => Date;
} = {}): SourceAcquisitionJobRunner {
  return async (runnerInput) => {
    const queuedAt = (input.now?.() ?? new Date()).toISOString();
    const jobId = input.jobId ?? `${runnerInput.sourcePackage.packageId}:${queuedAt}`;
    const request: SourceAcquisitionQueuedJobRequest = {
      jobId,
      queuedAt,
      sourcePackage: runnerInput.sourcePackage,
      recipe: runnerInput.recipe,
      runner: "file-queued-source-acquisition-job-runner"
    };

    await writeQueuedSourceAcquisitionJobRequest(
      runnerInput.runtimeLayout,
      runnerInput.sourcePackage,
      request
    );

    return {
      status: "queued",
      summary: "Source acquisition job was written to the local queued job file.",
      execution: buildSourceAcquisitionJobExecutionEvidence({
        status: "queued",
        runner: request.runner,
        queuedAt,
        jobId,
        summary: "Source acquisition job was written to the local queued job file."
      })
    };
  };
}

export async function readQueuedSourceAcquisitionJobRequest(
  runtimeLayout: ManagedRuntimeLayout,
  sourcePackage: SourcePackageCoordinate
): Promise<SourceAcquisitionQueuedJobRequest | undefined> {
  try {
    return JSON.parse(
      await readFile(
        resolveSourcePackagePaths(runtimeLayout, sourcePackage).sourceJobRequestPath,
        "utf-8"
      )
    ) as SourceAcquisitionQueuedJobRequest;
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function clearQueuedSourceAcquisitionJobRequest(
  runtimeLayout: ManagedRuntimeLayout,
  sourcePackage: SourcePackageCoordinate
): Promise<void> {
  await rm(resolveSourcePackagePaths(runtimeLayout, sourcePackage).sourceJobRequestPath, {
    force: true
  });
}

export async function runQueuedSourceAcquisitionJob(input: {
  runtimeLayout: ManagedRuntimeLayout;
  sourcePackage: SourcePackageCoordinate;
  executeRecipe: SourcePackageRecipeExecutor;
}): Promise<SourceAcquisitionJobRunnerResult> {
  const request = await readQueuedSourceAcquisitionJobRequest(
    input.runtimeLayout,
    input.sourcePackage
  );
  if (!request) {
    return {
      status: "background_unavailable",
      summary: "No queued source acquisition job request exists.",
      execution: buildSourceAcquisitionJobExecutionEvidence({
        status: "background_unavailable",
        runner: "file-queued-source-acquisition-job-runner",
        reason: "queued-job-request-missing",
        summary: "No queued source acquisition job request exists."
      })
    };
  }

  const recipeResult = await input.executeRecipe({
    runtimeLayout: input.runtimeLayout,
    recipe: request.recipe
  });
  await clearQueuedSourceAcquisitionJobRequest(
    input.runtimeLayout,
    input.sourcePackage
  );

  return {
    status: "background_ready",
    recipeResult,
    execution: buildSourceAcquisitionJobExecutionEvidence({
      status: "background_ready",
      runner: request.runner,
      queuedAt: request.queuedAt,
      jobId: request.jobId,
      summary: "Queued source acquisition job executed in the current process."
    })
  };
}

async function writeQueuedSourceAcquisitionJobRequest(
  runtimeLayout: ManagedRuntimeLayout,
  sourcePackage: SourcePackageCoordinate,
  request: SourceAcquisitionQueuedJobRequest
): Promise<void> {
  const requestPath = resolveSourcePackagePaths(
    runtimeLayout,
    sourcePackage
  ).sourceJobRequestPath;
  await mkdir(dirname(requestPath), { recursive: true });
  await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`);
}

export function buildSourceAcquisitionJobExecutionEvidence(input: {
  status: SourceAcquisitionJobExecutionStatus;
  summary: string;
  runner?: string;
  queuedAt?: string;
  jobId?: string;
  reason?: string;
}): SourceAcquisitionJobExecutionEvidence {
  return {
    status: input.status,
    runner: input.runner ?? "inline-source-acquisition-job-runner",
    summary: input.summary,
    queuedAt: input.queuedAt,
    jobId: input.jobId,
    reason: input.reason
  };
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
