import { describe, expect, it } from "vitest";

import { buildMdmPackageRecommendations } from "./mdm-package-recommendations.js";

describe("buildMdmPackageRecommendations version changes", () => {
  it("recommends version-change docs sourced from NeoForged primers and misode technical changes", () => {
    const recommendations = buildMdmPackageRecommendations({
      requestText:
        "Need Minecraft 26.1 version changes and migration notes from NeoForged primers and the misode changelog.",
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
              packageId: "minecraft-1.21.10-version-changes",
              required: false,
              status: "missing_optional",
              artifactType: "docs",
              artifactKind: "docs_bundle",
              queryAdapter: "sqlite_docs",
              releaseChannel: "docs",
              releaseFamily: "minecraft-version-changes",
              capabilities: ["docs_search", "docs_direct_read"],
              artifactName: "minecraft-1.21.10-version-changes-0.1.0.sqlite",
              message: "not cached"
            },
            {
              packageId: "minecraft-26.1-version-changes",
              required: false,
              status: "missing_optional",
              artifactType: "docs",
              artifactKind: "docs_bundle",
              queryAdapter: "sqlite_docs",
              releaseChannel: "docs",
              releaseFamily: "minecraft-version-changes",
              capabilities: [
                "docs_search",
                "docs_direct_read",
                "version_change_reference",
                "migration_reference",
                "neoforge_primer_reference",
                "misode_changelog_reference"
              ],
              artifactName: "minecraft-26.1-version-changes-0.1.0.sqlite",
              message: "not cached"
            }
          ]
        }
      }
    });

    expect(recommendations.suggestions).toEqual([
      expect.objectContaining({
        packageId: "minecraft-26.1-version-changes",
        priority: "high",
        matchedSignals: expect.arrayContaining(["version-changes"]),
        mdmReleaseInstall: {
          packageId: "minecraft-26.1-version-changes",
          downloadPolicy: "disabled",
          manifestPath: "/mdm-sources/release-out/mdm-release-manifest.json"
        }
      })
    ]);
  });
});
