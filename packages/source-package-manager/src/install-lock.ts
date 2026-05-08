import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  ManagedRuntimeLayout,
  SourcePackageCoordinate
} from "minecraft-developing-mcp-shared-types";

import { resolveSourcePackagePaths } from "./layout.js";

export interface SourcePackageInstallLock {
  lockDir: string;
}

export interface SourcePackageInstallLockInspection {
  exists: boolean;
  owner?: string;
  acquiredAt?: string;
  ageMs?: number;
  stale: boolean;
  staleReason?: string;
}

export interface InspectSourcePackageInstallLockOptions {
  now?: Date;
  staleAfterMs?: number;
}

const DEFAULT_STALE_LOCK_AFTER_MS = 30 * 60 * 1000;

export async function tryAcquireSourcePackageInstallLock(
  runtimeLayout: ManagedRuntimeLayout,
  sourcePackage: SourcePackageCoordinate
): Promise<SourcePackageInstallLock | undefined> {
  const paths = resolveSourcePackagePaths(runtimeLayout, sourcePackage);

  await mkdir(paths.locksDir, { recursive: true });

  try {
    await mkdir(paths.installLockDir);
  } catch (error) {
    if (isPathExists(error)) {
      return undefined;
    }

    throw error;
  }

  try {
    await writeFile(
      join(paths.installLockDir, "owner.json"),
      `${JSON.stringify(
        {
          packageId: sourcePackage.packageId,
          pid: process.pid,
          acquiredAt: new Date().toISOString()
        },
        null,
        2
      )}\n`
    );
  } catch (error) {
    await rm(paths.installLockDir, { recursive: true, force: true });
    throw error;
  }

  return { lockDir: paths.installLockDir };
}

export async function releaseSourcePackageInstallLock(
  installLock: SourcePackageInstallLock
): Promise<void> {
  await rm(installLock.lockDir, { recursive: true, force: true });
}

export async function readSourcePackageInstallLockOwner(
  lockDir: string
): Promise<string | undefined> {
  try {
    return await readFile(join(lockDir, "owner.json"), "utf-8");
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }

    throw error;
  }
}

export async function inspectSourcePackageInstallLock(
  lockDir: string,
  options: InspectSourcePackageInstallLockOptions = {}
): Promise<SourcePackageInstallLockInspection> {
  if (!(await pathExists(lockDir))) {
    return { exists: false, stale: false };
  }

  const owner = await readSourcePackageInstallLockOwner(lockDir);

  if (!owner) {
    return { exists: true, stale: false };
  }

  const acquiredAt = readOwnerAcquiredAt(owner);
  if (!acquiredAt) {
    return {
      exists: true,
      owner,
      stale: false,
      staleReason:
        "Lock owner metadata does not include a parseable acquiredAt timestamp."
    };
  }

  const now = options.now ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_LOCK_AFTER_MS;
  const ageMs = now.getTime() - new Date(acquiredAt).getTime();
  const stale = ageMs >= staleAfterMs;

  return {
    exists: true,
    owner,
    acquiredAt,
    ageMs,
    stale,
    staleReason: stale
      ? `Lock owner timestamp is older than ${staleAfterMs}ms.`
      : undefined
  };
}

function readOwnerAcquiredAt(owner: string): string | undefined {
  try {
    const parsed = JSON.parse(owner) as { acquiredAt?: unknown };
    if (typeof parsed.acquiredAt !== "string") {
      return undefined;
    }

    return Number.isNaN(new Date(parsed.acquiredAt).getTime())
      ? undefined
      : parsed.acquiredAt;
  } catch {
    return undefined;
  }
}

function isPathExists(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EEXIST"
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isFileNotFound(error)) {
      return false;
    }

    throw error;
  }
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
