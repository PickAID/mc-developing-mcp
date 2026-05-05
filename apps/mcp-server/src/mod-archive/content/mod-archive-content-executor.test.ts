import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { executeMcpServerModArchiveContent } from "./mod-archive-content-executor.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";

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

  it("adds mod metadata to content search matches", async () => {
    const workspaceRoot = await createModArchiveWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      "Find demo:gear in mods/content-mod.jar."
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "mod_archive_content",
        matches: [
          {
            sourceArchive: expect.stringContaining("mods/content-mod.jar"),
            archiveMetadata: {
              loader: "fabric",
              modId: "content_mod",
              name: "Content Mod",
              version: "1.0.0",
              metadataPath: "fabric.mod.json"
            },
            entry: {
              domain: "data",
              relativePath: "data/demo/recipes/gear.json"
            }
          }
        ]
      }
    });
  });

  it("searches JarJar nested archives from mod content requests", async () => {
    const workspaceRoot = await createJarJarWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      "Find demo:nested_gear in mods/outer-mod.jar."
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "mod_archive_content",
        matches: [
          {
            sourceArchive: expect.stringContaining("mods/outer-mod.jar"),
            embeddedArchivePath: "META-INF/jarjar/nested-content.jar",
            embeddedArchiveMetadata: {
              loader: "fabric",
              modId: "nested_content",
              name: "Nested Content",
              version: "2.0.0"
            },
            entry: {
              domain: "data",
              relativePath: "data/demo/recipes/nested_gear.json"
            },
            preview: expect.stringContaining("demo:nested_gear")
          }
        ]
      }
    });
  });

  it("reads selected files from JarJar nested archives", async () => {
    const workspaceRoot = await createJarJarWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      "Read META-INF/jarjar/nested-content.jar!/data/demo/recipes/nested_gear.json from mods/outer-mod.jar."
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      summary: "Read data/demo/recipes/nested_gear.json from nested mod archive.",
      payload: {
        source: "mod_archive_content",
        mode: "read_nested",
        sourceArchive: expect.stringContaining("mods/outer-mod.jar"),
        embeddedArchivePath: "META-INF/jarjar/nested-content.jar",
        embeddedArchiveMetadata: {
          loader: "fabric",
          modId: "nested_content"
        },
        entry: {
          domain: "data",
          relativePath: "data/demo/recipes/nested_gear.json"
        },
        content: "{\"result\":\"demo:nested_gear\"}\n"
      }
    });
  });

  it("lists selected domains from JarJar nested archives", async () => {
    const workspaceRoot = await createJarJarWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      "List data entries in META-INF/jarjar/nested-content.jar! from mods/outer-mod.jar."
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      summary: "Listed 1 nested mod archive entrie(s).",
      payload: {
        source: "mod_archive_content",
        mode: "list_nested",
        sourceArchive: expect.stringContaining("mods/outer-mod.jar"),
        embeddedArchivePath: "META-INF/jarjar/nested-content.jar",
        embeddedArchiveMetadata: {
          loader: "fabric",
          modId: "nested_content"
        },
        domains: ["data"],
        entries: [
          {
            domain: "data",
            relativePath: "data/demo/recipes/nested_gear.json"
          }
        ],
        truncated: false
      }
    });
  });

  it("summarizes mod archive inventory with nested JarJar metadata", async () => {
    const workspaceRoot = await createJarJarWorkspace();
    const input = await createExecutorInput(
      workspaceRoot,
      "List mod archive inventory and JarJar nested jars for this modpack."
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      summary: "Listed 1 mod archive inventory entrie(s).",
      payload: {
        source: "mod_archive_content",
        mode: "inventory",
        archiveCount: 1,
        archives: [
          {
            relativePath: "mods/outer-mod.jar",
            archiveMetadata: {
              loader: "fabric",
              modId: "outer_mod"
            },
            nestedArchives: [
              {
                embeddedArchivePath: "META-INF/jarjar/nested-content.jar",
                embeddedArchiveMetadata: {
                  loader: "fabric",
                  modId: "nested_content"
                }
              }
            ]
          }
        ],
        truncated: false
      }
    });
  });

  it("returns a stable empty inventory payload when no mod jars exist", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-empty-mods-"));
    tempRoots.push(workspaceRoot);
    const input = await createExecutorInput(
      workspaceRoot,
      "List mod archive inventory and JarJar nested jars for this modpack."
    );

    await expect(executeMcpServerModArchiveContent(input)).resolves.toMatchObject({
      matched: true,
      summary: "Listed 0 mod archive inventory entrie(s).",
      payload: {
        source: "mod_archive_content",
        mode: "inventory",
        archives: [],
        archiveCount: 0,
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

async function createModArchiveWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-mod-entry-mcp-"));
  tempRoots.push(workspaceRoot);

  await writeBinary(
    join(workspaceRoot, "mods", "content-mod.jar"),
    createZip([
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "content_mod",
          name: "Content Mod",
          version: "1.0.0"
        }),
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

async function createJarJarWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-jarjar-mcp-"));
  const nestedJar = createZip([
    {
      name: "fabric.mod.json",
      content: JSON.stringify({
        id: "nested_content",
        name: "Nested Content",
        version: "2.0.0"
      }),
      compressionMethod: 0
    },
    {
      name: "data/demo/recipes/nested_gear.json",
      content: "{\"result\":\"demo:nested_gear\"}\n",
      compressionMethod: 0
    }
  ]);

  tempRoots.push(workspaceRoot);
  await writeBinary(
    join(workspaceRoot, "mods", "outer-mod.jar"),
    createZip([
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "outer_mod",
          name: "Outer Mod",
          version: "1.0.0"
        }),
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
