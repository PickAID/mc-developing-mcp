import { describe, expect, it } from "vitest";

import { resolveModrinthMod } from "./modrinth.js";

describe("resolveModrinthMod search ranking", () => {
  it("selects a normalized exact title match from multiple Modrinth search hits", async () => {
    const requests: string[] = [];
    const result = await resolveModrinthMod({
      query: "energy api",
      loader: "fabric",
      minecraftVersion: "1.20.1",
      fetch: async (url) => {
        requests.push(url.toString());

        if (url.toString().includes("/v2/project/energy%20api")) {
          return new Response(null, { status: 404 });
        }

        if (url.toString().includes("/v2/search")) {
          return jsonResponse({
            total_hits: 3,
            hits: [
              {
                project_id: "project-other",
                slug: "energy-control",
                title: "Energy Control",
                project_type: "mod",
                downloads: 9000
              },
              {
                project_id: "project-energy-api",
                slug: "energy-api",
                title: "Energy API",
                project_type: "mod",
                downloads: 1000
              },
              {
                project_id: "project-power",
                slug: "energized-power",
                title: "Energized Power",
                project_type: "mod",
                downloads: 8000
              }
            ]
          });
        }

        return jsonResponse([
          {
            id: "version-energy-api",
            version_number: "1.0.0+1.20.1",
            loaders: ["fabric"],
            game_versions: ["1.20.1"],
            files: [
              {
                primary: true,
                filename: "energy-api-1.0.0+1.20.1.jar",
                url: "https://cdn.modrinth.com/data/project-energy-api/versions/version-energy-api/energy-api.jar",
                hashes: {
                  sha1: "sha1-energy-api"
                }
              }
            ]
          }
        ]);
      }
    });

    expect(requests).toHaveLength(3);
    expect(requests[1]).toContain("/v2/search");
    expect(requests[2]).toContain("/v2/project/energy-api/version");
    expect(result).toMatchObject({
      source: "modrinth",
      query: "energy api",
      warnings: [],
      candidates: [
        {
          projectId: "project-energy-api",
          slug: "energy-api",
          title: "Energy API",
          versionId: "version-energy-api",
          fileName: "energy-api-1.0.0+1.20.1.jar"
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
