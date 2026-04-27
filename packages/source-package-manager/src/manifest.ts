import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  SourcePackageCoordinate,
  SourcePackageManifest
} from "@mcpskill/shared-types";

const SOURCE_PACKAGE_MANIFEST_FILE = "source-package.manifest.json";

export function resolveSourcePackageManifestPath(installPath: string): string {
  return join(installPath, SOURCE_PACKAGE_MANIFEST_FILE);
}

export async function writeSourcePackageManifest(
  installPath: string,
  manifest: SourcePackageManifest
): Promise<string> {
  const manifestPath = resolveSourcePackageManifestPath(installPath);

  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return manifestPath;
}

export async function readSourcePackageManifest(
  installPath: string
): Promise<SourcePackageManifest | undefined> {
  try {
    const raw = await readFile(resolveSourcePackageManifestPath(installPath), "utf-8");

    return JSON.parse(raw) as SourcePackageManifest;
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }

    throw error;
  }
}

export function buildSourcePackageManifest(
  sourcePackage: SourcePackageCoordinate,
  input: {
    provenance: string;
    stepKinds: string[];
    fileCount?: number;
    installedAt?: string;
  }
): SourcePackageManifest {
  return {
    packageId: sourcePackage.packageId,
    namespace: sourcePackage.namespace,
    minecraftVersion: sourcePackage.minecraftVersion,
    artifactType: sourcePackage.artifactType,
    variant: sourcePackage.variant,
    provenance: input.provenance,
    installedAt: input.installedAt ?? new Date().toISOString(),
    stepKinds: [...input.stepKinds],
    fileCount: input.fileCount
  };
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
