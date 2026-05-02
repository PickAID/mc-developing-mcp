import { describe, expect, it } from "vitest";
import {
  buildModrinthMavenArtifact,
  type ExternalModResolverResult
} from "@mcpskill/external-mod-resolver";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";
import { executeMcpServerExternalModResolution } from "./external-mod-resolution-executor.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";

describe("executeMcpServerExternalModResolution", () => {
  it("resolves Modrinth Maven metadata through the injected resolver", async () => {
    const input = await createExecutorInput(
      "Find the Modrinth Maven modImplementation coordinate for Sodium fabric 1.20.1."
    );

    const result = await executeMcpServerExternalModResolution(input, {
      modrinthResolver: async (request) => {
        expect(request).toMatchObject({
          query: "sodium",
          loader: "fabric",
          minecraftVersion: "1.20.1"
        });
        return createModrinthSodiumResult();
      }
    });

    expect(result).toMatchObject({
      matched: true,
      summary: expect.stringContaining("maven.modrinth:sodium:OihdIimA"),
      payload: {
        source: "external_mod_resolution",
        request: {
          platform: "modrinth",
          query: "sodium",
          loader: "fabric",
          minecraftVersion: "1.20.1"
        },
        result: {
          candidates: [
            {
              slug: "sodium",
              mavenArtifacts: [
                {
                  coordinates: "maven.modrinth:sodium:OihdIimA",
                  gradle: {
                    loom: {
                      modImplementation:
                        'modImplementation "maven.modrinth:sodium:OihdIimA"'
                    }
                  }
                }
              ]
            }
          ]
        }
      }
    });
  });

  it("returns CurseForge credential guidance as actionable resolver evidence", async () => {
    const input = await createExecutorInput(
      "Find the CurseMaven coordinate for JEI forge 1.20.1."
    );

    const result = await executeMcpServerExternalModResolution(input, {
      curseForgeResolver: async (request) => {
        expect(request).toMatchObject({
          slug: "jei",
          loader: "forge",
          minecraftVersion: "1.20.1"
        });
        return {
          source: "curseforge",
          query: "jei",
          candidates: [],
          warnings: [
            {
              code: "credentials_required",
              message: "CurseForge API resolution requires CURSEFORGE_API_KEY.",
              setupUrl: "https://console.curseforge.com/?#/api-keys",
              credentialEnvVar: "CURSEFORGE_API_KEY"
            }
          ]
        };
      }
    });

    expect(result).toMatchObject({
      matched: true,
      summary: expect.stringContaining("CURSEFORGE_API_KEY"),
      payload: {
        source: "external_mod_resolution",
        request: {
          platform: "curseforge",
          query: "jei",
          loader: "forge",
          minecraftVersion: "1.20.1"
        },
        result: {
          warnings: [
            {
              code: "credentials_required",
              setupUrl: "https://console.curseforge.com/?#/api-keys"
            }
          ]
        }
      }
    });
  });
});

async function createExecutorInput(requestText: string) {
  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot: "/tmp/mcpskill-runtime"
  });
  const requestPlan = buildMcpServerRequestPlan(bootstrap, requestText);
  const evidencePlan = buildMcpServerEvidencePlan(requestPlan);

  return {
    candidate: evidencePlan.candidates[0],
    evidencePlan,
    requestPlan
  };
}

function createModrinthSodiumResult(): ExternalModResolverResult {
  return {
    source: "modrinth",
    query: "sodium",
    candidates: [
      {
        source: "modrinth",
        confidence: "high",
        confidenceReasons: ["matched Modrinth slug sodium"],
        projectId: "AANobbMI",
        slug: "sodium",
        title: "Sodium",
        versionId: "OihdIimA",
        versionNumber: "mc1.20.1-0.5.13-fabric",
        loaders: ["fabric"],
        minecraftVersions: ["1.20.1"],
        fileName: "sodium-fabric.jar",
        downloadUrl: "https://cdn.modrinth.com/data/AANobbMI/versions/OihdIimA.jar",
        hashes: {
          sha512: "test-sha512"
        },
        mavenArtifacts: [
          buildModrinthMavenArtifact({
            slug: "sodium",
            projectId: "AANobbMI",
            versionId: "OihdIimA",
            versionNumber: "mc1.20.1-0.5.13-fabric"
          })
        ],
        requiresConfirmation: true,
        cachePolicy: "metadata_only"
      }
    ],
    warnings: []
  };
}
