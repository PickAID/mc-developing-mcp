import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type {
  ManagedRuntimeLayout,
  SourcePackageCoordinate
} from "minecraft-developing-mcp-shared-types";

import {
  buildFileQueuedSourceAcquisitionJobRunner,
  readQueuedSourceAcquisitionJobRequest,
  runQueuedSourceAcquisitionJob
} from "./source-job-runner.js";
import { resolveSourcePackagePaths } from "./layout.js";

describe("file queued source acquisition job runner", () => {
  it("persists a queued source acquisition job request", async () => {
    const runtimeLayout = createRuntimeLayout(
      await mkdtemp(join(tmpdir(), "mcpskill-queued-source-job-"))
    );
    const runner = buildFileQueuedSourceAcquisitionJobRunner({
      jobId: "job-queued",
      now: () => new Date("2026-05-06T00:00:00.000Z")
    });
    const executeRecipe = vi.fn();

    await expect(
      runner({
        runtimeLayout,
        sourcePackage,
        recipe: sourceRecipe(),
        executeRecipe
      })
    ).resolves.toMatchObject({
      status: "queued",
      execution: {
        status: "queued",
        runner: "file-queued-source-acquisition-job-runner",
        jobId: "job-queued",
        queuedAt: "2026-05-06T00:00:00.000Z"
      }
    });

    expect(executeRecipe).not.toHaveBeenCalled();
    await expect(
      readQueuedSourceAcquisitionJobRequest(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      jobId: "job-queued",
      queuedAt: "2026-05-06T00:00:00.000Z",
      sourcePackage,
      recipe: sourceRecipe()
    });
    const requestPath = resolveSourcePackagePaths(
      runtimeLayout,
      sourcePackage
    ).sourceJobRequestPath;
    expect(requestPath).toMatch(/\.job\.json$/);
    await expect(stat(requestPath)).resolves.toMatchObject({
      isFile: expect.any(Function)
    });
  });

  it("runs and clears a queued source acquisition job request", async () => {
    const runtimeLayout = createRuntimeLayout(
      await mkdtemp(join(tmpdir(), "mcpskill-run-queued-source-job-"))
    );
    const installPath = await createValidInstallPath();
    await buildFileQueuedSourceAcquisitionJobRunner({ jobId: "job-ready" })({
      runtimeLayout,
      sourcePackage,
      recipe: sourceRecipe(),
      executeRecipe: async () => {
        throw new Error("queueing should not execute the recipe");
      }
    });

    await expect(
      runQueuedSourceAcquisitionJob({
        runtimeLayout,
        sourcePackage,
        executeRecipe: async ({ recipe }) => ({
          installPath,
          summary: `executed ${recipe.packageId}`
        })
      })
    ).resolves.toMatchObject({
      status: "background_ready",
      recipeResult: {
        installPath,
        summary: "executed minecraft-1.20.1-source-pack-named"
      },
      execution: {
        status: "background_ready",
        runner: "file-queued-source-acquisition-job-runner",
        jobId: "job-ready"
      }
    });

    await expect(
      readQueuedSourceAcquisitionJobRequest(runtimeLayout, sourcePackage)
    ).resolves.toBeUndefined();
  });

  it("reports background unavailable when no queued request exists", async () => {
    const runtimeLayout = createRuntimeLayout(
      await mkdtemp(join(tmpdir(), "mcpskill-missing-queued-source-job-"))
    );

    await expect(
      runQueuedSourceAcquisitionJob({
        runtimeLayout,
        sourcePackage,
        executeRecipe: async () => {
          throw new Error("missing queued request should not execute");
        }
      })
    ).resolves.toMatchObject({
      status: "background_unavailable",
      execution: {
        status: "background_unavailable",
        reason: "queued-job-request-missing"
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

function sourceRecipe() {
  return {
    ...sourcePackage,
    provenance: "test",
    steps: []
  };
}

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
  return installPath;
}
