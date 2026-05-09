import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { McpServerEvidenceExecutorInput } from "../../request/execution/request-handler.js";
import { executeMcpServerDatapackFiles } from "./source-bundle-datapack.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("source.bundle FTB Quests evidence", () => {
  it("summarizes local FTB Quests files before reading full quest content", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-ftb-quests-");

    await writeText(
      join(workspaceRoot, "config", "ftbquests", "quests", "chapters", "start.snbt"),
      '{ id: "start", quests: [{ id: "quest", tasks: [{ id: "task", type: "item" }] }] }\n'
    );
    await writeText(
      join(workspaceRoot, "config", "ftbquests", "quests", "reward_tables", "basic.snbt"),
      '{ id: "basic", rewards: [{ id: "reward", type: "item" }] }\n'
    );
    await writeText(
      join(workspaceRoot, "config", "ftbquests", "quests", "data.snbt"),
      "{ version: 13 }\n"
    );
    await writeText(
      join(workspaceRoot, "config", "ftbquests", "quests", "chapter_groups.snbt"),
      '{ chapter_groups: [{ id: "group" }] }\n'
    );
    await writeText(
      join(workspaceRoot, "config", "ftbquests", "quests", "lang", "en_us.snbt"),
      "{ }\n"
    );
    await writeText(
      join(workspaceRoot, "config", "ftbquests", "quests", "addon_bridge", "custom.snbt"),
      "{ }\n"
    );
    await writeText(
      join(workspaceRoot, "config", "ftbquests", "quests", "README.txt"),
      "notes\n"
    );

    await expect(
      executeMcpServerDatapackFiles(
        createInput(
          workspaceRoot,
          "Inspect FTB Quests quest data and KubeJS integration evidence."
        )
      )
    ).resolves.toMatchObject({
      matched: true,
      summary: "Summarized 6 local FTB Quests file(s).",
      payload: {
        source: "datapack_files",
        ftbQuestsSummary: {
          source: "ftb_quests_files",
          tokenPolicy: "counts_first",
          rootCount: 1,
          fileCount: 6,
          chapterFileCount: 1,
          rewardTableFileCount: 1,
          byFormat: {
            snbt: 6
          },
          byCategory: {
            addon_or_unknown: 1,
            chapter: 1,
            chapter_groups: 1,
            file_settings: 1,
            reward_table: 1,
            translation: 1
          },
          schemaProfile: {
            sourceEvidence: "ftb_quests_source",
            storageRoot: "config/ftbquests/quests",
            primaryFormat: "snbt",
            canonicalFiles: ["data.snbt", "chapter_groups.snbt"],
            canonicalDirectories: ["chapters", "reward_tables", "lang"],
            embeddedChapterCollections: [
              "quests",
              "tasks",
              "rewards",
              "quest_links",
              "images"
            ],
            extensionPolicy: "preserve_unknown_snbt_categories"
          },
          topPaths: [
            "config/ftbquests/quests/addon_bridge/custom.snbt",
            "config/ftbquests/quests/chapter_groups.snbt",
            "config/ftbquests/quests/chapters/start.snbt",
            "config/ftbquests/quests/data.snbt",
            "config/ftbquests/quests/lang/en_us.snbt",
            "config/ftbquests/quests/reward_tables/basic.snbt"
          ]
        }
      }
    });
  });

  it("applies local schema categories from workspace settings", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-ftb-quests-settings-");

    await writeText(
      join(workspaceRoot, "config", "ftbquests", "quests", "addon_bridge", "custom.snbt"),
      "{ }\n"
    );
    await writeText(
      join(workspaceRoot, ".mcpskill", "settings.json"),
      JSON.stringify({
        ftbQuests: {
          schemaExtensions: [
            {
              id: "addon_bridge",
              category: "addon_bridge",
              paths: ["addon_bridge"]
            }
          ]
        }
      })
    );

    await expect(
      executeMcpServerDatapackFiles(
        createInput(workspaceRoot, "Inspect FTB Quests addon bridge quest data.")
      )
    ).resolves.toMatchObject({
      matched: true,
      payload: {
        ftbQuestsSummary: {
          byCategory: {
            addon_bridge: 1
          },
          localSettings: {
            source: "workspace_local_settings",
            applied: true,
            path: ".mcpskill/settings.json",
            schemaExtensionCount: 1
          },
          schemaProfile: {
            localExtensions: [
              {
                id: "addon_bridge",
                category: "addon_bridge",
                paths: ["addon_bridge"]
              }
            ]
          }
        }
      }
    });
  });
});

function createInput(
  workspaceRoot: string,
  requestText: string
): McpServerEvidenceExecutorInput {
  return {
    candidate: { routeStep: "datapack_files" },
    requestPlan: {
      requestText,
      requestContext: {
        workspaceContext: {
          workspaceRoot,
          descriptor: {
            currentRuntime: {
              confidence: "unknown"
            }
          }
        }
      },
      trace: {
        taskIntent: { id: "datapack_lookup" }
      }
    }
  } as McpServerEvidenceExecutorInput;
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
