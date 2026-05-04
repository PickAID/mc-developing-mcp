import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";
import { executeMcpServerExternalModResolution } from "./external-mod-resolution-executor.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("executeMcpServerExternalModResolution runtime crash context", () => {
  it("uses workspace loader and Minecraft version for crash loader mod ids", async () => {
    const workspaceRoot = await createFabricWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      [
        "Find Modrinth Maven coordinates for the missing crash dependency.",
        "Crash log loader mod ids: fabric-api"
      ].join("\n")
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "external_mod_resolution"
    );

    if (!candidate) {
      throw new Error("Expected external_mod_resolution candidate.");
    }

    const result = await executeMcpServerExternalModResolution(
      { candidate, evidencePlan, requestPlan },
      {
        modrinthResolver: async (request) => {
          expect(request).toMatchObject({
            query: "fabric-api",
            loader: "fabric",
            minecraftVersion: "1.20.1"
          });

          return {
            source: "modrinth",
            query: request.query,
            candidates: [],
            warnings: []
          };
        }
      }
    );

    expect(result).toMatchObject({
      matched: true,
      summary: "No external mod candidates matched fabric-api.",
      payload: {
        source: "external_mod_resolution",
        request: {
          platform: "modrinth",
          query: "fabric-api",
          loader: "fabric",
          minecraftVersion: "1.20.1"
        }
      }
    });
  });
});

async function createFabricWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-extmod-runtime-"));
  tempRoots.push(workspaceRoot);
  await writeText(
    join(workspaceRoot, "build.gradle"),
    [
      "plugins { id 'fabric-loom' }",
      "minecraft_version = '1.20.1'",
      ""
    ].join("\n")
  );
  return workspaceRoot;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
