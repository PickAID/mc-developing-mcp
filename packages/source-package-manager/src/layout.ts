import { join } from "node:path";

import type { ManagedRuntimeLayout, SourcePackageCoordinate } from "@mcpskill/shared-types";

export interface SourcePackagePaths {
  downloadsDir: string;
  installDir: string;
  locksDir: string;
  confirmationPath: string;
  installStatePath: string;
}

export function resolveSourcePackagePaths(
  runtimeLayout: ManagedRuntimeLayout,
  sourcePackage: SourcePackageCoordinate
): SourcePackagePaths {
  const packageSegments = [
    "source-packages",
    sourcePackage.namespace,
    sourcePackage.minecraftVersion,
    sourcePackage.artifactType,
    sourcePackage.variant
  ];
  const locksDir = join(runtimeLayout.locks, "source-packages");

  return {
    downloadsDir: join(runtimeLayout.downloads, ...packageSegments),
    installDir: join(runtimeLayout.installs, ...packageSegments),
    locksDir,
    confirmationPath: join(
      locksDir,
      `${sourcePackage.packageId}.confirmation.json`
    ),
    installStatePath: join(
      locksDir,
      `${sourcePackage.packageId}.install-state.json`
    )
  };
}
