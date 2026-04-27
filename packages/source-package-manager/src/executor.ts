import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { extractJavaSourcesArchive } from "@mcpskill/jar-source-adapter";
import { buildSourceIndex } from "@mcpskill/source-index";

import { resolveSourcePackagePaths } from "./layout.js";
import {
  buildSourcePackageManifest,
  writeSourcePackageManifest
} from "./manifest.js";
import type {
  SourcePackageRecipeExecutionInput,
  SourcePackageRecipeExecutionResult,
  SourcePackageRecipeExecutor
} from "./contracts.js";

export function buildLocalSourcePackageRecipeExecutor(): SourcePackageRecipeExecutor {
  return (input) => executeLocalSourcePackageRecipe(input);
}

export async function executeLocalSourcePackageRecipe(
  input: SourcePackageRecipeExecutionInput
): Promise<SourcePackageRecipeExecutionResult> {
  const installPath = resolveSourcePackagePaths(
    input.runtimeLayout,
    input.recipe
  ).installDir;
  let fileCount = 0;
  let manifest = undefined;
  let sourceIndex = undefined;

  await rm(installPath, { recursive: true, force: true });
  await mkdir(installPath, { recursive: true });

  for (const step of input.recipe.steps) {
    switch (step.kind) {
      case "copy_tree":
        fileCount += await copyTree(step.sourceRoot, installPath);
        break;
      case "extract_java_sources_zip":
        fileCount += (
          await extractJavaSourcesArchive({
            sourceArchive: step.sourceZip,
            targetRoot: installPath
          })
        ).fileCount;
        break;
      case "build_source_index": {
        const indexResult = await buildSourceIndex({
          sourceRoot: installPath,
          databasePath: join(
            installPath,
            step.databaseFileName ?? "source-index.sqlite"
          ),
          packageId: input.recipe.packageId,
          maxFiles: step.maxFiles,
          maxBytesPerFile: step.maxBytesPerFile
        });
        sourceIndex = {
          databasePath: indexResult.databasePath,
          fileCount: indexResult.fileCount,
          javaSymbolCount: indexResult.javaSymbolCount,
          indexedTextFileCount: indexResult.indexedTextFileCount
        };
        break;
      }
      case "write_package_manifest":
        manifest = buildSourcePackageManifest(input.recipe, {
          provenance: input.recipe.provenance,
          stepKinds: input.recipe.steps.map((entry) => entry.kind),
          fileCount
        });
        await writeSourcePackageManifest(installPath, manifest);
        break;
    }
  }

  return {
    installPath,
    summary: `Executed ${input.recipe.steps.length} recipe step(s) for ${input.recipe.packageId}.`,
    manifest,
    fileCount,
    sourceIndex
  };
}

async function copyTree(sourceRoot: string, installPath: string): Promise<number> {
  return copyTreeIntoInstall(sourceRoot, sourceRoot, installPath);
}

async function copyTreeIntoInstall(
  baseSourceRoot: string,
  currentSourceRoot: string,
  installPath: string
): Promise<number> {
  const entries = await readdir(currentSourceRoot, { withFileTypes: true });
  let fileCount = 0;

  for (const entry of entries) {
    const sourcePath = join(currentSourceRoot, entry.name);

    if (entry.isDirectory()) {
      fileCount += await copyTreeIntoInstall(
        baseSourceRoot,
        sourcePath,
        installPath
      );
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relativePath = relative(baseSourceRoot, sourcePath);
    const targetPath = join(installPath, relativePath);

    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
    fileCount += 1;
  }

  return fileCount;
}
