import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  ManagedRuntimeLayout,
  SourcePackageConfirmation,
  SourcePackageCoordinate
} from "@mcpskill/shared-types";

import { resolveSourcePackagePaths } from "./layout.js";

export async function readSourcePackageConfirmation(
  runtimeLayout: ManagedRuntimeLayout,
  sourcePackage: SourcePackageCoordinate
): Promise<SourcePackageConfirmation | undefined> {
  try {
    const raw = await readFile(
      resolveSourcePackagePaths(runtimeLayout, sourcePackage).confirmationPath,
      "utf-8"
    );

    return JSON.parse(raw) as SourcePackageConfirmation;
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }

    throw error;
  }
}

export async function writeSourcePackageConfirmation(
  runtimeLayout: ManagedRuntimeLayout,
  confirmation: SourcePackageConfirmation
): Promise<void> {
  const confirmationPath = resolveSourcePackagePaths(
    runtimeLayout,
    confirmation
  ).confirmationPath;

  await mkdir(dirname(confirmationPath), { recursive: true });
  await writeFile(confirmationPath, `${JSON.stringify(confirmation, null, 2)}\n`);
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
