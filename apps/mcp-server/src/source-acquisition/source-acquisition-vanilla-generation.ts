import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import {
  buildLocalSourcePackageRecipeExecutor,
  buildVanillaSourcePackCoordinate,
  ensureSourcePackageInstalled,
  type SourcePackageRecipeExecutor,
  type SourcePackageRecipeProvider,
  type SourcePackageRecipeRegistry
} from "@mcpskill/source-package-manager";
import type { ManagedRuntimeLayout } from "@mcpskill/shared-types";

import type { SourceAcquisitionWorkItemHandlerResult } from "@mcpskill/source-package-manager";

const require = createRequire(import.meta.url);

export interface McpServerVanillaGenerationHandlerOptions {
  runtimeRoot: string;
  recipes?: SourcePackageRecipeRegistry;
  recipeProvider?: SourcePackageRecipeProvider;
  executeRecipe?: SourcePackageRecipeExecutor;
}

export async function executeMcpServerVanillaGenerationWorkItem(input: {
  minecraftVersion: string;
  options: McpServerVanillaGenerationHandlerOptions;
}): Promise<SourceAcquisitionWorkItemHandlerResult> {
  const runtimeLayout = createRuntimeLayout(input.options.runtimeRoot);
  const sourcePackage = buildVanillaSourcePackCoordinate(input.minecraftVersion);
  const result = await ensureSourcePackageInstalled({
    runtimeLayout,
    sourcePackage,
    recipes: input.options.recipes ?? {},
    recipeProvider: input.options.recipeProvider,
    executeRecipe:
      input.options.executeRecipe ?? buildLocalSourcePackageRecipeExecutor()
  });

  return {
    summary: result.summary,
    payload: {
      source: "source_acquisition_vanilla_generation",
      result: {
        status: result.status,
        packageId: result.package.packageId,
        artifactType: result.package.artifactType,
        confirmationScope:
          result.status === "needs_confirmation"
            ? result.confirmationScope
            : undefined,
        installPath:
          result.status === "ready"
            ? result.installState.installPath
            : undefined,
        sourceIndex:
          result.status === "ready"
            ? summarizeSourceIndex(result.installState.installPath)
            : undefined,
        error: "error" in result ? result.error : undefined
      }
    }
  };
}

function createRuntimeLayout(root: string): ManagedRuntimeLayout {
  return {
    root,
    downloads: join(root, "downloads"),
    installs: join(root, "installs"),
    locks: join(root, "locks")
  };
}

function summarizeSourceIndex(
  installPath: string | undefined
):
  | {
      databasePath: string;
      fileCount: number;
      javaSymbolCount: number;
      indexedTextFileCount: number;
    }
  | undefined {
  if (!installPath) {
    return undefined;
  }

  const databasePath = join(installPath, "source-index.sqlite");
  if (!existsSync(databasePath)) {
    return undefined;
  }

  const database = openDatabase(databasePath);
  try {
    return {
      databasePath,
      fileCount: countRows(database, "files"),
      javaSymbolCount: countRows(database, "java_symbols"),
      indexedTextFileCount: countRows(database, "fts_files")
    };
  } finally {
    database.close();
  }
}

function countRows(database: SqliteDatabase, tableName: string): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS total_count FROM ${tableName}`)
    .get();

  return Number(row?.total_count ?? 0);
}

function openDatabase(databasePath: string): SqliteDatabase {
  const sqlite = require("node:sqlite") as {
    DatabaseSync: new (path: string) => SqliteDatabase;
  };

  return new sqlite.DatabaseSync(databasePath);
}

interface SqliteDatabase {
  prepare(sql: string): {
    get(...parameters: unknown[]): Record<string, unknown> | undefined;
  };
  close(): void;
}
