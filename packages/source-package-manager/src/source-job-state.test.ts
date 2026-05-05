import { describe, expect, it } from "vitest";

import {
  createSourceAcquisitionJobState,
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
      lockKey: "minecraft-1.20.1-source-pack-named:client"
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
      hasSourceIndex: true
    });
    expect(ready).toMatchObject({
      status: "ready",
      hasJar: true,
      hasMappings: true,
      hasRemappedJar: true,
      hasDecompiledSource: true,
      hasSourceIndex: true
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
});
