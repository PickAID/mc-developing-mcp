import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  registerMcpServerTools,
  type McpToolHandler
} from "./mcp-tools.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("mc_develop remote metadata policy", () => {
  it("runs Modrinth metadata only when the policy is enabled", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-remote-policy-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-remote-policy-workspace-");
    const fetchUrls: string[] = [];

    registerMcpServerTools(registry, {
      modrinthApiBaseUrl: "https://api.test.modrinth.local",
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
                  url: "https://cdn.modrinth.test/sodium.jar",
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
      }
    });

    const result = await registry.calls[0].handler({
      requestText: "Find source metadata for Sodium fabric 1.20.1 on Modrinth.",
      runtimeRoot,
      workspaceRoot,
      preparationRoutes: ["modrinth"],
      preparationPolicy: {
        remoteMetadataPolicy: "enabled"
      }
    });

    expect(result.isError).toBeUndefined();
    expect(fetchUrls).toEqual([
      "https://api.test.modrinth.local/v2/project/sodium",
      "https://api.test.modrinth.local/v2/project/sodium/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%221.20.1%22%5D"
    ]);
    expect(result.structuredContent).toMatchObject({
      executions: expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          payload: expect.objectContaining({
            workItemExecutions: expect.arrayContaining([
              expect.objectContaining({
                kind: "remote_metadata",
                status: "completed",
                payload: expect.objectContaining({
                  source: "source_acquisition_remote_metadata",
                  result: expect.objectContaining({
                    source: "modrinth",
                    candidates: [
                      expect.objectContaining({
                        slug: "sodium",
                        fileName: "sodium-fabric-0.5.11+mc1.20.1.jar"
                      })
                    ]
                  })
                })
              })
            ])
          })
        })
      ])
    });
  });
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function createCapturingRegistry(): CapturingRegistry {
  const calls: RegisteredToolCall[] = [];

  return {
    calls,
    registerTool(name, _config, handler) {
      calls.push({ name, handler });
    }
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

interface CapturingRegistry {
  calls: RegisteredToolCall[];
  registerTool: (
    name: string,
    config: unknown,
    handler: McpToolHandler
  ) => void;
}

interface RegisteredToolCall {
  name: string;
  handler: McpToolHandler;
}
