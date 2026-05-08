import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type {
  ManagedRuntimeLayout,
  SourcePackageConfirmation,
  SourcePackageCoordinate
} from "minecraft-developing-mcp-shared-types";

import { buildSourcePackageAcquisitionEvidence } from "./acquisition-evidence.js";
import { writeSourcePackageConfirmation } from "./confirmation.js";
import { ensureSourcePackageInstalled } from "./install.js";
import { buildSourcePackageManifest, writeSourcePackageManifest } from "./manifest.js";
import {
  buildSourceAcquisitionJobExecutionEvidence,
  buildSynchronousSourceAcquisitionJobRunner
} from "./source-job-runner.js";
import { readSourceAcquisitionJobState } from "./source-job-state.js";

describe("source acquisition job runner", () => {
  it("records synchronous install execution evidence for the default runner", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-job-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const installPath = await createValidInstallPath();

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);

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
        executeRecipe: async () => ({
          installPath,
          summary: "executor returned a valid install"
        })
      })
    ).resolves.toMatchObject({
      status: "ready"
    });

    const sourceJob = await readSourceAcquisitionJobState(
      runtimeLayout,
      sourcePackage
    );

    expect(sourceJob).toMatchObject({
      status: "ready",
      execution: {
        status: "synchronous_install",
        runner: "inline-source-acquisition-job-runner"
      }
    });
    expect(
      buildSourcePackageAcquisitionEvidence(
        {
          status: "ready",
          package: sourcePackage,
          installState: {
            ...sourcePackage,
            status: "ready",
            updatedAt: "2026-05-05T00:00:00Z",
            installPath
          },
          summary: "ready"
        },
        { sourceJob }
      )
    ).toMatchObject({
      sourceJobExecution: {
        status: "synchronous_install"
      }
    });
  });

  it("allows a runner to queue work without executing the recipe", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-job-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const executeRecipe = vi.fn();

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);

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
        executeRecipe,
        jobRunner: async () => ({
          status: "queued",
          summary: "Source acquisition was queued for background execution.",
          execution: buildSourceAcquisitionJobExecutionEvidence({
            status: "queued",
            runner: "test-queue-runner",
            queuedAt: "2026-05-05T00:00:00.000Z",
            jobId: "job-1",
            summary: "Source acquisition was queued for background execution."
          })
        })
      })
    ).resolves.toMatchObject({
      status: "installing",
      summary: "Source acquisition was queued for background execution."
    });

    expect(executeRecipe).not.toHaveBeenCalled();
    await expect(
      readSourceAcquisitionJobState(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      status: "installing",
      execution: {
        status: "queued",
        runner: "test-queue-runner",
        jobId: "job-1"
      }
    });
  });

  it("accepts a background-ready runner result as completed acquisition", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-job-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const installPath = await createValidInstallPath();

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);

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
          throw new Error("background runner should provide the result");
        },
        jobRunner: async () => ({
          status: "background_ready",
          recipeResult: {
            installPath,
            summary: "background worker produced a valid install"
          },
          execution: buildSourceAcquisitionJobExecutionEvidence({
            status: "background_ready",
            runner: "test-background-runner",
            jobId: "job-ready",
            summary: "Background source acquisition completed."
          })
        })
      })
    ).resolves.toMatchObject({
      status: "ready"
    });

    await expect(
      readSourceAcquisitionJobState(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      status: "ready",
      execution: {
        status: "background_ready",
        runner: "test-background-runner",
        jobId: "job-ready"
      }
    });
  });

  it("reports background-unavailable execution evidence without installing", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-job-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const executeRecipe = vi.fn();

    await writeSourcePackageConfirmation(runtimeLayout, confirmation);

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
        executeRecipe,
        jobRunner: async () => ({
          status: "background_unavailable",
          summary: "Background source acquisition is unavailable.",
          execution: buildSourceAcquisitionJobExecutionEvidence({
            status: "background_unavailable",
            runner: "test-background-runner",
            reason: "worker-disabled",
            summary: "Background source acquisition is unavailable."
          })
        })
      })
    ).resolves.toMatchObject({
      status: "installing",
      summary: "Background source acquisition is unavailable."
    });

    expect(executeRecipe).not.toHaveBeenCalled();
    await expect(
      readSourceAcquisitionJobState(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      status: "installing",
      execution: {
        status: "background_unavailable",
        reason: "worker-disabled"
      }
    });
  });

  it("wraps a recipe executor as a synchronous runner result", async () => {
    const installPath = await createValidInstallPath();
    const executeRecipe = vi.fn(async () => ({
      installPath,
      summary: "ok"
    }));
    const runner = buildSynchronousSourceAcquisitionJobRunner();

    await expect(
      runner({
        runtimeLayout: createRuntimeLayout(await mkdtemp(join(tmpdir(), "mcpskill-"))),
        sourcePackage,
        recipe: {
          ...sourcePackage,
          provenance: "test",
          steps: []
        },
        executeRecipe
      })
    ).resolves.toMatchObject({
      status: "synchronous_install",
      recipeResult: {
        installPath
      },
      execution: {
        status: "synchronous_install"
      }
    });
  });
});

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

function createRuntimeLayout(runtimeRoot: string): ManagedRuntimeLayout {
  return {
    root: runtimeRoot,
    downloads: join(runtimeRoot, "downloads"),
    installs: join(runtimeRoot, "installs"),
    locks: join(runtimeRoot, "locks")
  };
}

async function createValidInstallPath(): Promise<string> {
  const installPath = await mkdtemp(join(tmpdir(), "mcpskill-install-"));

  await mkdir(join(installPath, "net", "minecraft"), { recursive: true });
  await writeFile(
    join(installPath, "net", "minecraft", "Minecraft.java"),
    "package net.minecraft;\npublic class Minecraft {}\n"
  );
  await writeSourcePackageManifest(
    installPath,
    buildSourcePackageManifest(sourcePackage, {
      provenance: "test",
      stepKinds: ["write_package_manifest"],
      fileCount: 1
    })
  );

  return installPath;
}
