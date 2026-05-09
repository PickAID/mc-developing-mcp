import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  MC_DEVELOP_TOOL_NAME,
  registerMcpServerTools,
  type McpToolHandler
} from "./mcp-tools.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("mc_develop workspace source acquisition acceptance", () => {
  it("reads Gradle dependencies and ProbeJS resource summaries through default workspace handlers", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-workspace-source-runtime-");
    const workspaceRoot = await createWorkspace();

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText:
        "Find source acquisition context for modImplementation Gradle dependencies and list KubeJS ProbeJS item registry minecraft:stone.",
      runtimeRoot,
      workspaceRoot
    });

    expect(registry.calls.map((call) => call.name)).toEqual([
      MC_DEVELOP_TOOL_NAME
    ]);
    expect(result.isError).toBeUndefined();
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Workspace preparation: gradle dependencies=1")
    });
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("probejs item matches=1")
    });
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("total items=1")
    });
    expect(result.structuredContent).toMatchObject({
      workspacePreparation: {
        status: "ready",
        evidenceSummary: {
          gradle: {
            dependencyCount: 1,
            repositoryCount: 2
          },
          probejs: {
            totalCounts: {
              item: 1
            }
          }
        }
      },
      executions: expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          payload: expect.objectContaining({
            source: "source_acquisition_plan",
            workItemExecutions: expect.arrayContaining([
              expect.objectContaining({
                kind: "workspace_gradle_dependencies",
                status: "completed",
                payload: expect.objectContaining({
                  source: "workspace_gradle",
                  dependencyCount: 1,
                  repositoryCount: 2,
                  dependencies: expect.arrayContaining([
                    expect.objectContaining({
                      group: "net.neoforged",
                      artifact: "neoforge",
                      version: "21.1.1",
                      notation: "net.neoforged:neoforge:21.1.1"
                    })
                  ])
                })
              }),
              expect.objectContaining({
                kind: "workspace_probejs_types",
                status: "completed",
                payload: expect.objectContaining({
                  source: "probejs_resources",
                  queryMode: "resource_summary",
                  resourceQueries: expect.arrayContaining(["minecraft:stone"])
                })
              })
            ])
          })
        })
      ])
    });
  });

  it("keeps FTB Quests evidence visible during broad workspace preparation", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-ftb-prep-runtime-");
    const workspaceRoot = await createWorkspace();

    await mkdir(join(workspaceRoot, "config", "ftbquests", "quests", "chapters"), {
      recursive: true
    });
    await writeFile(
      join(workspaceRoot, "config", "ftbquests", "quests", "chapters", "start.snbt"),
      "{ id: 'start', quests: [] }\n"
    );
    await mkdir(join(workspaceRoot, "logs"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "logs", "latest.log"),
      [
        "[Server thread/ERROR] [ftbquests/]: Failed to load FTB Quests file config/ftbquests/quests/chapters/start.snbt",
        "java.lang.IllegalArgumentException: Unknown task type hotai:flight_task"
      ].join("\n")
    );

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText:
        "帮我初始化这个整合包，让后续崩溃排查、KubeJS、FTB quests 和依赖源码都能少浪费 token。",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("ftb quests files=1")
    });
    expect(result.structuredContent).toMatchObject({
      workspacePreparation: {
        evidenceSummary: {
          ftbQuests: {
            fileCount: 1,
            logErrorCount: 1,
            nextAction: expect.stringContaining(".mc-developing-mcp/settings.json")
          }
        }
      },
      executions: expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          status: "context"
        }),
        expect.objectContaining({
          routeStep: "datapack_files",
          status: "context",
          payload: expect.objectContaining({
            ftbQuestsSummary: expect.objectContaining({
              fileCount: 1
            })
          })
        })
      ])
    });
  });
});

async function createWorkspace(): Promise<string> {
  const root = await createTempRoot("mcpskill-workspace-source-");

  await writeFile(
    join(root, "build.gradle"),
    [
      "repositories {",
      "  mavenCentral()",
      "  maven { url = 'https://maven.neoforged.net/releases' }",
      "}",
      "dependencies {",
      "  modImplementation 'net.neoforged:neoforge:21.1.1'",
      "}"
    ].join("\n")
  );
  await mkdir(join(root, "kubejs", "probejs", "items"), { recursive: true });
  await writeFile(
    join(root, "kubejs", "probejs", "items", "minecraft.txt"),
    "minecraft:stone\nminecraft:dirt\n"
  );

  return root;
}

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

interface CapturingRegistry {
  calls: RegisteredToolCall[];
  registerTool(name: string, config: unknown, handler: McpToolHandler): unknown;
}

interface RegisteredToolCall {
  name: string;
  handler: McpToolHandler;
}
