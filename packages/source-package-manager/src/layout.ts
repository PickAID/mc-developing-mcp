import { join } from "node:path";

import type { ManagedRuntimeLayout, SourcePackageCoordinate } from "minecraft-developing-mcp-shared-types";

export interface SourcePackagePaths {
  downloadsDir: string;
  installDir: string;
  locksDir: string;
  installLockDir: string;
  confirmationPath: string;
  installStatePath: string;
  sourceJobStatePath: string;
  sourceJobRequestPath: string;
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
    installLockDir: join(locksDir, `${sourcePackage.packageId}.install.lock`),
    confirmationPath: join(
      locksDir,
      `${sourcePackage.packageId}.confirmation.json`
    ),
    installStatePath: join(
      locksDir,
      `${sourcePackage.packageId}.install-state.json`
    ),
    sourceJobStatePath: join(
      locksDir,
      `${sourcePackage.packageId}.source-job-state.json`
    ),
    sourceJobRequestPath: join(
      locksDir,
      `${sourcePackage.packageId}.job.json`
    )
  };
}
