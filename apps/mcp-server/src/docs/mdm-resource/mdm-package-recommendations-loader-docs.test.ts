import { describe, expect, it } from "vitest";

import { buildMdmPackageRecommendations } from "./mdm-package-recommendations.js";

describe("buildMdmPackageRecommendations loader docs", () => {
  it("recommends loader docs for NeoForge, Forge, news, and Champion primer requests", () => {
    const recommendations = buildMdmPackageRecommendations({
      requestText:
        "Need NeoForge docs, neoforged.net/news, Forge documentation, and ChampionAsh5357 primer evidence for porting.",
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
            {
              packageId: "minecraft-loader-docs",
              required: false,
              status: "missing_optional",
              artifactType: "docs",
              artifactKind: "docs_bundle",
              queryAdapter: "sqlite_docs",
              releaseChannel: "docs",
              releaseFamily: "minecraft-loader-docs",
              capabilities: ["docs_search", "docs_direct_read"],
              artifactName: "minecraft-loader-docs-0.1.0.sqlite",
              message: "not cached"
            }
          ]
        }
      }
    });

    expect(recommendations.suggestions).toEqual([
      expect.objectContaining({
        packageId: "minecraft-loader-docs",
        priority: "high",
        matchedSignals: expect.arrayContaining(["loader-docs"]),
        mdmReleaseInstall: {
          packageId: "minecraft-loader-docs",
          downloadPolicy: "disabled",
          manifestPath: "/mdm-sources/release-out/mdm-release-manifest.json"
        }
      })
    ]);
  });
});
