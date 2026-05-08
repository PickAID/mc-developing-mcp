import { describe, expect, it } from "vitest";

import { buildMdmPackageRecommendations } from "./mdm-package-recommendations.js";

describe("buildMdmPackageRecommendations loader resource profiles", () => {
  it("prefers matching loader datapack profiles over vanilla profiles", () => {
    const recommendations = buildMdmPackageRecommendations({
      requestText: "Need NeoForge 26.1 datapack recipe and tag support.",
      mdmResources: mdmResources([
        dataProfilePackage("minecraft-26.1-vanilla-datapack-profile", "datapack", "vanilla-datapack"),
        dataProfilePackage("minecraft-26.1-neoforge-datapack-profile", "datapack", "loader-datapack"),
        dataProfilePackage("minecraft-26.1-fabric-datapack-profile", "datapack", "loader-datapack")
      ])
    });

    expect(recommendations.suggestions.map((entry) => entry.packageId)).toEqual([
      "minecraft-26.1-neoforge-datapack-profile",
      "minecraft-26.1-vanilla-datapack-profile"
    ]);
    expect(recommendations.suggestions[0]).toMatchObject({
      priority: "high",
      matchedSignals: ["datapack"],
      mdmReleaseInstall: {
        packageId: "minecraft-26.1-neoforge-datapack-profile",
        downloadPolicy: "disabled",
        manifestPath: "/mdm-sources/release-out/mdm-release-manifest.json"
      }
    });
  });

  it("falls back to vanilla resourcepack profiles when loader packages are absent", () => {
    const recommendations = buildMdmPackageRecommendations({
      requestText: "Need Forge 1.20.1 resourcepack model and texture support.",
      mdmResources: mdmResources([
        dataProfilePackage(
          "minecraft-1.20.1-vanilla-resourcepack-profile",
          "resourcepack",
          "vanilla-resourcepack"
        )
      ])
    });

    expect(recommendations.suggestions).toEqual([
      expect.objectContaining({
        packageId: "minecraft-1.20.1-vanilla-resourcepack-profile",
        priority: "high",
        matchedSignals: ["resourcepack"]
      })
    ]);
  });
});

function mdmResources(packages: ReturnType<typeof dataProfilePackage>[]) {
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

function dataProfilePackage(
  packageId: string,
  channel: "datapack" | "resourcepack",
  family: string
) {
  return {
    packageId,
    required: false,
    status: "missing_optional" as const,
    artifactType: channel,
    artifactKind: `${channel}_bundle`,
    queryAdapter: "archive_content",
    releaseChannel: channel,
    releaseFamily: family,
    capabilities: [
      "resource_location_lookup",
      channel === "datapack" ? "datapack_trace" : "resourcepack_trace"
    ],
    artifactName: `${packageId}-0.1.0.mdm-resource.json`,
    message: "not cached"
  };
}
