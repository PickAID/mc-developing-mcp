import { describe, expect, it } from "vitest";

import type { MdmPackageRecommendations } from "../../docs/mdm-resource/mdm-package-recommendations.js";
import { buildMcpResourceActions } from "./mcp-resource-actions.js";

describe("buildMcpResourceActions", () => {
  it("exposes local vanilla source generation separately from MDM install actions", () => {
    const actions = buildMcpResourceActions(
      recommendations({
        packageId: "minecraft-1.20.1-vanilla-source-profile",
        matchedSignals: ["sources"],
        reason: "Matched vanilla source lookup request."
      }),
      { maxArrayItems: 20, maxDepth: 8, maxStringLength: 4000 },
      (value) => ({ value })
    );

    expect(actions).toMatchObject({
      policy: "recommend_before_download",
      executeWithDownloadOnlyAfterUserConfirmation: true
    });
    expect((actions as { actions: unknown[] }).actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "generate_local_minecraft_1.20.1_source_pack",
          kind: "local_vanilla_source_generation",
          safety: "requires_user_confirmation",
          packageId: "minecraft-1.20.1-source-pack-named",
          minecraftVersion: "1.20.1",
          inputPatch: {
            preparationRoutes: ["official"]
          }
        }),
        expect.objectContaining({
          id: "install_mdm_minecraft-1.20.1-vanilla-source-profile",
          kind: "mdm_release_install"
        })
      ])
    );
  });
});

function recommendations(
  suggestion: Pick<
    MdmPackageRecommendations["suggestions"][number],
    "packageId" | "matchedSignals" | "reason"
  >
): MdmPackageRecommendations {
  return {
    policy: "recommend_before_download",
    status: "available",
    message: "MDM packages are recommendations only.",
    suggestions: [
      {
        ...suggestion,
        status: "missing_optional",
        priority: "high",
        mdmReleaseInstall: {
          packageId: suggestion.packageId,
          downloadPolicy: "disabled",
          manifestPath: "/repo/mdm-release-manifest.json"
        }
      }
    ]
  };
}
