import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { executeMcpServerRequest } from "../../request/execution/request-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("persistent mod archive class owner index", () => {
  it("reuses the runtime SQLite entry index for repeated class owner requests", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-runtime-"));
    const workspaceRoot = await createWorkspace();
    tempRoots.push(runtimeRoot);

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestText =
      "Find the mod jar owner of com.example.problem.CrashHandler in mods.";

    const first = await executeMcpServerRequest({ bootstrap, requestText });
    const second = await executeMcpServerRequest({ bootstrap, requestText });

    expect(first.selectedEvidence).toMatchObject({
      payload: {
        mode: "class_owner",
        matches: [
          {
            binaryName: "com.example.problem.CrashHandler",
            archiveRelativePath: "mods/problem-mod.jar"
          }
        ],
        cache: {
          entryIndex: {
            archiveHits: 0,
            archiveMisses: 1
          }
        }
      }
    });
    expect(second.selectedEvidence).toMatchObject({
      payload: {
        mode: "class_owner",
        cache: {
          entryIndex: {
            archiveHits: 1,
            archiveMisses: 0
          }
        }
      }
    });
  });
});

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-mcp-class-index-"));
  tempRoots.push(workspaceRoot);
  await mkdir(join(workspaceRoot, "mods"), { recursive: true });
  await writeFile(
    join(workspaceRoot, "mods", "problem-mod.jar"),
    createZip(["com/example/problem/CrashHandler.class"])
  );
  return workspaceRoot;
}

function createZip(entryNames: string[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entryName of entryNames) {
    const name = Buffer.from(entryName);
    const content = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
    const localHeader = Buffer.alloc(30);
    const centralHeader = Buffer.alloc(46);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);

    localParts.push(localHeader, name, content);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const eocd = Buffer.alloc(22);

  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entryNames.length, 8);
  eocd.writeUInt16LE(entryNames.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localFiles.length, 16);

  return Buffer.concat([localFiles, centralDirectory, eocd]);
}
