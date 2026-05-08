import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  buildSourcePackageAcquisitionEvidence,
  buildVanillaSourcePackCoordinate,
  ensureSourcePackageInstalled,
  readSourcePackageConfirmation,
  readSourcePackageInstallState,
  readSourceAcquisitionJobState,
  type SourcePackageAcquisitionEvidence,
  type SourceAcquisitionJobRunner,
  type SourcePackageRecipeExecutor,
  type SourcePackageRecipeProvider,
  type SourcePackageRecipeRegistry
} from "minecraft-developing-mcp-source-package-manager";
import type {
  CurrentRuntime,
  ManagedRuntimeLayout,
  VanillaSourceResolveStatus
} from "minecraft-developing-mcp-shared-types";

import { tryResolveIndexedReferences } from "./indexed-references.js";
import {
  deriveVanillaFileName,
  deriveVanillaRelativePath,
  type VanillaSourceRequest
} from "./request.js";
import type { VanillaSourceReference } from "./types.js";
import { resolveVanillaMinecraftVersion } from "./version.js";

export type { VanillaSourceReference } from "./types.js";

export interface ResolveVanillaSourceInput {
  runtimeLayout: ManagedRuntimeLayout;
  currentRuntime?: CurrentRuntime;
  request: VanillaSourceRequest;
  recipes: SourcePackageRecipeRegistry;
  recipeProvider?: SourcePackageRecipeProvider;
  executeRecipe: SourcePackageRecipeExecutor;
  jobRunner?: SourceAcquisitionJobRunner;
  scanBudget?: number;
  sourceIndexDatabasePaths?: string[];
}

export interface ResolveVanillaSourceResult {
  status: VanillaSourceResolveStatus;
  minecraftVersion?: string;
  packageId?: string;
  summary: string;
  references?: VanillaSourceReference[];
  acquisition?: SourcePackageAcquisitionEvidence;
  error?: string;
}

export async function resolveVanillaSource(
  input: ResolveVanillaSourceInput
): Promise<ResolveVanillaSourceResult> {
  const versionResolution = resolveVanillaMinecraftVersion(input.currentRuntime);

  if (!versionResolution.matched || !versionResolution.minecraftVersion) {
    return {
      status: "version_unresolved",
      summary: versionResolution.summary
    };
  }

  const sourcePackage = buildVanillaSourcePackCoordinate(versionResolution.minecraftVersion);
  const existingInstallState = await readSourcePackageInstallState(
    input.runtimeLayout,
    sourcePackage
  );
  const initialSourceJob = await readSourceAcquisitionJobState(input.runtimeLayout, sourcePackage);
  const indexOnlyReferences =
    existingInstallState?.status === "ready"
      ? []
      : await resolveSourceReferences(
          undefined,
          input.request,
          input.scanBudget ?? 64,
          input.sourceIndexDatabasePaths ?? [],
          sourcePackage.minecraftVersion
        );

  if (indexOnlyReferences.length > 0) {
    const acquisition = await buildIndexOnlyAcquisitionEvidence(
      input.runtimeLayout,
      sourcePackage,
      initialSourceJob
    );

    return {
      status: "ready",
      minecraftVersion: sourcePackage.minecraftVersion,
      packageId: sourcePackage.packageId,
      references: indexOnlyReferences,
      acquisition,
      summary: `Resolved ${indexOnlyReferences.length} vanilla source chunk(s) from source index artifact before source-pack installation.`
    };
  }

  const ensureResult = await ensureSourcePackageInstalled({
    runtimeLayout: input.runtimeLayout,
    sourcePackage,
    recipes: input.recipes,
    recipeProvider: input.recipeProvider,
    executeRecipe: input.executeRecipe,
    jobRunner: input.jobRunner
  });
  const acquisition = buildSourcePackageAcquisitionEvidence(ensureResult, {
    sourceJob: await readSourceAcquisitionJobState(input.runtimeLayout, sourcePackage)
  });

  if (ensureResult.status === "needs_confirmation") {
    return {
      status: "needs_confirmation",
      minecraftVersion: sourcePackage.minecraftVersion,
      packageId: sourcePackage.packageId,
      summary: ensureResult.summary,
      acquisition
    };
  }

  if (ensureResult.status === "install_failed") {
    return {
      status: "acquisition_failed",
      minecraftVersion: sourcePackage.minecraftVersion,
      packageId: sourcePackage.packageId,
      summary: ensureResult.summary,
      acquisition,
      error: ensureResult.error
    };
  }

  if (ensureResult.status === "install_validation_failed") {
    return {
      status: "install_validation_failed",
      minecraftVersion: sourcePackage.minecraftVersion,
      packageId: sourcePackage.packageId,
      summary: ensureResult.summary,
      acquisition,
      error: ensureResult.error
    };
  }

  if (ensureResult.status === "installing") {
    return {
      status: "backend_missing",
      minecraftVersion: sourcePackage.minecraftVersion,
      packageId: sourcePackage.packageId,
      summary: ensureResult.summary,
      acquisition
    };
  }

  const references = await resolveSourceReferences(
    ensureResult.installState.installPath,
    input.request,
    input.scanBudget ?? 64,
    input.sourceIndexDatabasePaths ?? []
  );

  if (references.length === 0) {
    return {
      status: "installed_but_no_match",
      minecraftVersion: sourcePackage.minecraftVersion,
      packageId: sourcePackage.packageId,
      acquisition,
      summary: `Vanilla source package ${sourcePackage.packageId} is installed but no matching source file was found.`
    };
  }

  return {
    status: "ready",
    minecraftVersion: sourcePackage.minecraftVersion,
    packageId: sourcePackage.packageId,
    references,
    acquisition,
    summary: `Resolved ${references.length} vanilla source file(s) from ${sourcePackage.packageId}.`
  };
}

