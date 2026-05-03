import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { createArchiveContentCache } from "@mcpskill/jar-source-adapter";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { buildMcpServerContextQueryExecutor } from "./context-query-executor.js";
import { buildMcpServerDocsSelection } from "./docs-selection.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("buildMcpServerContextQueryExecutor", () => {
  it("dispatches docs_lookup through the internal docs executor", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot: resolveScenarioPath("modpack_kubejs")
      }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "How should I place this startup_scripts recipe and use ProbeJS in 1.20.1?"
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates[1];
    const executor = buildMcpServerContextQueryExecutor();
    const docsSelection = buildMcpServerDocsSelection(requestPlan, candidate);

    const result = await executor({
      candidate,
      evidencePlan,
      requestPlan,
      docsSelection
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "docs_lookup",
        selectedPackageIds: ["crychicdoc-kubejs-1.20.1-course-zh-cn"]
      }
    });
  });

  it("delegates probejs_types to the provided route executor", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot: resolveScenarioPath("modpack_kubejs")
      }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Add a KubeJS startup_scripts recipe for this modpack."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates[0];
    const executor = buildMcpServerContextQueryExecutor({
      probejsTypesExecutor: () => ({
        matched: true,
        summary: "Loaded ProbeJS declarations.",
        payload: {
          source: "probejs"
        }
      })
    });

    const result = await executor({
      candidate,
      evidencePlan,
      requestPlan
    });

    expect(result).toEqual({
      matched: true,
      summary: "Loaded ProbeJS declarations.",
      payload: {
        source: "probejs"
      }
    });
  });

  it("delegates external_mod_resolution to the provided route executor", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot: resolveScenarioPath("modpack_kubejs")
      }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Find the CurseMaven coordinate for JEI forge 1.20.1."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates[0];
    const executor = buildMcpServerContextQueryExecutor({
      externalModResolutionExecutor: () => ({
        matched: true,
        summary: "Resolved external mod metadata.",
        payload: {
          source: "external_mod_resolution"
        }
      })
    });

    const result = await executor({
      candidate,
      evidencePlan,
      requestPlan
    });

    expect(result).toEqual({
      matched: true,
      summary: "Resolved external mod metadata.",
      payload: {
        source: "external_mod_resolution"
      }
    });
  });

  it("resolves probejs_types through the default KubeJS language service executor", async () => {
    const workspaceRoot = await createKubeJsLanguageWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot
      }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Use KubeJS server_scripts ItemEvents.foodEaten in this modpack."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates[0];
    const executor = buildMcpServerContextQueryExecutor();

    const result = await executor({
      candidate,
      evidencePlan,
      requestPlan
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "kubejs_language_service",
        scope: "server",
        symbol: "ItemEvents.foodEaten",
        quickInfo: expect.stringContaining("foodEaten(handler"),
        diagnostics: []
      }
    });
    expect(result.payload).toMatchObject({
      completions: expect.arrayContaining([
        expect.objectContaining({ name: "foodEaten" })
      ])
    });
  });

  it("resolves mod_archive_content through direct mod jar search", async () => {
    const workspaceRoot = await createModArchiveWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Find demo:gear in this modpack."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "mod_archive_content"
    );
    const executor = buildMcpServerContextQueryExecutor();

    if (!candidate) {
      throw new Error("Expected mod_archive_content candidate.");
    }

    const result = await executor({
      candidate,
      evidencePlan,
      requestPlan
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "mod_archive_content",
        queries: ["demo:gear"],
        searchedArchives: 1,
        matches: [
          {
            entry: {
              domain: "data",
              relativePath: "data/demo/recipes/gear.json"
            },
            preview: "{\"result\":\"demo:gear\"}",
            sourceArchive: expect.stringContaining("mods/content-mod.jar")
          }
        ]
      }
    });
  });

  it("reuses mod archive inspection cache for local external mod evidence", async () => {
    const workspaceRoot = await createExternalModWorkspace();
    const cache = createArchiveContentCache();
    const executor = buildMcpServerContextQueryExecutor({
      modArchiveContentCache: cache
    });
    const input = await createExternalModInput(
      workspaceRoot,
      "Find the Modrinth mod for Local Energy."
    );

    const first = await executor(input);
    const second = await executor(input);

    expect(first).toMatchObject({
      matched: true,
      payload: {
        source: "external_mod_resolution",
        result: {
          source: "local_archive",
          cache: {
            archiveInspectionHits: 0,
            archiveInspectionMisses: 1
          }
        }
      }
    });
    expect(second).toMatchObject({
      matched: true,
      payload: {
        source: "external_mod_resolution",
        result: {
          source: "local_archive",
          cache: {
            archiveInspectionHits: 1,
            archiveInspectionMisses: 0
          }
        }
      }
    });
    expect(cache.size().archiveInspections).toBe(1);
  });
});

function resolveScenarioPath(name: string): string {
  return fileURLToPath(
    new URL(`../../../testdata/scenarios/${name}`, import.meta.url)
  );
}

async function createKubeJsLanguageWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-kjs-mcp-"));
  tempRoots.push(workspaceRoot);

  await writeText(
    join(workspaceRoot, "kubejs", "server_scripts", "main.js"),
    [
      "ItemEvents.foodEaten((event) => {",
      "  event.item.id;",
      "});",
      ""
    ].join("\n")
  );
  await writeText(
    join(workspaceRoot, ".probe", "server", "events.d.ts"),
    [
      "declare const ItemEvents: {",
      "  foodEaten(handler: (event: { item: { id: string } }) => void): void;",
      "};",
      ""
    ].join("\n")
  );

  return workspaceRoot;
}

async function createModArchiveWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-mod-archive-mcp-"));
  tempRoots.push(workspaceRoot);

  await writeBinary(
    join(workspaceRoot, "mods", "content-mod.jar"),
    createZip([
      {
        name: "data/demo/recipes/gear.json",
        content: "{\"result\":\"demo:gear\"}\n",
        compressionMethod: 0
      }
    ])
  );

  return workspaceRoot;
}

async function createExternalModWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-extmod-cache-"));
  tempRoots.push(workspaceRoot);

  await writeBinary(
    join(workspaceRoot, "mods", "local-energy.jar"),
    createZip([
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "local_energy",
          name: "Local Energy",
          version: "1.0.0"
        }),
        compressionMethod: 0
      }
    ])
  );

  return workspaceRoot;
}

async function createExternalModInput(workspaceRoot: string, requestText: string) {
  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot: "/tmp/mcpskill-runtime",
    workspace: { workspaceRoot }
  });
  const requestPlan = buildMcpServerRequestPlan(bootstrap, requestText);
  const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
  const candidate = evidencePlan.candidates.find(
    (entry) => entry.routeStep === "external_mod_resolution"
  );

  if (!candidate) {
    throw new Error("Expected external_mod_resolution candidate.");
  }

  return {
    candidate,
    evidencePlan,
    requestPlan
  };
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
