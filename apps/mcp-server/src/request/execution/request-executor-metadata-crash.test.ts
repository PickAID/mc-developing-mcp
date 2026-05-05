import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { executeMcpServerRequest } from "./request-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("executeMcpServerRequest metadata crash chaining", () => {
  it("chains Mixin config crash signals into mod archive metadata search", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createMixinCrashWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: "The game crashes during Mixin apply; inspect latest.log and mods."
    });

    expect(result.executions).toMatchObject([
      {
        routeStep: "log_files",
        status: "context",
        payload: {
          source: "workspace_analyze",
          signals: {
            resourcePaths: ["demo.mixins.json"]
          }
        }
      },
      {
        routeStep: "mod_archive_content",
        status: "selected",
        payload: {
          source: "mod_archive_content",
          matches: [
            {
              sourceArchive: expect.stringContaining("mods/mixin-mod.jar"),
              entry: {
                domain: "metadata",
                relativePath: "demo.mixins.json"
              },
              preview: "demo.mixins.json"
            }
          ]
        }
      }
    ]);
    expect(result.selectedEvidence).toMatchObject({
      candidateId: "candidate-2-mod_archive_content"
    });
  });
});

async function createMixinCrashWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-mixin-crash-");

  await writeText(
    join(workspaceRoot, "logs", "latest.log"),
    [
      "Mixin apply failed demo.mixins.json:CompatMixin -> net.minecraft.client.Minecraft: org.spongepowered.asm.mixin.injection.throwables.InvalidInjectionException",
      ""
    ].join("\n")
  );
  await writeBinary(
    join(workspaceRoot, "mods", "mixin-mod.jar"),
    createZip([
      {
        name: "fabric.mod.json",
        content: "{\"id\":\"demo\"}\n"
      },
      {
        name: "demo.mixins.json",
        content: "{\"mixins\":[\"CompatMixin\"]}\n"
      }
    ])
  );

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
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localFiles.length, 16);

  return Buffer.concat([localFiles, centralDirectory, eocd]);
}
