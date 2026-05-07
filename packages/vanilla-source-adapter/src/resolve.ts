import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  querySourceIndex,
  readIndexedSourceChunk,
  readIndexedSourceFile,
  type SourceIndexMatch
} from "@mcpskill/source-index";
import {
  buildSourcePackageAcquisitionEvidence,
  buildVanillaSourcePackCoordinate,
  ensureSourcePackageInstalled,
  readSourceAcquisitionJobState,
  type SourcePackageAcquisitionEvidence,
  type SourceAcquisitionJobRunner,
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
  startLine?: number;
  endLine?: number;
  totalLines?: number;
  chunkId?: string;
  matchReasons?: string[];
  nextReads?: string[];
}

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

  const sourcePackage = buildVanillaSourcePackCoordinate(
    versionResolution.minecraftVersion
  );
  const ensureResult = await ensureSourcePackageInstalled({
    runtimeLayout: input.runtimeLayout,
    sourcePackage,
    recipes: input.recipes,
    recipeProvider: input.recipeProvider,
    executeRecipe: input.executeRecipe,
    jobRunner: input.jobRunner
  });
  const acquisition = buildSourcePackageAcquisitionEvidence(ensureResult, {
    sourceJob: await readSourceAcquisitionJobState(
      input.runtimeLayout,
      sourcePackage
    )
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

async function resolveSourceReferences(
  installPath: string | undefined,
  request: VanillaSourceRequest,
  scanBudget: number,
  sourceIndexDatabasePaths: string[]
): Promise<VanillaSourceReference[]> {
  if (!installPath) {
    return [];
  }

  const indexedReferences = await tryResolveIndexedReferences(
    installPath,
    request,
    sourceIndexDatabasePaths
  );
  if (indexedReferences.length > 0) {
    return indexedReferences;
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

async function tryResolveIndexedReferences(
  installPath: string,
  request: VanillaSourceRequest,
  sourceIndexDatabasePaths: string[]
): Promise<VanillaSourceReference[]> {
  const databasePaths = uniqueStrings([
    join(installPath, "source-index.sqlite"),
    ...sourceIndexDatabasePaths
  ]);
  const references = (
    await Promise.all(
      databasePaths.flatMap((databasePath) =>
        selectIndexedMatches(databasePath, request).map((match) =>
          readIndexedReference(installPath, databasePath, match)
        )
      )
    )
  ).filter((reference): reference is VanillaSourceReference => reference !== undefined);

  return references.slice(0, request.maxFiles ?? 3);
}

function selectIndexedMatches(
  databasePath: string,
  request: VanillaSourceRequest
): SourceIndexMatch[] {
  try {
    const exactRelativePath = deriveVanillaRelativePath(request);
    const exactMatches = exactRelativePath
      ? querySourceIndex({
          databasePath,
          pathLike: exactRelativePath,
          limit: 1
        }).matches.filter((match) => match.path === exactRelativePath)
      : [];

    if (exactMatches.length > 0) {
      return exactMatches.map((match) => ({
        ...match,
        matchReasons: ["path_exact"]
      }));
    }

    if (request.symbol) {
      const symbolMatches = querySourceIndex({
        databasePath,
        symbol: request.symbol,
        limit: request.maxFiles ?? 3
      }).matches;

      if (symbolMatches.length > 0) {
        return symbolMatches;
      }
    }

    const text = request.symbol ?? request.relativePath ?? request.packageHint;
    return text
      ? querySourceIndex({
          databasePath,
          text,
          limit: request.maxFiles ?? 3
        }).matches
      : [];
  } catch (error) {
    if (isFileNotFound(error)) {
      return [];
    }

    throw error;
  }
}

async function readIndexedReference(
  installPath: string,
  databasePath: string,
  match: SourceIndexMatch
): Promise<VanillaSourceReference | undefined> {
  const file = await readIndexedSourceFile({
    sourceRoot: installPath,
    databasePath,
    path: match.path,
    startLine: match.startLine,
    maxLines: 120
  }).catch((error: unknown) => {
    if (isFileNotFound(error)) {
      return undefined;
    }
    throw error;
  });

  if (!file) {
    return readIndexedChunkReference(databasePath, match);
  }

  return {
    path: join(installPath, file.path),
    relativePath: file.path,
    content: file.content,
    reason: "indexed vanilla source match",
    startLine: file.startLine,
    endLine: file.endLine,
    totalLines: file.totalLines,
    chunkId: match.chunkId,
    matchReasons: match.matchReasons,
    nextReads: buildSourceReadNextReads(
      file.path,
      file.startLine,
      file.endLine
    )
  };
}

function readIndexedChunkReference(
  databasePath: string,
  match: SourceIndexMatch
): VanillaSourceReference | undefined {
  const chunk = readIndexedSourceChunk({ databasePath, match });
  if (!chunk) {
    return undefined;
  }

  return {
    path: `${databasePath}#${chunk.path}`,
    relativePath: chunk.path,
    content: chunk.content,
    reason: "indexed vanilla source chunk match",
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    totalLines: chunk.endLine,
    chunkId: chunk.chunkId,
    matchReasons: match.matchReasons,
    nextReads: buildSourceReadNextReads(
      chunk.path,
      chunk.startLine,
      chunk.endLine
    )
  };
}

function buildSourceReadNextReads(
  relativePath: string,
  startLine?: number,
  endLine?: number
): string[] {
  if (startLine === undefined || endLine === undefined) {
    return [];
  }

  return [`source.read ${relativePath}:${startLine}-${endLine}`];
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
