import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, vi } from "vitest";

import type {
  ManagedRuntimeLayout,
  SourcePackageConfirmation,
  SourcePackageCoordinate
} from "@mcpskill/shared-types";

import { writeSourcePackageConfirmation } from "./confirmation.js";
import { buildLocalSourcePackageRecipeExecutor } from "./executor.js";
import { ensureSourcePackageInstalled } from "./install.js";
import { buildSourcePackageManifest, writeSourcePackageManifest } from "./manifest.js";
import { resolveSourcePackagePaths } from "./layout.js";
import { readSourceAcquisitionJobState } from "./source-job-state.js";
import { readSourcePackageInstallState } from "./state.js";
import { buildVanillaSourcePackCopyRecipe } from "./vanilla.js";

const sourcePackage: SourcePackageCoordinate = {
  packageId: "minecraft-1.20.1-source-pack-named",
  namespace: "minecraft",
  minecraftVersion: "1.20.1",
  artifactType: "source-pack",
  variant: "named"
};

const confirmation: SourcePackageConfirmation = {
  ...sourcePackage,
  scope: "package-version",
  approvedAt: "2026-04-24T02:00:00Z",
  source: "explicit-user-confirmation"
};

describe("ensureSourcePackageInstalled", () => {
  it("returns needs_confirmation when the package is not approved yet", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const executeRecipe = vi.fn();

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: {},
        executeRecipe
      })
    ).resolves.toMatchObject({
      status: "needs_confirmation",
      package: sourcePackage,
      confirmationScope: "package-version"
    });

    expect(executeRecipe).not.toHaveBeenCalled();

    await expect(
      readSourceAcquisitionJobState(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      status: "needs_confirmation",
      hasJar: false,
      hasSourceIndex: false
    });
  });

  it("installs a confirmed package through the recipe executor", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-materialized-"));

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);
    await mkdir(join(sourceRoot, "net", "minecraft", "world", "item"), {
      recursive: true
    });
    await writeFile(
      join(sourceRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
      "package net.minecraft.world.item;\npublic class ItemStack {}\n"
    );

    const executeRecipe = buildLocalSourcePackageRecipeExecutor();

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: {
          [sourcePackage.packageId]: buildVanillaSourcePackCopyRecipe({
            minecraftVersion: "1.20.1",
            sourceRoot
          })
        },
        executeRecipe
      })
    ).resolves.toMatchObject({
      status: "ready",
      package: sourcePackage,
      summary: `Executed 3 recipe step(s) for ${sourcePackage.packageId}.`
    });

    await expect(
      readSourcePackageInstallState(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      status: "ready"
    });

    await expect(
      readSourceAcquisitionJobState(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      status: "ready",
      hasJar: true,
      hasMappings: true,
      hasRemappedJar: true,
      hasDecompiledSource: true,
      hasSourceIndex: true
    });
  });

  it("persists installing source job state before executing a confirmed recipe", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const installPath = await mkdtemp(join(tmpdir(), "mcpskill-install-"));

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);
    await writeSourcePackageManifest(
      installPath,
      buildSourcePackageManifest(sourcePackage, {
        provenance: "test",
        stepKinds: ["write_package_manifest"],
        fileCount: 0
      })
    );

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: {
          [sourcePackage.packageId]: {
            ...sourcePackage,
            provenance: "test",
            steps: []
          }
        },
        executeRecipe: async () => {
          await expect(
            readSourceAcquisitionJobState(runtimeLayout, sourcePackage)
          ).resolves.toMatchObject({
            status: "installing",
            hasJar: false
          });

          return {
            installPath,
            summary: "executor returned a valid install"
          };
        }
      })
    ).resolves.toMatchObject({
      status: "ready"
    });
  });

  it("uses an atomic install lock so concurrent ensure calls do not run the recipe twice", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const installPath = await mkdtemp(join(tmpdir(), "mcpskill-install-"));
    const releaseRecipe = createDeferred<void>();

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);
    await writeSourcePackageManifest(
      installPath,
      buildSourcePackageManifest(sourcePackage, {
        provenance: "test",
        stepKinds: ["write_package_manifest"],
        fileCount: 0
      })
    );

    const executeRecipe = vi.fn(async () => {
      await releaseRecipe.promise;

      return {
        installPath,
        summary: "executor returned a valid install"
      };
    });
    const recipe = {
      ...sourcePackage,
      provenance: "test",
      steps: []
    };
    const firstInstall = ensureSourcePackageInstalled({
      runtimeLayout,
      sourcePackage,
      recipes: {
        [sourcePackage.packageId]: recipe
      },
      executeRecipe
    });

    await vi.waitFor(() => expect(executeRecipe).toHaveBeenCalledTimes(1));

    const lockedInstall = await ensureSourcePackageInstalled({
      runtimeLayout,
      sourcePackage,
      recipes: {
        [sourcePackage.packageId]: recipe
      },
      executeRecipe
    });

    expect(lockedInstall).toMatchObject({
      status: "installing",
      summary: expect.stringContaining("atomic package install lock")
    });
    await expect(
      readSourceAcquisitionJobState(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      status: "installing",
      activeLockPath: resolveSourcePackagePaths(runtimeLayout, sourcePackage)
        .installLockDir,
      statusReason: expect.stringContaining("Another process")
    });

    releaseRecipe.resolve();
    await expect(firstInstall).resolves.toMatchObject({
      status: "ready"
    });
    expect(executeRecipe).toHaveBeenCalledTimes(1);
    await expect(
      pathExists(
        resolveSourcePackagePaths(runtimeLayout, sourcePackage).installLockDir
      )
    ).resolves.toBe(false);
  });

  it("reports stale lock evidence without removing the active lock", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const paths = resolveSourcePackagePaths(runtimeLayout, sourcePackage);
    const executeRecipe = vi.fn();

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);
    await mkdir(paths.installLockDir, { recursive: true });
    await writeFile(
      join(paths.installLockDir, "owner.json"),
      `${JSON.stringify({
        packageId: sourcePackage.packageId,
        pid: 12345,
        acquiredAt: "2026-05-05T00:00:00.000Z"
      })}\n`
    );

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: {},
        executeRecipe
      })
    ).resolves.toMatchObject({
      status: "installing",
      summary: expect.stringContaining("appears stale")
    });

    expect(executeRecipe).not.toHaveBeenCalled();
    await expect(pathExists(paths.installLockDir)).resolves.toBe(true);
    await expect(
      readSourceAcquisitionJobState(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      status: "installing",
      lockStale: true,
      statusReason: expect.stringContaining("appears stale")
    });
  });

  it("installs a confirmed package through a lazy recipe provider", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-materialized-"));

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);
    await mkdir(join(sourceRoot, "net", "minecraft", "world", "item"), {
      recursive: true
    });
    await writeFile(
      join(sourceRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
      "package net.minecraft.world.item;\npublic class ItemStack {}\n"
    );

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: {},
        recipeProvider: async (requestedPackage) =>
          requestedPackage.packageId === sourcePackage.packageId
            ? buildVanillaSourcePackCopyRecipe({
                minecraftVersion: "1.20.1",
                sourceRoot
              })
            : undefined,
        executeRecipe: buildLocalSourcePackageRecipeExecutor()
      })
    ).resolves.toMatchObject({
      status: "ready",
      package: sourcePackage
    });
  });

  it("does not rerun the recipe when a ready install state already exists", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-materialized-"));

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);
    await mkdir(join(sourceRoot, "net", "minecraft", "world", "item"), {
      recursive: true
    });
    await writeFile(
      join(sourceRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
      "package net.minecraft.world.item;\npublic class ItemStack {}\n"
    );

    const executeRecipe = vi.fn(buildLocalSourcePackageRecipeExecutor());
    const recipe = buildVanillaSourcePackCopyRecipe({
      minecraftVersion: "1.20.1",
      sourceRoot
    });

    await ensureSourcePackageInstalled({
      runtimeLayout,
      sourcePackage,
      recipes: { [sourcePackage.packageId]: recipe },
      executeRecipe
    });

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: { [sourcePackage.packageId]: recipe },
        executeRecipe
      })
    ).resolves.toMatchObject({
      status: "ready",
      summary: `Source package ${sourcePackage.packageId} is already installed.`
    });

    expect(executeRecipe).toHaveBeenCalledTimes(1);
  });

  it("records install_failed when the recipe executor throws", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const sourceRoot = join(runtimeRoot, "missing-materialized-root");

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: {
          [sourcePackage.packageId]: buildVanillaSourcePackCopyRecipe({
            minecraftVersion: "1.20.1",
            sourceRoot
          })
        },
        executeRecipe: buildLocalSourcePackageRecipeExecutor()
      })
    ).resolves.toMatchObject({
      status: "install_failed",
      error: expect.stringContaining("ENOENT")
    });

    await expect(
      readSourcePackageInstallState(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      status: "install_failed",
      error: expect.stringContaining("ENOENT")
    });

    await expect(
      readSourceAcquisitionJobState(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      status: "failed"
    });
  });

  it("records install_validation_failed when the executor does not materialize a manifest", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-packages-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const invalidInstallPath = await mkdtemp(
      join(tmpdir(), "mcpskill-invalid-install-")
    );

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);

    await expect(
      ensureSourcePackageInstalled({
        runtimeLayout,
        sourcePackage,
        recipes: {
          [sourcePackage.packageId]: buildVanillaSourcePackCopyRecipe({
            minecraftVersion: "1.20.1",
            sourceRoot: invalidInstallPath
          })
        },
        executeRecipe: async () => ({
          installPath: invalidInstallPath,
          summary: "executor returned an invalid install"
        })
      })
    ).resolves.toMatchObject({
      status: "install_validation_failed",
      error: expect.stringContaining("missing source-package.manifest.json")
    });

    await expect(
      readSourcePackageInstallState(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      status: "install_validation_failed",
      error: expect.stringContaining("missing source-package.manifest.json")
    });

    await expect(
      readSourceAcquisitionJobState(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      status: "failed"
    });
  });
});

function createRuntimeLayout(runtimeRoot: string): ManagedRuntimeLayout {
  return {
    root: runtimeRoot,
    downloads: join(runtimeRoot, "downloads"),
    installs: join(runtimeRoot, "installs"),
    locks: join(runtimeRoot, "locks")
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return false;
    }

    throw error;
  }
}
