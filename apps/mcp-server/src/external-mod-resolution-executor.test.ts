import { describe, expect, it } from "vitest";
import {
  buildModrinthMavenArtifact,
  buildRepositoryMavenArtifact,
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
          query: "jei",
          loader: "forge",
          minecraftVersion: "1.20.1"
        });
        expect(request.slug).toBeUndefined();
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

  it("passes broad CurseForge queries without a slug so ambiguity can be reported", async () => {
    const input = await createExecutorInput(
      "Find the CurseForge mod energy forge 1.20.1."
    );

    const result = await executeMcpServerExternalModResolution(input, {
      curseForgeResolver: async (request) => {
        expect(request).toMatchObject({
          query: "energy",
          loader: "forge",
          minecraftVersion: "1.20.1"
        });
        expect(request.slug).toBeUndefined();
        return {
          source: "curseforge",
          query: "energy",
          candidates: [],
          warnings: [
            {
              code: "ambiguous_project_match",
              message:
                "CurseForge query energy matched multiple projects; choose an exact slug or project id."
            }
          ]
        };
      }
    });

    expect(result).toMatchObject({
      matched: true,
      summary:
        "CurseForge query energy matched multiple projects; choose an exact slug or project id.",
      payload: {
        source: "external_mod_resolution",
        request: {
          platform: "curseforge",
          query: "energy",
          loader: "forge",
          minecraftVersion: "1.20.1"
        },
        result: {
          warnings: [
            {
              code: "ambiguous_project_match"
            }
          ]
        }
      }
    });
  });

  it("passes CurseForge URL slugs as exact slug constraints", async () => {
    const input = await createExecutorInput(
      "Find CurseMaven for https://www.curseforge.com/minecraft/mc-mods/jei forge 1.20.1."
    );

    const result = await executeMcpServerExternalModResolution(input, {
      curseForgeResolver: async (request) => {
        expect(request).toMatchObject({
          slug: "jei",
          query: "jei",
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
              credentialEnvVar: "CURSEFORGE_API_KEY"
            }
          ]
        };
      }
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "external_mod_resolution",
        request: {
          platform: "curseforge",
          slug: "jei",
          query: "jei",
          loader: "forge",
          minecraftVersion: "1.20.1"
        }
      }
    });
  });

  it("passes explicit CurseForge project ids to the resolver", async () => {
    const input = await createExecutorInput(
      "Find CurseMaven for project id 238222 forge 1.20.1."
    );

    const result = await executeMcpServerExternalModResolution(input, {
      curseForgeResolver: async (request) => {
        expect(request).toMatchObject({
          projectId: "238222",
          query: "238222",
          loader: "forge",
          minecraftVersion: "1.20.1"
        });
        expect(request.slug).toBeUndefined();
        return {
          source: "curseforge",
          query: "238222",
          candidates: [],
          warnings: []
        };
      }
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "external_mod_resolution",
        request: {
          platform: "curseforge",
          projectId: "238222",
          query: "238222",
          loader: "forge",
          minecraftVersion: "1.20.1"
        }
      }
    });
  });

  it("resolves explicit Maven coordinates before remote project search", async () => {
    const input = await createExecutorInput(
      'Use modImplementation "com.example:demo-mod:1.2.3" from https://maven.example/releases.'
    );

    const result = await executeMcpServerExternalModResolution(input, {
      mavenResolver: async (request) => {
        expect(request).toMatchObject({
          coordinate: "com.example:demo-mod:1.2.3",
          repositories: [
            {
              name: "requested-maven-repository",
              url: "https://maven.example/releases"
            }
          ]
        });
        return createMavenResult();
      },
      modrinthResolver: async () => {
        throw new Error("Explicit Maven coordinates must not search Modrinth.");
      },
      curseForgeResolver: async () => {
        throw new Error("Explicit Maven coordinates must not search CurseForge.");
      }
    });

    expect(result).toMatchObject({
      matched: true,
      summary: expect.stringContaining("com.example:demo-mod:1.2.3"),
      payload: {
        source: "external_mod_resolution",
        request: {
          platform: "maven",
          coordinate: "com.example:demo-mod:1.2.3",
          repositoryUrls: ["https://maven.example/releases"]
        },
        result: {
          source: "maven",
          candidates: [
            {
              source: "maven",
              fileName: "demo-mod-1.2.3.jar",
              downloadUrl:
                "https://maven.example/releases/com/example/demo-mod/1.2.3/demo-mod-1.2.3.jar"
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

function createMavenResult(): ExternalModResolverResult {
  return {
    source: "maven",
    query: "com.example:demo-mod:1.2.3",
    candidates: [
      {
        source: "maven",
        confidence: "high",
        confidenceReasons: [
          "parsed exact Maven coordinate com.example:demo-mod:1.2.3"
        ],
        projectId: "com.example:demo-mod",
        slug: "demo-mod",
        title: "com.example:demo-mod",
        versionId: "1.2.3",
        versionNumber: "1.2.3",
        loaders: [],
        minecraftVersions: [],
        fileName: "demo-mod-1.2.3.jar",
        downloadUrl:
          "https://maven.example/releases/com/example/demo-mod/1.2.3/demo-mod-1.2.3.jar",
        hashes: {},
        mavenArtifacts: [
          buildRepositoryMavenArtifact({
            repositoryName: "Example Maven",
            repositoryUrl: "https://maven.example/releases",
            group: "com.example",
            artifact: "demo-mod",
            version: "1.2.3"
          })
        ],
        requiresConfirmation: true,
        cachePolicy: "metadata_only"
      }
    ],
    warnings: []
  };
}
