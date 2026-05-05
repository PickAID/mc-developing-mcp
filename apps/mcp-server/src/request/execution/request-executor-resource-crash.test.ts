import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { executeMcpServerRequest } from "./request-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("executeMcpServerRequest resource crash chaining", () => {
  it("chains crash log asset paths into mod archive resource reference trace", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createResourceCrashWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText:
        "The client crashes during resource loading; inspect latest.log and mods."
    });

    expect(result.executions).toMatchObject([
      {
        routeStep: "log_files",
        status: "context",
        payload: {
          source: "workspace_analyze",
          signals: {
            resourcePaths: ["assets/demo/items/gear.json"]
          }
        }
      },
      {
        routeStep: "mod_archive_content",
        status: "selected",
        payload: {
          source: "mod_archive_content",
          mode: "resource_reference_trace",
          resourceReferenceTrace: {
            tokenPolicy: "explicit_trace",
            startPaths: ["assets/demo/items/gear.json"],
            references: [
              {
                fromPath: "assets/demo/items/gear.json",
                relation: "item_model",
                toPath: "assets/demo/models/item/gear.json",
                status: "resolved"
              },
              {
                fromPath: "assets/demo/models/item/gear.json",
                relation: "model_texture",
                toPath: "assets/demo/textures/item/gear.png",
                status: "resolved"
              }
            ],
            truncated: false
          }
        }
      }
    ]);
    expect(result.trace).toMatchObject({
      contextCandidateIds: ["candidate-1-log_files"],
      selectedCandidateId: "candidate-2-mod_archive_content"
    });
  });

  it("locates the matching mod jar for logged asset paths in modpacks", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createResourceCrashWorkspace({
      includeUnrelatedMod: true
    });
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText:
        "The client crashes during resource loading; inspect latest.log and mods."
    });

    expect(result.executions).toMatchObject([
      {
        routeStep: "log_files",
        status: "context",
        payload: {
          signals: {
            resourcePaths: ["assets/demo/items/gear.json"]
          }
        }
      },
      {
        routeStep: "mod_archive_content",
        status: "selected",
        payload: {
          mode: "resource_reference_trace",
          sourceArchive: expect.stringContaining("mods/content-mod.jar"),
          resourceReferenceTrace: {
            startPaths: ["assets/demo/items/gear.json"],
            references: [
              {
                fromPath: "assets/demo/items/gear.json",
                relation: "item_model",
                toPath: "assets/demo/models/item/gear.json",
                status: "resolved"
              },
              {
                fromPath: "assets/demo/models/item/gear.json",
                relation: "model_texture",
                toPath: "assets/demo/textures/item/gear.png",
                status: "resolved"
              }
            ]
          }
        }
      }
    ]);
    expect(result.trace).toMatchObject({
      selectedCandidateId: "candidate-2-mod_archive_content"
    });
  });
});

async function createResourceCrashWorkspace(options: {
  includeUnrelatedMod?: boolean;
} = {}): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-resource-crash-");

  await writeText(
    join(workspaceRoot, "logs", "latest.log"),
    [
      "[Render thread/ERROR] [minecraft/ModelManager]: Resource loading failed",
      "java.io.FileNotFoundException: assets/demo/items/gear.json",
      ""
    ].join("\n")
  );
  await writeBinary(
    join(workspaceRoot, "mods", "content-mod.jar"),
    createZip([
      {
        name: "assets/demo/items/gear.json",
        content: "{\"model\":{\"type\":\"minecraft:model\",\"model\":\"demo:item/gear\"}}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/models/item/gear.json",
        content: "{\"textures\":{\"layer0\":\"demo:item/gear\"}}\n",
        compressionMethod: 8
      },
      {
        name: "assets/demo/textures/item/gear.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        compressionMethod: 0
      }
    ])
  );
  if (options.includeUnrelatedMod) {
    await writeBinary(
      join(workspaceRoot, "mods", "aaa-unrelated-mod.jar"),
      createZip([
        {
          name: "fabric.mod.json",
          content: "{\"id\":\"unrelated_mod\",\"version\":\"1.0.0\"}\n",
          compressionMethod: 0
        },
        {
          name: "assets/other/items/other.json",
          content: "{\"model\":{\"model\":\"other:item/other\"}}\n",
          compressionMethod: 0
        }
      ])
    );
  }

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

async function writeBinary(path: string, content: Buffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
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
