import { describe, expect, it } from "vitest";

import { buildMdmPackageRecommendations } from "./mdm-package-recommendations.js";

describe("buildMdmPackageRecommendations shader docs", () => {
  it("recommends shader-dev docs for GLSL, ray marching, and SDF requests", () => {
    const recommendations = buildMdmPackageRecommendations({
      requestText:
        "Need shader-dev GLSL docs for ray marching SDF scenes and WebGL2 fragment shader pitfalls.",
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
              packageId: "shader-dev-docs",
              required: false,
              status: "missing_optional",
              artifactType: "docs",
              artifactKind: "docs_bundle",
              queryAdapter: "sqlite_docs",
              releaseChannel: "docs",
              releaseFamily: "shader-dev-docs",
              capabilities: [
                "docs_search",
                "docs_direct_read",
                "shader_reference",
                "glsl_reference"
              ],
              artifactName: "shader-dev-docs-0.1.0.sqlite",
              message: "not cached"
            }
          ]
        }
      }
    });

    expect(recommendations.suggestions).toEqual([
      expect.objectContaining({
        packageId: "shader-dev-docs",
        priority: "high",
        matchedSignals: expect.arrayContaining(["shader-docs"]),
        mdmReleaseInstall: {
          packageId: "shader-dev-docs",
          downloadPolicy: "disabled",
          manifestPath: "/mdm-sources/release-out/mdm-release-manifest.json"
        }
      })
    ]);
  });
});
