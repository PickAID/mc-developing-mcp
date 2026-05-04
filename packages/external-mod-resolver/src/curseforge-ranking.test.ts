import { describe, expect, it } from "vitest";

import { resolveCurseForgeMod } from "./curseforge.js";

describe("resolveCurseForgeMod search ranking", () => {
  it("selects a normalized exact name match from multiple CurseForge search hits", async () => {
    const requests: string[] = [];
    const result = await resolveCurseForgeMod({
      query: "energy api",
      loader: "forge",
      minecraftVersion: "1.20.1",
      credentialProvider: () => "test-key",
      fetch: async (url) => {
        requests.push(url.toString());

        if (url.toString().includes("/v1/mods/search")) {
          return jsonResponse({
            data: [
              {
                id: 2001,
                name: "Energy Control",
                slug: "energy-control",
                classId: 6
              },
              {
                id: 2002,
                name: "Energy API",
                slug: "energy-api",
                classId: 6
              },
              {
                id: 2003,
                name: "Energized Power",
                slug: "energized-power",
                classId: 6
              }
            ]
          });
        }

        return jsonResponse({
          data: [
            {
              id: 9001,
              displayName: "1.0.0 for Forge 1.20.1",
              fileName: "energy-api-1.0.0-forge-1.20.1.jar",
              downloadUrl: "https://mediafilez.forgecdn.net/files/9000/001/energy-api.jar",
              gameVersions: ["1.20.1", "Forge"],
              hashes: [
                {
                  algo: 1,
                  value: "sha1-energy-api"
                }
              ]
            }
          ]
        });
      }
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]).toContain("/v1/mods/search");
    expect(requests[0]).toContain("searchFilter=energy+api");
    expect(requests[1]).toContain("/v1/mods/2002/files");
    expect(result).toMatchObject({
      source: "curseforge",
      query: "energy api",
      warnings: [],
      candidates: [
        {
          projectId: "2002",
          slug: "energy-api",
          title: "Energy API",
          versionId: "9001",
          fileName: "energy-api-1.0.0-forge-1.20.1.jar",
          downloadUrl:
            "https://mediafilez.forgecdn.net/files/9000/001/energy-api.jar",
          hashes: {
            sha1: "sha1-energy-api"
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
