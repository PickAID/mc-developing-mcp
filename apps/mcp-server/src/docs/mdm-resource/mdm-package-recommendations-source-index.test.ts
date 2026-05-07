import { describe, expect, it } from "vitest";

import { buildMdmPackageRecommendations } from "./mdm-package-recommendations.js";

describe("buildMdmPackageRecommendations source indexes", () => {
  it("recommends source_index_sqlite packages for source lookup requests", () => {
    const recommendations = buildMdmPackageRecommendations({
      requestText: "Need Minecraft 1.20.1 source index lookup for ItemStack methods.",
      mdmResources: {
        status: "available",
        registryRoot: "/mdm-sources",
        cacheRoot: "/runtime/mdm",
        message: "ready",
        summary: {
          counts: {
            missing_required: 0,
            missing_optional: 1,
            ready: 0,
            invalid_checksum: 0,
            invalid_artifact: 0
          },
          packages: [
            sourceIndexPackage("minecraft-1.20.1-source-index"),
            sourceIndexPackage("minecraft-1.21.1-source-index")
          ]
        }
      }
    });

    expect(recommendations.suggestions).toEqual([
      expect.objectContaining({
        packageId: "minecraft-1.20.1-source-index",
        priority: "high",
        matchedSignals: ["sources"],
        mdmReleaseInstall: {
          packageId: "minecraft-1.20.1-source-index",
          downloadPolicy: "disabled",
          manifestPath: "/mdm-sources/release-out/mdm-release-manifest.json"
        }
      })
    ]);
  });

  it("version-filters loader-specific source profile packages", () => {
    const recommendations = buildMdmPackageRecommendations({
      requestText: "Need Minecraft 1.21.1 NeoForge source lookup for ItemStack.",
      mdmResources: {
        status: "available",
        registryRoot: "/mdm-sources",
        cacheRoot: "/runtime/mdm",
        message: "ready",
        summary: {
          counts: {
            missing_required: 0,
            missing_optional: 2,
            ready: 0,
            invalid_checksum: 0,
            invalid_artifact: 0
          },
          packages: [
            sourceProfilePackage("minecraft-1.21.1-neoforge-source-profile"),
            sourceProfilePackage("minecraft-1.20.1-fabric-source-profile")
          ]
        }
      }
    });

    expect(recommendations.suggestions).toEqual([
      expect.objectContaining({
        packageId: "minecraft-1.21.1-neoforge-source-profile",
        priority: "high",
        matchedSignals: ["sources"]
      })
    ]);
  });
});

function sourceIndexPackage(packageId: string) {
  return {
    packageId,
    required: false,
    status: "missing_optional" as const,
    artifactType: "source_index",
    artifactKind: "source_index",
    queryAdapter: "source_index_sqlite",
    releaseFamily: "vanilla-source-index",
    capabilities: ["source_lookup", "source_chunk_search"],
    artifactName: `${packageId}-0.1.0.sqlite`,
    message: "not cached"
  };
}

function sourceProfilePackage(packageId: string) {
  return {
    packageId,
    required: false,
    status: "missing_optional" as const,
    artifactType: "docs",
    artifactKind: "docs_bundle",
    queryAdapter: "json_docs",
    releaseChannel: "sources",
    releaseFamily: "loader-sources",
    capabilities: ["source_lookup", "source_chunk_search"],
    artifactName: `${packageId}-0.1.0.mdm-resource.json`,
    message: "not cached"
  };
}
