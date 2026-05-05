import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { executeMcpServerRequest } from "../../request/execution/request-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("persistent mod archive inventory", () => {
  it("reuses the runtime SQLite inventory cache across MCP requests", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-runtime-"));
    const workspaceRoot = await createWorkspace();
    tempRoots.push(runtimeRoot);

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestText =
      "List mod archive inventory and JarJar nested jars for this modpack.";

    const first = await executeMcpServerRequest({ bootstrap, requestText });
    const second = await executeMcpServerRequest({ bootstrap, requestText });

    expect(first.selectedEvidence).toMatchObject({
      payload: {
        mode: "inventory",
        persistentCache: {
          hit: false,
          reason: "miss",
          archiveFingerprintCount: 1
        },
        entryIndex: {
          entryCount: 1,
          cache: {
            archiveHits: 0,
            archiveMisses: 1,
            archiveStale: 0
          }
        }
      }
    });
    expect(second.selectedEvidence).toMatchObject({
      payload: {
        mode: "inventory",
        persistentCache: {
          hit: true,
          reason: "hit",
          archiveFingerprintCount: 1
        },
        entryIndex: {
          entryCount: 1,
          cache: {
            archiveHits: 1,
            archiveMisses: 0,
            archiveStale: 0
          }
        }
      }
    });
  });

  it("refreshes the runtime SQLite inventory cache when requested", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-runtime-"));
    const workspaceRoot = await createWorkspace();
    tempRoots.push(runtimeRoot);

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    await executeMcpServerRequest({
      bootstrap,
      requestText: "List mod archive inventory for this modpack."
    });

    const refreshed = await executeMcpServerRequest({
      bootstrap,
      requestText: "Refresh the mod archive inventory cache for this modpack."
    });
    const cachedAgain = await executeMcpServerRequest({
      bootstrap,
      requestText: "List mod archive inventory for this modpack."
    });

    expect(refreshed.selectedEvidence).toMatchObject({
      payload: {
        mode: "inventory",
        persistentCache: {
          hit: false,
          reason: "refresh",
          archiveFingerprintCount: 1
        },
        entryIndex: {
          entryCount: 1,
          cache: {
            archiveHits: 0,
            archiveRefreshes: 1
          }
        }
      }
    });
    expect(cachedAgain.selectedEvidence).toMatchObject({
      payload: {
        mode: "inventory",
        persistentCache: {
          hit: true,
          reason: "hit",
          archiveFingerprintCount: 1
        },
        entryIndex: {
          entryCount: 1,
          cache: {
            archiveHits: 1,
            archiveRefreshes: 0
          }
        }
      }
    });
  });

  it("summarizes selected asset resources without dumping paths", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-runtime-"));
    const workspaceRoot = await createAssetWorkspace();
    tempRoots.push(runtimeRoot);

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: "List mod archive inventory and resource-pack GUI assets."
    });

    expect(result.selectedEvidence).toMatchObject({
      payload: {
        mode: "inventory",
        assetResourceSummary: {
          tokenPolicy: "counts_only",
          uiAssetCount: 4,
          byKind: {
            gui_texture: 1,
            gui_sprite: 1,
            atlas: 1,
            font: 1
          }
        }
      }
    });
    expect(JSON.stringify(result.selectedEvidence?.payload)).not.toContain(
      "textures/gui/widgets.png"
    );
  });

  it("summarizes vanilla asset roots from mod archives without dumping paths", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-runtime-"));
    const workspaceRoot = await createAssetWorkspace();
    tempRoots.push(runtimeRoot);

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: "List mod archive inventory and resource assets."
    });

    expect(result.selectedEvidence).toMatchObject({
      payload: {
        mode: "inventory",
        assetResourceSummary: {
          tokenPolicy: "counts_only",
          assetEntryCount: 7,
          byKind: {
            atlas: 1,
            blockstates: 1,
            font: 1,
            gui_sprite: 1,
            gui_texture: 1,
            models: 1,
            textures: 1
          }
        }
      }
    });
    expect(JSON.stringify(result.selectedEvidence?.payload)).not.toContain(
      "assets/demo/models/block/gear.json"
    );
  });

  it("lists bounded model asset entries from the mod archive asset index", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-runtime-"));
    const workspaceRoot = await createAssetWorkspace();
    tempRoots.push(runtimeRoot);

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText:
        "List mod archive inventory and model asset entries for this modpack."
    });

    expect(result.selectedEvidence).toMatchObject({
      payload: {
        mode: "inventory",
        assetResourceSummary: {
          tokenPolicy: "counts_only",
          assetEntryCount: 1,
          byKind: {
            models: 1
          }
        },
        assetResourceEntries: [
          {
            archiveRelativePath: "mods/asset-mod.jar",
            relativePath: "assets/demo/models/block/gear.json",
            assetKind: "models"
          }
        ]
      }
    });
    expect(JSON.stringify(result.selectedEvidence?.payload)).not.toContain(
      "assets/demo/blockstates/gear.json"
    );
  });
});

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-mcp-persistent-"));
  tempRoots.push(workspaceRoot);

  await mkdir(join(workspaceRoot, "mods"), { recursive: true });
  await writeFile(
    join(workspaceRoot, "mods", "content-mod.jar"),
    createZip([
      {
        name: "fabric.mod.json",
        content: JSON.stringify({ id: "content_mod", version: "1.0.0" }),
        compressionMethod: 0
      },
      {
        name: "data/demo/recipes/gear.json",
        content: "{\"result\":\"demo:gear\"}\n",
        compressionMethod: 0
      }
    ])
  );

  return workspaceRoot;
}

async function createAssetWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-mcp-assets-"));
  tempRoots.push(workspaceRoot);

  await mkdir(join(workspaceRoot, "mods"), { recursive: true });
  await writeFile(
    join(workspaceRoot, "mods", "asset-mod.jar"),
    createZip([
      {
        name: "fabric.mod.json",
        content: JSON.stringify({ id: "asset_mod", version: "1.0.0" }),
        compressionMethod: 0
      },
      {
        name: "assets/demo/textures/gui/widgets.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        compressionMethod: 0
      },
      {
        name: "assets/demo/textures/gui/sprites/button/normal.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        compressionMethod: 0
      },
      {
        name: "assets/demo/atlases/gui.json",
        content: "{\"sources\":[]}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/font/ui.json",
        content: "{\"providers\":[]}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/blockstates/gear.json",
        content: "{\"variants\":{\"\":{\"model\":\"demo:block/gear\"}}}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/models/block/gear.json",
        content: "{\"textures\":{\"all\":\"demo:block/gear\"}}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/textures/block/gear.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        compressionMethod: 0
      }
    ])
  );

  return workspaceRoot;
}

interface ZipFixtureEntry {
  name: string;
  content: string | Buffer;
  compressionMethod: 0 | 8;
}

function createZip(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content);
    const compressed =
      entry.compressionMethod === 8 ? deflateRawSync(content) : content;
    const localHeader = Buffer.alloc(30);
    const centralHeader = Buffer.alloc(46);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(entry.compressionMethod, 8);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(entry.compressionMethod, 10);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);

    localParts.push(localHeader, name, compressed);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const eocd = Buffer.alloc(22);

  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localFiles.length, 16);

  return Buffer.concat([localFiles, centralDirectory, eocd]);
}
