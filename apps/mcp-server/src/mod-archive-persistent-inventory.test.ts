import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { executeMcpServerRequest } from "./request-executor.js";

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
        }
      }
    });
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
