import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";

export interface MdmResourceCacheLayout {
  root: string;
  artifactsDir: string;
  statesDir: string;
}

export interface MdmResourceCacheState {
  packageId: string;
  artifactName: string;
  artifactPath: string;
  sha256: string;
  updatedAt: string;
}

export function resolveMdmResourceCacheLayout(
  runtimeRoot: string
): MdmResourceCacheLayout {
  const root = join(normalize(runtimeRoot), "mdm-resources");

  return {
    root,
    artifactsDir: join(root, "artifacts"),
    statesDir: join(root, "states")
  };
}

export async function readCachedResourceState(
  layout: MdmResourceCacheLayout,
  packageId: string
): Promise<MdmResourceCacheState | undefined> {
  try {
    const raw = await readFile(resolveStatePath(layout, packageId), "utf-8");
    return readState(JSON.parse(raw));
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }

    throw error;
  }
}

export async function writeCachedResourceState(
  layout: MdmResourceCacheLayout,
  state: MdmResourceCacheState
): Promise<void> {
  await mkdir(layout.statesDir, { recursive: true });
  await writeFile(
    resolveStatePath(layout, state.packageId),
    `${JSON.stringify(state, null, 2)}\n`
  );
}

function resolveStatePath(
  layout: MdmResourceCacheLayout,
  packageId: string
): string {
  return join(layout.statesDir, `${encodeURIComponent(packageId)}.cache-state.json`);
}

function readState(value: unknown): MdmResourceCacheState {
  if (!isRecord(value)) {
    throw new Error("mdm resource cache state must be an object.");
  }

  return {
    packageId: stringField(value, "packageId"),
    artifactName: stringField(value, "artifactName"),
    artifactPath: stringField(value, "artifactPath"),
    sha256: stringField(value, "sha256"),
    updatedAt: stringField(value, "updatedAt")
  };
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`mdm cache field ${field} must be a non-empty string.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
