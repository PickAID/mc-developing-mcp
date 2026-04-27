import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  ManagedRuntimeLayout,
  SourcePackageCoordinate,
  SourcePackageInstallState
} from "@mcpskill/shared-types";

import { resolveSourcePackagePaths } from "./layout.js";

export async function readSourcePackageInstallState(
  runtimeLayout: ManagedRuntimeLayout,
  sourcePackage: SourcePackageCoordinate
): Promise<SourcePackageInstallState | undefined> {
  try {
    const raw = await readFile(
      resolveSourcePackagePaths(runtimeLayout, sourcePackage).installStatePath,
      "utf-8"
    );

    return JSON.parse(raw) as SourcePackageInstallState;
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }

    throw error;
  }
}

export async function writeSourcePackageInstallState(
  runtimeLayout: ManagedRuntimeLayout,
  installState: SourcePackageInstallState
): Promise<void> {
  const installStatePath = resolveSourcePackagePaths(
    runtimeLayout,
    installState
  ).installStatePath;

  await mkdir(dirname(installStatePath), { recursive: true });
  await writeFile(installStatePath, `${JSON.stringify(installState, null, 2)}\n`);
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
