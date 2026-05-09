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
  it("normalizes reusable local schema extensions from .mc-developing-mcp/settings.json", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-local-settings-");

    await writeText(
      join(workspaceRoot, ".mc-developing-mcp", "settings.json"),
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
      path: ".mc-developing-mcp/settings.json",
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

  it("uses the built-in default schema when local settings are absent", async () => {
    const workspaceRoot = await createTempRoot("mc-developing-local-settings-default-");

    await expect(readWorkspaceLocalSettings(workspaceRoot)).resolves.toMatchObject({
      source: "workspace_local_settings",
      path: ".mc-developing-mcp/settings.json",
      ftbQuests: {
        schemaExtensions: []
      }
    });
  });

  it("ignores legacy .mcpskill settings when the new settings path is absent", async () => {
    const workspaceRoot = await createTempRoot("mc-developing-local-settings-legacy-");

    await writeText(
      join(workspaceRoot, ".mcpskill", "settings.json"),
      JSON.stringify({
        ftbQuests: {
          schemaExtensions: [
            {
              id: "legacy_bridge",
              category: "legacy_bridge",
              paths: ["legacy_bridge"]
            }
          ]
        }
      })
    );

    await expect(readWorkspaceLocalSettings(workspaceRoot)).resolves.toMatchObject({
      source: "workspace_local_settings",
      path: ".mc-developing-mcp/settings.json",
      ftbQuests: {
        schemaExtensions: []
      }
    });
  });

  it("uses new settings when both new and legacy settings exist", async () => {
    const workspaceRoot = await createTempRoot("mc-developing-local-settings-prefer-");

    await writeText(
      join(workspaceRoot, ".mcpskill", "settings.json"),
      JSON.stringify({
        ftbQuests: {
          schemaExtensions: [
            { id: "legacy", category: "legacy", paths: ["legacy"] }
          ]
        }
      })
    );
    await writeText(
      join(workspaceRoot, ".mc-developing-mcp", "settings.json"),
      JSON.stringify({
        ftbQuests: {
          schemaExtensions: [
            { id: "modern", category: "modern", paths: ["modern"] }
          ]
        }
      })
    );

    await expect(readWorkspaceLocalSettings(workspaceRoot)).resolves.toMatchObject({
      path: ".mc-developing-mcp/settings.json",
      ftbQuests: {
        schemaExtensions: [
          {
            id: "modern",
            category: "modern",
            paths: ["modern"]
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
