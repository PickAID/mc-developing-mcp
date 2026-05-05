import { describe, expect, it } from "vitest";

import {
  resolveSourcePackageCoordinateFromMdmReleasePackage
} from "./mdm-release-coordinate.js";

describe("resolveSourcePackageCoordinateFromMdmReleasePackage", () => {
  it("converts a release resource-pack entry with an explicit Minecraft version", () => {
    expect(
      resolveSourcePackageCoordinateFromMdmReleasePackage(
        {
          packageId: "minecraft-1.20.1-vanilla-resource-pack-official",
          namespace: "minecraft",
          artifactType: "resource-pack",
          variant: "official",
          version: "2026.05.05"
        },
        { minecraftVersion: "1.20.1" }
      )
    ).toEqual({
      packageId: "minecraft-1.20.1-vanilla-resource-pack-official",
      namespace: "minecraft",
      minecraftVersion: "1.20.1",
      artifactType: "resource-pack",
      variant: "official"
    });
  });

  it("requires an explicit Minecraft version instead of parsing package ids", () => {
    expect(() =>
      resolveSourcePackageCoordinateFromMdmReleasePackage({
        packageId: "minecraft-1.20.1-vanilla-resource-pack-official",
        namespace: "minecraft",
        artifactType: "resource-pack",
        variant: "official",
        version: "2026.05.05"
      })
    ).toThrow("minecraftVersion is required");
  });

  it("rejects resource-registry sqlite artifacts as source packages", () => {
    expect(() =>
      resolveSourcePackageCoordinateFromMdmReleasePackage(
        {
          packageId: "minecraft-1.20.1-docs-index-sqlite",
          namespace: "minecraft",
          artifactType: "sqlite",
          variant: "official",
          version: "2026.05.05"
        },
        { minecraftVersion: "1.20.1" }
      )
    ).toThrow("unsupported source package artifactType");
  });

  it("rejects namespaces outside the source-package coordinate contract", () => {
    expect(() =>
      resolveSourcePackageCoordinateFromMdmReleasePackage(
        {
          packageId: "bad-namespace-resource-pack",
          namespace: "bad namespace",
          artifactType: "resource-pack",
          variant: "official",
          version: "2026.05.05"
        },
        { minecraftVersion: "1.20.1" }
      )
    ).toThrow("unsupported source package namespace");
  });
});
