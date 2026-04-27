import type {
  SourcePackageCoordinate,
  SourcePackageManifest
} from "@mcpskill/shared-types";

import { readSourcePackageManifest } from "./manifest.js";

export interface SourcePackageInstallValidationResult {
  valid: boolean;
  summary: string;
  manifest?: SourcePackageManifest;
}

export async function validateSourcePackageInstall(
  sourcePackage: SourcePackageCoordinate,
  installPath: string | undefined
): Promise<SourcePackageInstallValidationResult> {
  if (!installPath) {
    return {
      valid: false,
      summary: `Source package ${sourcePackage.packageId} did not produce an install path.`
    };
  }

  const manifest = await readSourcePackageManifest(installPath);

  if (!manifest) {
    return {
      valid: false,
      summary: `Source package ${sourcePackage.packageId} is missing source-package.manifest.json after installation.`
    };
  }

  if (!matchesSourcePackage(sourcePackage, manifest)) {
    return {
      valid: false,
      summary: `Source package ${sourcePackage.packageId} wrote a manifest that does not match the requested package coordinate.`,
      manifest
    };
  }

  return {
    valid: true,
    summary: `Source package ${sourcePackage.packageId} install manifest is valid.`,
    manifest
  };
}

function matchesSourcePackage(
  sourcePackage: SourcePackageCoordinate,
  manifest: SourcePackageManifest
): boolean {
  return (
    manifest.packageId === sourcePackage.packageId &&
    manifest.namespace === sourcePackage.namespace &&
    manifest.minecraftVersion === sourcePackage.minecraftVersion &&
    manifest.artifactType === sourcePackage.artifactType &&
    manifest.variant === sourcePackage.variant
  );
}
