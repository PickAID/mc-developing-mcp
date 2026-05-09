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
      '{ id: "start", title: "Getting Started" }\n'
    );
    await writeText(
      join(workspaceRoot, "config", "ftbquests", "quests", "reward_tables", "basic.json"),
      '{ "id": "basic" }\n'
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
      summary: "Summarized 2 local FTB Quests file(s).",
      payload: {
        source: "datapack_files",
        ftbQuestsSummary: {
          source: "ftb_quests_files",
          tokenPolicy: "counts_first",
          rootCount: 1,
          fileCount: 2,
          chapterFileCount: 1,
          rewardTableFileCount: 1,
          byFormat: {
            json: 1,
            snbt: 1
          },
          topPaths: [
            "config/ftbquests/quests/chapters/start.snbt",
            "config/ftbquests/quests/reward_tables/basic.json"
          ]
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