async function buildIndexOnlyAcquisitionEvidence(
  runtimeLayout: ManagedRuntimeLayout,
  sourcePackage: ReturnType<typeof buildVanillaSourcePackCoordinate>,
  sourceJob: Awaited<ReturnType<typeof readSourceAcquisitionJobState>>
): Promise<SourcePackageAcquisitionEvidence | undefined> {
  const confirmation = await readSourcePackageConfirmation(runtimeLayout, sourcePackage);
  if (confirmation) {
    return undefined;
  }

  return buildSourcePackageAcquisitionEvidence(
    {
      status: "needs_confirmation",
      package: sourcePackage,
      confirmationScope: "package-version",
      summary: "Source package still requires explicit confirmation; source index artifact supplied compact chunk evidence."
    },
    { sourceJob }
  );
}

async function resolveSourceReferences(
  installPath: string | undefined,
  request: VanillaSourceRequest,
  scanBudget: number,
  sourceIndexDatabasePaths: string[],
  minecraftVersion?: string
): Promise<VanillaSourceReference[]> {
  const indexedReferences = await tryResolveIndexedReferences(
    installPath,
    request,
    sourceIndexDatabasePaths,
    minecraftVersion
  );
  if (indexedReferences.length > 0) {
    return indexedReferences;
  }

  if (!installPath) {
    return [];
  }

  const exactRelativePath = deriveVanillaRelativePath(request);
  const exactReference = exactRelativePath
    ? await tryReadReference(installPath, exactRelativePath, "exact vanilla source pack match")
    : undefined;

  if (exactReference) {
    return [exactReference];
  }

  const fileName = deriveVanillaFileName(request);

  if (!fileName) {
    return [];
  }

  return scanForMatches(installPath, fileName, scanBudget);
}

async function tryReadReference(
  installPath: string,
  relativePath: string,
  reason: string
): Promise<VanillaSourceReference | undefined> {
  try {
    const fullPath = join(installPath, relativePath);
    const content = await readFile(fullPath, "utf-8");

    return {
      path: fullPath,
      relativePath,
      content,
      reason
    };
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }

    throw error;
  }
}

async function scanForMatches(
  installPath: string,
  fileName: string,
  scanBudget: number
): Promise<VanillaSourceReference[]> {
  const queue = [installPath];
  const matches: VanillaSourceReference[] = [];
  let visited = 0;

  while (queue.length > 0 && visited < scanBudget && matches.length < 3) {
    const currentDir = queue.shift();

    if (!currentDir) {
      break;
    }

    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (visited >= scanBudget || matches.length >= 3) {
        break;
      }

      visited += 1;
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (!entry.isFile() || entry.name !== fileName) {
        continue;
      }

      matches.push({
        path: fullPath,
        relativePath: relative(installPath, fullPath).replaceAll("\\", "/"),
        content: await readFile(fullPath, "utf-8"),
        reason: "budgeted vanilla source scan match"
      });
    }
  }

  return matches;
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
