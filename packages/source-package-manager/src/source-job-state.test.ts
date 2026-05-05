import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type {
  ManagedRuntimeLayout,
  SourcePackageCoordinate
} from "@mcpskill/shared-types";

import {
  createSourceAcquisitionJobState,
  heartbeatSourceAcquisitionJobState,
  inspectSourceAcquisitionJobSupervision,
  readSourceAcquisitionJobState,
  writeSourceAcquisitionJobState,
  transitionSourceAcquisitionJobState
} from "./source-job-state.js";

describe("source acquisition job state", () => {
  it("creates a confirmation-gated source acquisition job state", () => {
    expect(
      createSourceAcquisitionJobState({
        packageId: "minecraft-1.20.1-source-pack-named",
        minecraftVersion: "1.20.1",
        artifact: "client"
      })
    ).toMatchObject({
      status: "needs_confirmation",
      hasJar: false,
      hasMappings: false,
      hasRemappedJar: false,
      hasDecompiledSource: false,
      hasSourceIndex: false,
      lockKey: "minecraft-1.20.1-source-pack-named:client",
      progress: {
        completedStages: 0,
        totalStages: 5,
        percent: 0,
        currentStage: "waiting_for_confirmation"
      }
    });
  });

  it("transitions to ready only after all source artifacts are ready", () => {
    const initial = createSourceAcquisitionJobState({
      packageId: "minecraft-1.20.1-source-pack-named",
      minecraftVersion: "1.20.1",
      artifact: "client"
    });
    const installing = transitionSourceAcquisitionJobState(initial, "confirm");
    const indexedTooEarly = transitionSourceAcquisitionJobState(
      installing,
      "indexed"
    );
    const ready = [
      "jar_ready",
      "mappings_ready",
      "remapped_ready",
      "decompiled_ready",
      "indexed"
    ].reduce(transitionSourceAcquisitionJobState, installing);

    expect(indexedTooEarly).toMatchObject({
      status: "installing",
      hasSourceIndex: true,
      progress: {
        completedStages: 1,
        currentStage: "download_artifact"
      }
    });
    expect(ready).toMatchObject({
      status: "ready",
      hasJar: true,
      hasMappings: true,
      hasRemappedJar: true,
      hasDecompiledSource: true,
      hasSourceIndex: true,
      progress: {
        completedStages: 5,
        percent: 100,
        currentStage: "complete"
      }
    });
  });

  it("refreshes heartbeat timestamps for active jobs", () => {
    const installing = transitionSourceAcquisitionJobState(
      createSourceAcquisitionJobState({
        packageId: "minecraft-1.20.1-source-pack-named",
        minecraftVersion: "1.20.1",
        artifact: "merged"
      }),
      "confirm"
    );

    expect(heartbeatSourceAcquisitionJobState(installing)).toMatchObject({
      status: "installing",
      heartbeatAt: expect.any(String),
      progress: {
        currentStage: "download_artifact"
      }
    });
  });

  it("preserves acquired evidence when a job fails", () => {
    const installing = transitionSourceAcquisitionJobState(
      createSourceAcquisitionJobState({
        packageId: "minecraft-1.20.1-source-pack-named",
        minecraftVersion: "1.20.1",
        artifact: "server"
      }),
      "confirm"
    );
    const withJar = transitionSourceAcquisitionJobState(installing, "jar_ready");

    expect(transitionSourceAcquisitionJobState(withJar, "fail")).toMatchObject({
      status: "failed",
      hasJar: true
    });
  });

  it("persists and reads source acquisition job state beside package locks", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-job-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const state = transitionSourceAcquisitionJobState(
      createSourceAcquisitionJobState({
        packageId: sourcePackage.packageId,
        minecraftVersion: sourcePackage.minecraftVersion,
        artifact: "merged"
      }),
      "confirm"
    );

    await writeSourceAcquisitionJobState(runtimeLayout, sourcePackage, state);

    await expect(
      readSourceAcquisitionJobState(runtimeLayout, sourcePackage)
    ).resolves.toEqual(state);
  });

  it("combines persisted job state with current lock inspection", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-job-"));
    const runtimeLayout = createRuntimeLayout(runtimeRoot);
    const activeLockPath = join(runtimeLayout.locks, "active.lock");
    const state = {
      ...transitionSourceAcquisitionJobState(
        createSourceAcquisitionJobState({
          packageId: sourcePackage.packageId,
          minecraftVersion: sourcePackage.minecraftVersion,
          artifact: "merged"
        }),
        "confirm"
      ),
      activeLockPath
    };

    await writeSourceAcquisitionJobState(runtimeLayout, sourcePackage, state);
    await mkdir(activeLockPath, { recursive: true });
    await writeFile(
      join(activeLockPath, "owner.json"),
      `${JSON.stringify({
        packageId: sourcePackage.packageId,
        pid: 23456,
        acquiredAt: "2026-05-05T00:00:00.000Z"
      })}\n`
    );

    await expect(
      inspectSourceAcquisitionJobSupervision(runtimeLayout, sourcePackage)
    ).resolves.toMatchObject({
      state: {
        status: "installing",
        activeLockPath
      },
      lock: {
        path: activeLockPath,
        exists: true,
        owner: expect.stringContaining('"pid":23456')
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

function createRuntimeLayout(runtimeRoot: string): ManagedRuntimeLayout {
  return {
    root: runtimeRoot,
    downloads: join(runtimeRoot, "downloads"),
    installs: join(runtimeRoot, "installs"),
    locks: join(runtimeRoot, "locks")
  };
}
