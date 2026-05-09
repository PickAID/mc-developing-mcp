import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readWorkspaceLocalSettings } from "./local-settings.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("workspace local settings", () => {
  it("normalizes reusable local schema extensions from .mcpskill/settings.json", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-local-settings-");

    await writeText(
      join(workspaceRoot, ".mcpskill", "settings.json"),
      JSON.stringify({
        ftbQuests: {
          schemaExtensions: [
            {
              id: "addon.bridge",
              category: "addon_bridge",
              paths: ["/addon_bridge/", "addon_bridge/deep"]
            },
            {
              id: "bad path",
              category: "ignored",
              paths: ["ignored"]
            }
          ]
        }
      })
    );

    await expect(readWorkspaceLocalSettings(workspaceRoot)).resolves.toMatchObject({
      source: "workspace_local_settings",
      path: ".mcpskill/settings.json",
      ftbQuests: {
        schemaExtensions: [
          {
            id: "addon.bridge",
            category: "addon_bridge",
            paths: ["addon_bridge", "addon_bridge/deep"]
          }
        ]
      }
    });
  });
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));

  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
