import { describe, expect, it } from "vitest";

import { resolveModrinthMod } from "./modrinth.js";

describe("resolveModrinthMod", () => {
  it("resolves an exact Modrinth slug through the project API before search", async () => {
    const requests: string[] = [];
    const result = await resolveModrinthMod({
      query: "sodium",
      loader: "fabric",
      minecraftVersion: "1.20.1",
      fetch: async (url) => {
        requests.push(url.toString());

        if (url.toString().includes("/v2/search")) {
          throw new Error("Exact Modrinth slugs should not use search first.");
        }

        if (url.toString().includes("/version")) {
          return jsonResponse([
            {
              id: "OihdIimA",
              version_number: "mc1.20.1-0.5.13-fabric",
              loaders: ["fabric"],
              game_versions: ["1.20.1"],
              files: [
                {
                  primary: true,
                  filename: "sodium-fabric-0.5.13+mc1.20.1.jar",
                  url: "https://cdn.modrinth.com/data/AANobbMI/versions/OihdIimA/sodium.jar",
                  hashes: {
                    sha1: "sha1-fixture"
                  }
                }
              ]
            }
          ]);
        }

        return jsonResponse({
          id: "AANobbMI",
          slug: "sodium",
          title: "Sodium",
          project_type: "mod",
          downloads: 148390564
        });
      }
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]).toBe("https://api.modrinth.com/v2/project/sodium");
    expect(requests[1]).toContain("/v2/project/sodium/version");
    expect(result).toMatchObject({
      source: "modrinth",
      query: "sodium",
      warnings: [],
      candidates: [
        {
          projectId: "AANobbMI",
          slug: "sodium",
          versionId: "OihdIimA",
          fileName: "sodium-fabric-0.5.13+mc1.20.1.jar"
        }
      ]
    });
  });

  it("resolves a Modrinth slug to a primary jar candidate for the requested loader and Minecraft version", async () => {
    const requests: string[] = [];
    const result = await resolveModrinthMod({
      query: "sodium",
      loader: "fabric",
      minecraftVersion: "1.20.1",
      fetch: async (url) => {
        requests.push(url.toString());

        if (url.toString().endsWith("/v2/project/sodium")) {
          return jsonResponse({
            id: "AANobbMI",
            slug: "sodium",
            title: "Sodium",
            project_type: "mod",
            downloads: 148390564
          });
        }

        return jsonResponse([
          {
            id: "OihdIimA",
            version_number: "mc1.20.1-0.5.13-fabric",
            loaders: ["fabric", "quilt"],
            game_versions: ["1.20.1"],
            files: [
              {
                primary: true,
                filename: "sodium-fabric-0.5.13+mc1.20.1.jar",
                url: "https://cdn.modrinth.com/data/AANobbMI/versions/OihdIimA/sodium.jar",
                hashes: {
                  sha1: "sha1-fixture",
                  sha512: "sha512-fixture"
                }
              }
            ]
          }
        ]);
      }
    });

    expect(requests[0]).toBe("https://api.modrinth.com/v2/project/sodium");
    expect(requests[1]).toContain("/v2/project/sodium/version");
    expect(requests[1]).toContain("loaders=%5B%22fabric%22%5D");
    expect(requests[1]).toContain("game_versions=%5B%221.20.1%22%5D");
    expect(result).toMatchObject({
      source: "modrinth",
      query: "sodium",
      candidates: [
        {
          source: "modrinth",
          confidence: "high",
          confidenceReasons: [
            "matched Modrinth slug sodium",
            "matched loader fabric",
            "matched Minecraft 1.20.1",
            "selected primary jar file"
          ],
          projectId: "AANobbMI",
          slug: "sodium",
          title: "Sodium",
          versionId: "OihdIimA",
          versionNumber: "mc1.20.1-0.5.13-fabric",
          loaders: ["fabric", "quilt"],
          minecraftVersions: ["1.20.1"],
          fileName: "sodium-fabric-0.5.13+mc1.20.1.jar",
          downloadUrl: "https://cdn.modrinth.com/data/AANobbMI/versions/OihdIimA/sodium.jar",
          hashes: {
            sha1: "sha1-fixture",
            sha512: "sha512-fixture"
          },
          mavenArtifacts: [
            {
              source: "modrinth-maven",
              repositoryName: "Modrinth Maven",
              repositoryUrl: "https://api.modrinth.com/maven",
              group: "maven.modrinth",
              artifact: "sodium",
              version: "OihdIimA",
              coordinates: "maven.modrinth:sodium:OihdIimA",
              aliases: [
                "maven.modrinth:sodium:mc1.20.1-0.5.13-fabric",
                "maven.modrinth:AANobbMI:OihdIimA",
                "maven.modrinth:AANobbMI:mc1.20.1-0.5.13-fabric"
              ],
              gradle: {
                repositoryGroovy:
                  "maven { url = \"https://api.modrinth.com/maven\" }",
                repositoryKotlin: "maven(\"https://api.modrinth.com/maven\")",
                loom: {
                  modImplementation:
                    "modImplementation \"maven.modrinth:sodium:OihdIimA\"",
                  modCompileOnly:
                    "modCompileOnly \"maven.modrinth:sodium:OihdIimA\"",
                  modRuntimeOnly:
                    "modRuntimeOnly \"maven.modrinth:sodium:OihdIimA\"",
                  modLocalRuntime:
                    "modLocalRuntime \"maven.modrinth:sodium:OihdIimA\""
                },
                forgeGradle: {
                  implementationFgDeobf:
                    "implementation fg.deobf(\"maven.modrinth:sodium:OihdIimA\")",
                  compileOnlyFgDeobf:
                    "compileOnly fg.deobf(\"maven.modrinth:sodium:OihdIimA\")",
                  runtimeOnlyFgDeobf:
                    "runtimeOnly fg.deobf(\"maven.modrinth:sodium:OihdIimA\")"
                }
              }
            }
          ],
          requiresConfirmation: true,
          cachePolicy: "metadata_only"
        }
      ],
      warnings: []
    });
  });

  it("returns a compact unresolved result when no compatible Modrinth version exists", async () => {
    const result = await resolveModrinthMod({
      query: "sodium",
      loader: "neoforge",
      minecraftVersion: "1.20.1",
      fetch: async (url) => {
        if (url.toString().endsWith("/v2/project/sodium")) {
          return jsonResponse({
            id: "AANobbMI",
            slug: "sodium",
            title: "Sodium",
            project_type: "mod",
            downloads: 148390564
          });
        }

        return jsonResponse([]);
      }
    });

    expect(result).toMatchObject({
      source: "modrinth",
      query: "sodium",
      candidates: [],
      warnings: [
        {
          code: "no_compatible_version",
          message:
            "Modrinth project sodium has no version matching loader neoforge and Minecraft 1.20.1."
        }
      ]
    });
  });

  it("reports ambiguous Modrinth search hits without selecting the first unrelated project", async () => {
    const requests: string[] = [];
    const result = await resolveModrinthMod({
      query: "energy",
      loader: "fabric",
      minecraftVersion: "1.20.1",
      fetch: async (url) => {
        requests.push(url.toString());

        if (url.toString().endsWith("/v2/project/energy")) {
          return new Response(null, { status: 404 });
        }

        return jsonResponse({
          total_hits: 3,
          hits: [
            {
              project_id: "project-a",
              slug: "energy-api",
              title: "Energy API",
              project_type: "mod",
              downloads: 3000
            },
            {
              project_id: "project-b",
              slug: "energy-control",
              title: "Energy Control",
              project_type: "mod",
              downloads: 2000
            },
            {
              project_id: "project-c",
              slug: "energized-power",
              title: "Energized Power",
              project_type: "mod",
              downloads: 1000
            }
          ]
        });
      }
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]).toBe("https://api.modrinth.com/v2/project/energy");
    expect(requests[1]).toContain("/v2/search");
    expect(result).toMatchObject({
      source: "modrinth",
      query: "energy",
      candidates: [],
      warnings: [
        {
          code: "ambiguous_project_match",
          message:
            "Modrinth query energy matched multiple projects; choose an exact slug or project id.",
          projectHints: [
            {
              source: "modrinth",
              projectId: "project-a",
              slug: "energy-api",
              title: "Energy API",
              downloads: 3000
            },
            {
              source: "modrinth",
              projectId: "project-b",
              slug: "energy-control",
              title: "Energy Control",
              downloads: 2000
            },
            {
              source: "modrinth",
              projectId: "project-c",
              slug: "energized-power",
              title: "Energized Power",
              downloads: 1000
            }
          ]
        }
      ]
    });
  });

  it("uses an exact Modrinth project id match instead of reporting ambiguity", async () => {
    const requests: string[] = [];
    const result = await resolveModrinthMod({
      query: "project-a",
      loader: "fabric",
      minecraftVersion: "1.20.1",
      fetch: async (url) => {
        requests.push(url.toString());

        if (url.toString().endsWith("/v2/project/project-a")) {
          return jsonResponse({
            id: "project-a",
            slug: "energy-api",
            title: "Energy API",
            project_type: "mod",
            downloads: 3000
          });
        }

        return jsonResponse([
          {
            id: "version-a",
            version_number: "1.0.0",
            loaders: ["fabric"],
            game_versions: ["1.20.1"],
            files: [
              {
                primary: true,
                filename: "energy-api-1.0.0.jar",
                url: "https://cdn.modrinth.com/data/project-a/versions/version-a/energy-api.jar",
                hashes: {
                  sha1: "sha1-fixture"
                }
              }
            ]
          }
        ]);
      }
    });

    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain("/v2/project/energy-api/version");
    expect(result).toMatchObject({
      source: "modrinth",
      query: "project-a",
      warnings: [],
      candidates: [
        {
          projectId: "project-a",
          slug: "energy-api",
          title: "Energy API",
          versionId: "version-a",
          fileName: "energy-api-1.0.0.jar"
        }
      ]
    });
  });

  it("selects a runtime jar instead of a primary Modrinth sources jar", async () => {
    const result = await resolveModrinthMod({
      query: "demo-mod",
      loader: "fabric",
      minecraftVersion: "1.20.1",
      fetch: async (url) => {
        if (url.toString().endsWith("/v2/project/demo-mod")) {
          return jsonResponse({
            id: "project-demo",
            slug: "demo-mod",
            title: "Demo Mod",
            project_type: "mod",
            downloads: 42
          });
        }

        return jsonResponse([
          {
            id: "version-demo",
            version_number: "1.0.0",
            loaders: ["fabric"],
            game_versions: ["1.20.1"],
            files: [
              {
                primary: true,
                filename: "demo-mod-1.0.0-sources.jar",
                file_type: "sources-jar",
                url: "https://cdn.modrinth.com/data/project-demo/versions/version-demo/demo-mod-sources.jar",
                hashes: {
                  sha1: "sources-sha1"
                }
              },
              {
                primary: false,
                filename: "demo-mod-1.0.0.jar",
                file_type: null,
                url: "https://cdn.modrinth.com/data/project-demo/versions/version-demo/demo-mod.jar",
                hashes: {
                  sha1: "runtime-sha1"
                }
              }
            ]
          }
        ]);
      }
    });

    expect(result).toMatchObject({
      source: "modrinth",
      query: "demo-mod",
      warnings: [],
      candidates: [
        {
          projectId: "project-demo",
          slug: "demo-mod",
          versionId: "version-demo",
          fileName: "demo-mod-1.0.0.jar",
          downloadUrl:
            "https://cdn.modrinth.com/data/project-demo/versions/version-demo/demo-mod.jar",
          hashes: {
            sha1: "runtime-sha1"
          }
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
