import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";
import { createArchiveContentCache } from "@mcpskill/jar-source-adapter";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { createMcpServerModArchiveContentExecutor } from "./mod-archive-content-executor.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("mod archive content executor cache reuse", () => {
  it("reuses an injected cache across repeated inventory requests", async () => {
    const workspaceRoot = await createJarJarWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      "List mod archive inventory and JarJar nested jars for this modpack."
    );
    const cache = createArchiveContentCache();
    const executor = createMcpServerModArchiveContentExecutor({ cache });

    await expect(executor(input)).resolves.toMatchObject({
      payload: {
        mode: "inventory",
        cache: {
          archiveInspectionHits: 0,
          archiveInspectionMisses: 1,
          centralDirectoryHits: 0,
          centralDirectoryMisses: 1
        }
      }
    });
    await expect(executor(input)).resolves.toMatchObject({
      payload: {
        mode: "inventory",
        cache: {
          archiveInspectionHits: 1,
          archiveInspectionMisses: 0,
          centralDirectoryHits: 0,
          centralDirectoryMisses: 0
        }
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
  const workspaceRoot = await createTempRoot("mcpskill-mod-cache-mcp-");

  await writeBinary(
    join(workspaceRoot, "mods", "content-mod.jar"),
    createZip([
      {
        name: "fabric.mod.json",
        content: "{\"id\":\"content_mod\"}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/lang/en_us.json",
        content: "{\"item.demo.gear\":\"Gear\"}\n",
        compressionMethod: 8
      }
    ])
  );

  return workspaceRoot;
}

async function createJarJarWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-jarjar-cache-mcp-");
  const nestedJar = createZip([
    {
      name: "fabric.mod.json",
      content: "{\"id\":\"nested_content\"}\n",
      compressionMethod: 0
    }
  ]);

  await writeBinary(
    join(workspaceRoot, "mods", "outer-mod.jar"),
    createZip([
      {
        name: "fabric.mod.json",
        content: "{\"id\":\"outer_mod\"}\n",
        compressionMethod: 0
      },
      {
        name: "META-INF/jarjar/nested-content.jar",
        content: nestedJar,
        compressionMethod: 8
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
