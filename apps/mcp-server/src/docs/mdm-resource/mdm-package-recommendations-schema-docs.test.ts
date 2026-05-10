import { describe, expect, it } from "vitest";

import { buildMdmPackageRecommendations } from "./mdm-package-recommendations.js";

describe("buildMdmPackageRecommendations vanilla schema docs", () => {
  it("recommends upstream vanilla schema docs for datapack and assets explanations", () => {
    const recommendations = buildMdmPackageRecommendations({
      requestText:
        "Explain datapack recipe JSON and assets model schema using vanilla-mcdoc and misode logic.",
      mdmResources: mdmResources([
        docsPackage(
          "vanilla-schema-docs",
          [
            "docs_search",
            "schema_reference",
            "mcdoc_reference",
            "datapack_trace",
            "resourcepack_trace"
          ],
          "vanilla-schema-docs"
        ),
        docsPackage(
          "misode-generator-catalog",
          [
            "docs_search",
            "schema_reference",
            "datapack_trace",
            "resourcepack_trace"
          ],
          "misode-generator-catalog"
        ),
        docsPackage("core-docs-search-sqlite", ["docs"], "core-docs")
      ])
    });

    expect(recommendations.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageId: "vanilla-schema-docs",
          priority: "high",
          matchedSignals: expect.arrayContaining([
            "datapack",
            "resourcepack",
            "schema-docs"
          ]),
          mdmReleaseInstall: {
            packageId: "vanilla-schema-docs",
            downloadPolicy: "disabled",
            manifestPath: "/mdm-sources/release-out/mdm-release-manifest.json"
          }
        }),
        expect.objectContaining({
          packageId: "misode-generator-catalog",
          priority: "high",
          matchedSignals: expect.arrayContaining([
            "datapack",
            "resourcepack",
            "schema-docs"
          ]),
          mdmReleaseInstall: {
            packageId: "misode-generator-catalog",
            downloadPolicy: "disabled",
            manifestPath: "/mdm-sources/release-out/mdm-release-manifest.json"
          }
        })
      ])
    );
    expect(recommendations.suggestions[0]).toMatchObject({
      priority: "high",
      matchedSignals: expect.arrayContaining(["schema-docs"])
    });
  });
});

function mdmResources(packages: ReturnType<typeof docsPackage>[]) {
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

function docsPackage(
  packageId: string,
  capabilities: string[],
  releaseFamily: string
) {
  return {
    packageId,
    required: false,
    status: "missing_optional" as const,
    artifactType: "docs",
    artifactKind: "docs_bundle",
    queryAdapter: "json_docs",
    releaseChannel: "docs" as const,
    releaseFamily,
    capabilities,
    artifactName: `${packageId}-0.1.0.mdm-resource.json`,
    message: "not cached"
  };
}
