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

describe("source.bundle loose resource root summary", () => {
  it("returns counts-only resource root summaries for broad resource-pack requests", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-resource-roots-");

    await writeText(
      join(workspaceRoot, "pack.mcmeta"),
      JSON.stringify({ pack: { pack_format: 15 } })
    );
    await writeText(join(workspaceRoot, "assets", "demo", "lang", "en_us.json"), "{}\n");
    await writeText(
      join(workspaceRoot, "assets", "demo", "models", "block", "gear.json"),
      "{}\n"
    );

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: "List local resource pack assets."
    });

    expect(result.selectedEvidence).toMatchObject({
      payload: {
        source: "datapack_files",
        resourceRootSummary: {
          tokenPolicy: "counts_only",
          rootCount: 1,
          byRootKind: {
            resource_pack_root: 1
          },
          byDomain: {
            assets: 3
          },
          byKind: {
            lang: 1,
            models: 1,
            pack_metadata: 1
          },
          byNamespace: {
            "": 1,
            demo: 2
          }
        }
      }
    });
    expect(JSON.stringify(result.selectedEvidence?.payload)).not.toContain(
      "assets/demo/models/block/gear.json"
    );
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
