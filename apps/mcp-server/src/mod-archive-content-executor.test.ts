import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import { createArchiveContentCache } from "@mcpskill/jar-source-adapter";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";
import {
  createMcpServerModArchiveContentExecutor,
  executeMcpServerModArchiveContent
} from "./mod-archive-content-executor.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("executeMcpServerModArchiveContent", () => {
  it("reads a selected text entry from a discovered mod jar", async () => {
    const workspaceRoot = await createModArchiveWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      "Read data/demo/recipes/gear.json from mods/content-mod.jar."
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "mod_archive_content",
        mode: "read",
        sourceArchive: expect.stringContaining("mods/content-mod.jar"),
        entry: {
          domain: "data",
          relativePath: "data/demo/recipes/gear.json"
        },
        content: "{\"result\":\"demo:gear\"}\n"
      }
    });
  });

  it("lists selected domain entries from a discovered mod jar", async () => {
    const workspaceRoot = await createModArchiveWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      "List assets entries in mods/content-mod.jar."
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "mod_archive_content",
        mode: "list",
        sourceArchive: expect.stringContaining("mods/content-mod.jar"),
        domains: ["assets"],
        entries: [
          {
            domain: "assets",
            relativePath: "assets/demo/lang/en_us.json"
          }
        ],
        truncated: false
      }
    });
  });

  it("locates the owning mod jar for stacktrace class references", async () => {
    const workspaceRoot = await createModArchiveWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      [
        "Crash stacktrace:",
        "\tat com.example.problem.CrashHandler.tick(CrashHandler.java:42)"
      ].join("\n")
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "mod_archive_content",
        mode: "class_owner",
        requestedClasses: ["com.example.problem.CrashHandler"],
        matches: [
          {
            sourceArchive: expect.stringContaining("mods/content-mod.jar"),
            binaryName: "com.example.problem.CrashHandler",
            relativePath: "com/example/problem/CrashHandler.class",
            matchKind: "exact"
          }
        ]
      }
    });
  });

  it("reuses an injected cache across repeated list requests", async () => {
    const workspaceRoot = await createModArchiveWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      "List assets entries in mods/content-mod.jar."
    );
    const cache = createArchiveContentCache();
    const executor = createMcpServerModArchiveContentExecutor({ cache });

    await expect(executor(input)).resolves.toMatchObject({
      payload: {
        mode: "list",
        cache: { centralDirectoryHit: false }
      }
    });
    await expect(executor(input)).resolves.toMatchObject({
      payload: {
        mode: "list",
        cache: { centralDirectoryHit: true }
      }
    });

    expect(cache.size()).toMatchObject({ centralDirectories: 1 });
  });
});

async function createExecutorInput(workspaceRoot: string, requestText: string) {
  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot: "/tmp/mcpskill-runtime",
    workspace: { workspaceRoot }
  });
  const requestPlan = buildMcpServerRequestPlan(bootstrap, requestText);
  const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
  const candidate = evidencePlan.candidates.find(
    (entry) => entry.routeStep === "mod_archive_content"
  );

  if (!candidate) {
    throw new Error("Expected mod_archive_content candidate.");
  }

  return { candidate, evidencePlan, requestPlan };
}

async function createModArchiveWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-mod-entry-mcp-"));
  tempRoots.push(workspaceRoot);

  await writeBinary(
    join(workspaceRoot, "mods", "content-mod.jar"),
    createZip([
      {
        name: "data/demo/recipes/gear.json",
        content: "{\"result\":\"demo:gear\"}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/lang/en_us.json",
        content: "{\"item.demo.gear\":\"Gear\"}\n",
        compressionMethod: 8
      },
      {
        name: "com/example/problem/CrashHandler.class",
        content: Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
        compressionMethod: 0
      }
    ])
  );

  return workspaceRoot;
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
