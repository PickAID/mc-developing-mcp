import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  buildVanillaSourcePackCoordinate,
  ensureSourcePackageInstalled,
  type SourcePackageRecipeExecutor,
  type SourcePackageRecipeProvider,
  type SourcePackageRecipeRegistry
} from "@mcpskill/source-package-manager";
import type {
  CurrentRuntime,
  ManagedRuntimeLayout,
  VanillaSourceResolveStatus
} from "@mcpskill/shared-types";

import {
  deriveVanillaFileName,
  deriveVanillaRelativePath,
  type VanillaSourceRequest
} from "./request.js";
import { resolveVanillaMinecraftVersion } from "./version.js";

export interface VanillaSourceReference {
  path: string;
  relativePath: string;
  content: string;
  reason: string;
}

export interface ResolveVanillaSourceInput {
  runtimeLayout: ManagedRuntimeLayout;
  currentRuntime?: CurrentRuntime;
  request: VanillaSourceRequest;
  recipes: SourcePackageRecipeRegistry;
  recipeProvider?: SourcePackageRecipeProvider;
  executeRecipe: SourcePackageRecipeExecutor;
  scanBudget?: number;
}

export interface ResolveVanillaSourceResult {
  status: VanillaSourceResolveStatus;
  minecraftVersion?: string;
  packageId?: string;
  summary: string;
  references?: VanillaSourceReference[];
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

  const sourcePackage = buildVanillaSourcePackCoordinate(
    versionResolution.minecraftVersion
  );
  const ensureResult = await ensureSourcePackageInstalled({
    runtimeLayout: input.runtimeLayout,
    sourcePackage,
    recipes: input.recipes,
    recipeProvider: input.recipeProvider,
    executeRecipe: input.executeRecipe
  });

  if (ensureResult.status === "needs_confirmation") {
    return {
      status: "needs_confirmation",
      minecraftVersion: sourcePackage.minecraftVersion,
      packageId: sourcePackage.packageId,
      summary: ensureResult.summary
    };
  }

  if (ensureResult.status === "install_failed") {
    return {
      status: "acquisition_failed",
      minecraftVersion: sourcePackage.minecraftVersion,
      packageId: sourcePackage.packageId,
      summary: ensureResult.summary,
      error: ensureResult.error
    };
  }

  if (ensureResult.status === "install_validation_failed") {
    return {
      status: "install_validation_failed",
      minecraftVersion: sourcePackage.minecraftVersion,
      packageId: sourcePackage.packageId,
      summary: ensureResult.summary,
      error: ensureResult.error
    };
  }

  if (ensureResult.status === "installing") {
    return {
      status: "backend_missing",
      minecraftVersion: sourcePackage.minecraftVersion,
      packageId: sourcePackage.packageId,
      summary: ensureResult.summary
    };
  }

  const references = await resolveSourceReferences(
    ensureResult.installState.installPath,
    input.request,
    input.scanBudget ?? 64
  );

  if (references.length === 0) {
    return {
      status: "installed_but_no_match",
      minecraftVersion: sourcePackage.minecraftVersion,
      packageId: sourcePackage.packageId,
      summary: `Vanilla source package ${sourcePackage.packageId} is installed but no matching source file was found.`
    };
  }

  return {
    status: "ready",
    minecraftVersion: sourcePackage.minecraftVersion,
    packageId: sourcePackage.packageId,
    references,
    summary: `Resolved ${references.length} vanilla source file(s) from ${sourcePackage.packageId}.`
  };
}

async function resolveSourceReferences(
  installPath: string | undefined,
  request: VanillaSourceRequest,
  scanBudget: number
): Promise<VanillaSourceReference[]> {
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
