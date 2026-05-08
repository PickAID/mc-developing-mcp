import { describe, expect, it } from "vitest";

import {
  runSourceAcquisitionWorkItems,
  type SourceAcquisitionWorkItem
} from "@mcpskill/source-package-manager";

import { createMcpServerSourceAcquisitionWorkItemHandlers } from "./source-acquisition-work-item-handlers.js";

describe("createMcpServerSourceAcquisitionWorkItemHandlers remote metadata", () => {
  it("resolves Modrinth remote metadata work items through the resolver", async () => {
    const fetchUrls: string[] = [];
    const handlers = createMcpServerSourceAcquisitionWorkItemHandlers({
      requestText: "Find source metadata for Sodium fabric 1.20.1 on Modrinth.",
      modrinthFetch: async (url) => {
        fetchUrls.push(url.toString());

        if (url.pathname.includes("/v2/project/sodium/version")) {
          return jsonResponse([
            {
              id: "version-id",
              version_number: "mc1.20.1-0.5.11",
              loaders: ["fabric"],
              game_versions: ["1.20.1"],
              files: [
                {
                  filename: "sodium-fabric-0.5.11+mc1.20.1.jar",
                  url: "https://cdn.modrinth.com/data/AANobbMI/versions/version-id/sodium.jar",
                  hashes: { sha512: "abc" },
                  primary: true
                }
              ]
            }
          ]);
        }

        return jsonResponse({
          id: "AANobbMI",
          slug: "sodium",
          title: "Sodium",
          downloads: 1_000_000,
          loaders: ["fabric"],
          game_versions: ["1.20.1"]
        });
      },
      modrinthApiBaseUrl: "https://api.test.modrinth.local"
    });

    const result = await runSourceAcquisitionWorkItems({
      workItems: [remoteItem("modrinth")],
      handlers
    });

    expect(fetchUrls).toEqual([
      "https://api.test.modrinth.local/v2/project/sodium",
      "https://api.test.modrinth.local/v2/project/sodium/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%221.20.1%22%5D"
    ]);
    expect(result).toMatchObject({
      status: "completed",
      executions: [
        {
          kind: "remote_metadata",
          status: "completed",
          payload: {
            source: "source_acquisition_remote_metadata",
            result: {
              source: "modrinth",
              candidates: [
                {
                  slug: "sodium",
                  fileName: "sodium-fabric-0.5.11+mc1.20.1.jar"
                }
              ]
            }
          }
        }
      ]
    });
  });

  it("returns CurseForge credential guidance without a key", async () => {
    const handlers = createMcpServerSourceAcquisitionWorkItemHandlers({
      requestText: "Find source metadata for JEI forge 1.20.1 on CurseForge."
    });

    const result = await runSourceAcquisitionWorkItems({
      workItems: [remoteItem("curseforge")],
      handlers
    });

    expect(result).toMatchObject({
      status: "completed",
      executions: [
        {
          status: "completed",
          payload: {
            result: {
              source: "curseforge",
              warnings: [
                {
                  code: "credentials_required",
                  credentialEnvVar: "CURSEFORGE_API_KEY"
                }
              ]
            }
          }
        }
      ]
    });
  });

  it("does not call remote APIs when constraints are missing", async () => {
    let calls = 0;
    const handlers = createMcpServerSourceAcquisitionWorkItemHandlers({
      requestText: "Find source metadata for Sodium on Modrinth.",
      modrinthFetch: async () => {
        calls += 1;
        return jsonResponse({});
      }
    });

    const result = await runSourceAcquisitionWorkItems({
      workItems: [remoteItem("modrinth")],
      handlers
    });

    expect(calls).toBe(0);
    expect(result.executions[0]).toMatchObject({
      status: "completed",
      payload: {
        result: {
          warnings: [
            {
              code: "needs_more_constraints"
            }
          ]
        }
      }
    });
  });
});

function remoteItem(
  source: Extract<SourceAcquisitionWorkItem, { kind: "remote_metadata" }>["source"]
): SourceAcquisitionWorkItem {
  return {
    kind: "remote_metadata",
    source,
    cacheScope: "metadata"
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}
