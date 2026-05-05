import { describe, expect, it } from "vitest";

import { buildSourcePackageAcquisitionEvidence } from "./acquisition-evidence.js";

describe("source package acquisition evidence", () => {
  it("maps source-pack confirmation status to a source job snapshot", () => {
    expect(
      buildSourcePackageAcquisitionEvidence({
        status: "needs_confirmation",
        package: sourcePackage("source-pack"),
        confirmationScope: "package-version",
        summary: "requires confirmation"
      })
    ).toMatchObject({
      status: "needs_confirmation",
      confirmationScope: "package-version",
      sourceJob: {
        status: "needs_confirmation",
        hasJar: false,
        hasSourceIndex: false
      }
    });
  });

  it("maps ready source-pack installs to a completed source job snapshot", () => {
    expect(
      buildSourcePackageAcquisitionEvidence({
        status: "ready",
        package: sourcePackage("source-pack"),
        installState: {
          ...sourcePackage("source-pack"),
          status: "ready",
          updatedAt: "2026-05-05T00:00:00Z",
          installPath: "/tmp/source-pack"
        },
        summary: "ready"
      })
    ).toMatchObject({
      status: "ready",
      installPath: "/tmp/source-pack",
      sourceJob: {
        status: "ready",
        hasJar: true,
        hasMappings: true,
        hasRemappedJar: true,
        hasDecompiledSource: true,
        hasSourceIndex: true
      }
    });
  });

  it("does not assign decompile job phases to datapack packages", () => {
    expect(
      buildSourcePackageAcquisitionEvidence({
        status: "ready",
        package: sourcePackage("datapack"),
        installState: {
          ...sourcePackage("datapack"),
          status: "ready",
          updatedAt: "2026-05-05T00:00:00Z",
          installPath: "/tmp/datapack"
        },
        summary: "ready"
      })
    ).toMatchObject({
      status: "ready",
      artifactType: "datapack",
      installPath: "/tmp/datapack"
    });
  });
});

function sourcePackage(artifactType: "source-pack" | "datapack") {
  return {
    packageId: `minecraft-1.20.1-${artifactType}`,
    namespace: "minecraft" as const,
    minecraftVersion: "1.20.1",
    artifactType,
    variant: artifactType === "source-pack" ? "named" as const : "official" as const
  };
}
