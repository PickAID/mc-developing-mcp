import { describe, expect, it } from "vitest";

import { resolveCurseForgeMod } from "./curseforge.js";

describe("resolveCurseForgeMod", () => {
  it("returns a setup hint when no CurseForge API key is configured", async () => {
    await expect(
      resolveCurseForgeMod({
        slug: "jei",
        loader: "forge",
        minecraftVersion: "1.20.1",
        credentialProvider: () => undefined
      })
    ).resolves.toMatchObject({
      source: "curseforge",
      query: "jei",
      candidates: [],
      warnings: [
        {
          code: "credentials_required",
          message:
            "CurseForge API resolution requires CURSEFORGE_API_KEY. Create one at https://console.curseforge.com/?#/api-keys.",
          setupUrl: "https://console.curseforge.com/?#/api-keys",
          credentialEnvVar: "CURSEFORGE_API_KEY"
        }
      ]
    });
  });

  it("resolves a CurseForge slug to a CurseMaven candidate for the requested loader and Minecraft version", async () => {
    const requests: string[] = [];
    const result = await resolveCurseForgeMod({
      slug: "jei",
      loader: "forge",
      minecraftVersion: "1.20.1",
      credentialProvider: () => "test-key",
      fetch: async (url, init) => {
        requests.push(`${url.toString()}|${init?.headers instanceof Headers}`);
        expect((init?.headers as Record<string, string>)["x-api-key"]).toBe(
          "test-key"
        );

        if (url.toString().includes("/v1/mods/search")) {
          return jsonResponse({
            data: [
              {
                id: 238222,
                name: "Just Enough Items (JEI)",
                slug: "jei",
                classId: 6
              }
            ]
          });
        }

        return jsonResponse({
          data: [
            {
              id: 7920915,
              displayName: "15.20.0.130 for Forge 1.20.1",
              fileName: "jei-1.20.1-forge-15.20.0.130.jar",
              downloadUrl: "https://mediafilez.forgecdn.net/files/7920/915/jei.jar",
              gameVersions: ["1.20.1", "Forge"],
              hashes: [
                {
                  algo: 1,
                  value: "sha1-fixture"
                },
                {
                  algo: 2,
                  value: "md5-fixture"
                }
              ]
            },
            {
              id: 7920913,
              displayName: "15.20.0.130 for Fabric 1.20.1",
              fileName: "jei-1.20.1-fabric-15.20.0.130.jar",
              downloadUrl: "https://mediafilez.forgecdn.net/files/7920/913/jei.jar",
              gameVersions: ["Fabric", "1.20.1"],
              hashes: []
            }
          ]
        });
      }
    });

    expect(requests[0]).toContain("/v1/mods/search");
    expect(requests[0]).toContain("classId=6");
    expect(requests[0]).toContain("slug=jei");
    expect(requests[1]).toContain("/v1/mods/238222/files");
    expect(requests[1]).toContain("gameVersion=1.20.1");
    expect(result).toMatchObject({
      source: "curseforge",
      query: "jei",
      warnings: [],
      candidates: [
        {
          source: "curseforge",
          confidence: "high",
          confidenceReasons: [
            "matched CurseForge slug jei",
            "matched loader forge",
            "matched Minecraft 1.20.1",
            "selected jar file"
          ],
          projectId: "238222",
          slug: "jei",
          title: "Just Enough Items (JEI)",
          versionId: "7920915",
          versionNumber: "15.20.0.130 for Forge 1.20.1",
          loaders: ["forge"],
          minecraftVersions: ["1.20.1"],
          fileName: "jei-1.20.1-forge-15.20.0.130.jar",
          hashes: {
            sha1: "sha1-fixture",
            md5: "md5-fixture"
          },
          mavenArtifacts: [
            {
              source: "cursemaven",
              repositoryName: "CurseMaven",
              repositoryUrl: "https://cursemaven.com",
              group: "curse.maven",
              artifact: "jei-238222",
              version: "7920915",
              coordinates: "curse.maven:jei-238222:7920915",
              gradle: {
                repositoryGroovy: "maven { url = \"https://cursemaven.com\" }",
                loom: {
                  modImplementation:
                    "modImplementation \"curse.maven:jei-238222:7920915\""
                },
                forgeGradle: {
                  implementationFgDeobf:
                    "implementation fg.deobf(\"curse.maven:jei-238222:7920915\")"
                }
              }
            }
          ],
          requiresConfirmation: true,
          cachePolicy: "metadata_only"
        }
      ]
    });
  });

  it("reports ambiguous broad CurseForge search hits without selecting the first unrelated project", async () => {
    const requests: string[] = [];
    const result = await resolveCurseForgeMod({
      query: "energy",
      loader: "forge",
      minecraftVersion: "1.20.1",
      credentialProvider: () => "test-key",
      fetch: async (url) => {
        requests.push(url.toString());
        return jsonResponse({
          data: [
            {
              id: 1001,
              name: "Energy API",
              slug: "energy-api",
              classId: 6
            },
            {
              id: 1002,
              name: "Energy Control",
              slug: "energy-control",
              classId: 6
            }
          ]
        });
      }
    });

    expect(requests).toHaveLength(1);
    expect(result).toMatchObject({
      source: "curseforge",
      query: "energy",
      candidates: [],
      warnings: [
        {
          code: "ambiguous_project_match",
          message:
            "CurseForge query energy matched multiple projects; choose an exact slug or project id.",
          projectHints: [
            {
              source: "curseforge",
              projectId: "1001",
              slug: "energy-api",
              title: "Energy API"
            },
            {
              source: "curseforge",
              projectId: "1002",
              slug: "energy-control",
              title: "Energy Control"
            }
          ]
        }
      ]
    });
  });

  it("fetches a CurseForge file download URL when the selected file omits it", async () => {
    const requests: string[] = [];
    const result = await resolveCurseForgeMod({
      slug: "jei",
      loader: "forge",
      minecraftVersion: "1.20.1",
      credentialProvider: () => "test-key",
      fetch: async (url) => {
        requests.push(url.toString());

        if (url.toString().includes("/v1/mods/search")) {
          return jsonResponse({
            data: [
              {
                id: 238222,
                name: "Just Enough Items (JEI)",
                slug: "jei",
                classId: 6
              }
            ]
          });
        }

        if (url.toString().includes("/download-url")) {
          return jsonResponse({
            data: "https://mediafilez.forgecdn.net/files/7920/915/jei.jar"
          });
        }

        return jsonResponse({
          data: [
            {
              id: 7920915,
              displayName: "15.20.0.130 for Forge 1.20.1",
              fileName: "jei-1.20.1-forge-15.20.0.130.jar",
              gameVersions: ["1.20.1", "Forge"],
              hashes: []
            }
          ]
        });
      }
    });

    expect(requests).toHaveLength(3);
    expect(requests[2]).toContain("/v1/mods/238222/files/7920915/download-url");
    expect(result).toMatchObject({
      source: "curseforge",
      query: "jei",
      warnings: [],
      candidates: [
        {
          source: "curseforge",
          projectId: "238222",
          versionId: "7920915",
          fileName: "jei-1.20.1-forge-15.20.0.130.jar",
          downloadUrl: "https://mediafilez.forgecdn.net/files/7920/915/jei.jar"
        }
      ]
    });
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}
