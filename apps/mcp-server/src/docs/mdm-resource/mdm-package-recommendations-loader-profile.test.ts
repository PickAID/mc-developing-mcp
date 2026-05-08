import { describe, expect, it } from "vitest";

import { buildMdmPackageRecommendations } from "./mdm-package-recommendations.js";

describe("buildMdmPackageRecommendations loader datapack/resourcepack profiles", () => {
  it("prefers request loader-specific datapack profiles and filters other loaders", () => {
    const recommendations = buildMdmPackageRecommendations({
      requestText: "Need Fabric 1.20.1 datapack recipe and tag support.",
      mdmResources: mdmResources([
        profilePackage("minecraft-1.20.1-vanilla-datapack-profile", "datapack", "vanilla-datapack"),
        profilePackage("minecraft-1.20.1-fabric-datapack-profile", "datapack", "fabric-datapack"),
        profilePackage("minecraft-1.20.1-forge-datapack-profile", "datapack", "forge-datapack")
      ])
    });

    expect(recommendations.suggestions.map((suggestion) => suggestion.packageId)).toEqual([
      "minecraft-1.20.1-fabric-datapack-profile",
      "minecraft-1.20.1-vanilla-datapack-profile"
    ]);
  });

  it("uses workspace loader when request text only has the datapack task", () => {
    const recommendations = buildMdmPackageRecommendations({
      requestText: "Need 1.7.10 datapack recipe support.",
      minecraftVersion: "1.7.10",
      minecraftLoader: "forge",
      mdmResources: mdmResources([
        profilePackage("minecraft-1.7.10-vanilla-datapack-profile", "datapack", "vanilla-datapack"),
        profilePackage("minecraft-1.7.10-forge-datapack-profile", "datapack", "forge-datapack")
      ])
    });

    expect(recommendations.suggestions[0]).toMatchObject({
      packageId: "minecraft-1.7.10-forge-datapack-profile",
      matchedSignals: ["datapack"]
    });
  });

  it("falls back to vanilla resourcepack profiles when loader-specific profile is absent", () => {
    const recommendations = buildMdmPackageRecommendations({
      requestText: "Need NeoForge 26.1 client assets texture support.",
      mdmResources: mdmResources([
        profilePackage(
          "minecraft-26.1-vanilla-resourcepack-profile",
          "resourcepack",
          "vanilla-resourcepack"
        )
      ])
    });

    expect(recommendations.suggestions).toEqual([
      expect.objectContaining({
        packageId: "minecraft-26.1-vanilla-resourcepack-profile",
        matchedSignals: ["resourcepack"]
      })
    ]);
  });
});

function mdmResources(packages: ReturnType<typeof profilePackage>[]) {
  return {
    status: "available" as const,
    registryRoot: "/mdm-sources",
    cacheRoot: "/runtime/mdm",
    message: "ready",
    summary: {
      counts: {
        missing_required: 0,
        missing_optional: packages.length,
        ready: 0,
        invalid_checksum: 0,
        invalid_artifact: 0
      },
      packages
    }
  };
}

function profilePackage(
  packageId: string,
  releaseChannel: "datapack" | "resourcepack",
  releaseFamily: string
) {
  return {
    packageId,
    required: false,
    status: "missing_optional" as const,
    artifactType: "docs",
    artifactKind: "docs_bundle",
    queryAdapter: "json_docs",
    releaseChannel,
    releaseFamily,
    capabilities: [
      releaseChannel === "datapack" ? "datapack_trace" : "resourcepack_trace",
      "resource_location_lookup"
    ],
    artifactName: `${packageId}-0.1.0.mdm-resource.json`,
    message: "not cached"
  };
}
