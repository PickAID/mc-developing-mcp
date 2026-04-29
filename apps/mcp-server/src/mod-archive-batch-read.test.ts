import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";
import { executeMcpServerModArchiveContent } from "./mod-archive-content-executor.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("mod archive batch reads", () => {
  it("reads multiple selected text entries from one discovered mod jar", async () => {
    const workspaceRoot = await createWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      "Read data/demo/recipes/gear.json and assets/demo/lang/en_us.json from mods/content-mod.jar."
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      summary: "Read 2 mod archive entrie(s).",
      payload: {
        source: "mod_archive_content",
        mode: "read_many",
        sourceArchive: expect.stringContaining("mods/content-mod.jar"),
        requestedPaths: [
          "data/demo/recipes/gear.json",
          "assets/demo/lang/en_us.json"
        ],
        files: [
          {
            requestedPath: "data/demo/recipes/gear.json",
            entry: { domain: "data" },
            content: "{\"result\":\"demo:gear\"}\n"
          },
          {
            requestedPath: "assets/demo/lang/en_us.json",
            entry: { domain: "assets" },
            content: "{\"item.demo.gear\":\"Gear\"}\n"
          }
        ],
        truncated: false
      }
    });
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

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-batch-read-"));
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
