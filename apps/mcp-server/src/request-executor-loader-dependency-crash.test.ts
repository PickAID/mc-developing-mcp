import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { executeMcpServerRequest } from "./request-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("executeMcpServerRequest loader dependency crash chaining", () => {
  it("chains missing loader dependency mod ids into external mod resolution", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createFabricCrashWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: "The modpack crashes during startup; inspect latest.log.",
      contextQuery: {
        externalModResolutionExecutor: ({ candidate, requestPlan }) => {
          expect(requestPlan.requestText).toContain(
            "Crash log loader mod ids: fabric-api"
          );
          expect(requestPlan.requestText).toContain(
            "Crash log loader dependency: modId=fabric-api; requestedBy=demo_addon; expected=any version; actual=missing; kind=missing_dependency"
          );

          return {
            matched: true,
            summary: "Resolved fabric-api from crash context.",
            payload: {
              source: "external_mod_resolution",
              candidateId: candidate.id,
              requestText: requestPlan.requestText
            }
          };
        }
      }
    });

    expect(result.executions).toMatchObject([
      {
        routeStep: "log_files",
        status: "context",
        payload: {
          source: "workspace_analyze",
          signals: {
            loaderModReferences: [
              {
                modId: "fabric-api",
                requestedBy: "demo_addon",
                kind: "missing_dependency"
              }
            ]
          }
        }
      },
      {
        routeStep: "external_mod_resolution",
        status: "selected",
        payload: {
          source: "external_mod_resolution",
          candidateId: "candidate-2-external_mod_resolution"
        }
      }
    ]);
    expect(result.trace).toMatchObject({
      routeSteps: [
        "log_files",
        "external_mod_resolution",
        "workspace_source",
        "docs_lookup"
      ],
      selectedCandidateId: "candidate-2-external_mod_resolution"
    });
  });
});

async function createFabricCrashWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-loader-crash-");

  await writeText(
    join(workspaceRoot, "build.gradle"),
    [
      "plugins { id 'fabric-loom' }",
      "minecraft_version = '1.20.1'",
      ""
    ].join("\n")
  );
  await writeText(
    join(workspaceRoot, "logs", "latest.log"),
    [
      "net.fabricmc.loader.impl.FormattedException: Some of your mods are incompatible!",
      "- Mod 'Demo Addon' (demo_addon) 1.0.0 requires any version of fabric-api, which is missing!",
      ""
    ].join("\n")
  );

  return workspaceRoot;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
