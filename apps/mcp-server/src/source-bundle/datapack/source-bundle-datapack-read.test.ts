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

describe("source.bundle datapack source.read line ranges", () => {
  it("reads explicit local data path line ranges with metadata", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-data-read-");
    await writeText(
      join(workspaceRoot, "data", "demo", "recipes", "gear.json"),
      ["{", '  "type": "minecraft:crafting_shaped",', '  "key": {},', '  "pattern": ["#"],', "}"].join("\n")
    );

    await expect(
      executeMcpServerDatapackFiles(
        createInput(
          workspaceRoot,
          "source.read data/demo/recipes/gear.json:2-4"
        )
      )
    ).resolves.toMatchObject({
      matched: true,
      payload: {
        reads: [
          {
            file: {
              relativePath: "data/demo/recipes/gear.json",
              domain: "data",
              kind: "recipes"
            },
            content: [
              '  "type": "minecraft:crafting_shaped",',
              '  "key": {},',
              '  "pattern": ["#"],'
            ].join("\n"),
            startLine: 2,
            endLine: 4,
            totalLines: 5,
            truncated: true,
            nextReads: ["source.read data/demo/recipes/gear.json:2-4"]
          }
        ]
      }
    });
  });

  it("reads explicit local asset path line ranges with metadata", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-assets-read-");
    await writeText(
      join(workspaceRoot, "assets", "demo", "models", "item", "gear.json"),
      Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n")
    );

    await expect(
      executeMcpServerDatapackFiles(
        createInput(
          workspaceRoot,
          "source.read assets/demo/models/item/gear.json:1-20"
        )
      )
    ).resolves.toMatchObject({
      matched: true,
      payload: {
        reads: [
          {
            file: {
              relativePath: "assets/demo/models/item/gear.json",
              domain: "assets",
              kind: "models"
            },
            content: Array.from(
              { length: 20 },
              (_, index) => `line ${index + 1}`
            ).join("\n"),
            startLine: 1,
            endLine: 20,
            totalLines: 30,
            truncated: true,
            nextReads: ["source.read assets/demo/models/item/gear.json:1-20"]
          }
        ]
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
