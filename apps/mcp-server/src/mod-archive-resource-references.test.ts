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

describe("mod archive resource reference tracing", () => {
  it("returns compact explicit trace payloads for selected mod archive assets", async () => {
    const workspaceRoot = await createWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      "Trace references for assets/demo/blockstates/gear.json in mods/content-mod.jar."
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "mod_archive_content",
        mode: "resource_reference_trace",
        resourceReferenceTrace: {
          tokenPolicy: "explicit_trace",
          startPaths: ["assets/demo/blockstates/gear.json"],
          referenceCount: 2,
          unresolvedCount: 0,
          references: [
            {
              fromPath: "assets/demo/blockstates/gear.json",
              relation: "blockstate_model",
              toPath: "assets/demo/models/block/gear.json",
              status: "resolved"
            },
            {
              fromPath: "assets/demo/models/block/gear.json",
              relation: "model_texture",
              toPath: "assets/demo/textures/block/gear.png",
              status: "resolved"
            }
          ],
          truncated: false
        }
      }
    });
  });

  it("returns compact explicit trace payloads for nested mod archive assets", async () => {
    const workspaceRoot = await createNestedWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      [
        "Trace references for",
        "META-INF/jarjar/nested-content.jar!/assets/demo/blockstates/gear.json",
        "from mods/outer-mod.jar."
      ].join(" ")
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "mod_archive_content",
        mode: "resource_reference_trace_nested",
        embeddedArchivePath: "META-INF/jarjar/nested-content.jar",
        resourceReferenceTrace: {
          tokenPolicy: "explicit_trace",
          startPaths: ["assets/demo/blockstates/gear.json"],
          referenceCount: 2,
          unresolvedCount: 0,
          truncated: false
        }
      }
    });
  });

  it("returns compact explicit trace payloads for mod archive item definitions", async () => {
    const workspaceRoot = await createItemWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      "Trace references for assets/demo/items/gear.json in mods/content-mod.jar."
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "mod_archive_content",
        mode: "resource_reference_trace",
        resourceReferenceTrace: {
          tokenPolicy: "explicit_trace",
          startPaths: ["assets/demo/items/gear.json"],
          references: [
            {
              fromPath: "assets/demo/items/gear.json",
              fromKind: "items",
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
    });
  });

  it("returns compact traces for visual resource references inside mod archives", async () => {
    const workspaceRoot = await createVisualResourceWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      [
        "Trace references for assets/demo/particles/spark.json,",
        "assets/demo/atlases/blocks.json, and assets/demo/font/panel.json",
        "in mods/content-mod.jar."
      ].join(" ")
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "mod_archive_content",
        mode: "resource_reference_trace",
        resourceReferenceTrace: {
          tokenPolicy: "explicit_trace",
          references: expect.arrayContaining([
            expect.objectContaining({
              relation: "particle_texture",
              toPath: "assets/demo/textures/particle/spark.png",
              status: "resolved"
            }),
            expect.objectContaining({
              relation: "atlas_texture",
              toPath: "assets/demo/textures/block/machine.png",
              status: "resolved"
            }),
            expect.objectContaining({
              relation: "font_texture",
              toPath: "assets/demo/textures/font/panel.png",
              status: "resolved"
            })
          ]),
          truncated: false
        }
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
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-jar-trace-mcp-"));
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
        name: "assets/demo/blockstates/gear.json",
        content: "{\"variants\":{\"\":{\"model\":\"demo:block/gear\"}}}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/models/block/gear.json",
        content: "{\"textures\":{\"all\":\"demo:block/gear\"}}\n",
        compressionMethod: 8
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

async function createNestedWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-nested-trace-mcp-"));
  const nestedArchive = createZip([
    {
      name: "fabric.mod.json",
      content: JSON.stringify({ id: "nested_content", version: "1.0.0" }),
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
      compressionMethod: 8
    },
    {
      name: "assets/demo/textures/block/gear.png",
      content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      compressionMethod: 0
    }
  ]);

  tempRoots.push(workspaceRoot);
  await mkdir(join(workspaceRoot, "mods"), { recursive: true });
  await writeFile(
    join(workspaceRoot, "mods", "outer-mod.jar"),
    createZip([
      {
        name: "fabric.mod.json",
        content: JSON.stringify({ id: "outer_mod", version: "1.0.0" }),
        compressionMethod: 0
      },
      {
        name: "META-INF/jarjar/nested-content.jar",
        content: nestedArchive,
        compressionMethod: 8
      }
    ])
  );
  return workspaceRoot;
}

async function createItemWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-item-trace-mcp-"));
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
  return workspaceRoot;
}

async function createVisualResourceWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-visual-trace-mcp-"));
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
        name: "assets/demo/particles/spark.json",
        content: "{\"textures\":[\"demo:particle/spark\"]}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/atlases/blocks.json",
        content: "{\"sources\":[{\"type\":\"single\",\"resource\":\"demo:block/machine\"}]}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/font/panel.json",
        content: "{\"providers\":[{\"type\":\"bitmap\",\"file\":\"demo:font/panel.png\"}]}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/textures/particle/spark.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        compressionMethod: 0
      },
      {
        name: "assets/demo/textures/block/machine.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        compressionMethod: 0
      },
      {
        name: "assets/demo/textures/font/panel.png",
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
