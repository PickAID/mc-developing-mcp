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

describe("executeMcpServerRequest loader dependency crash chaining", () => {
  it("chains missing loader dependency mod ids into external mod resolution", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createFabricCrashWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: "The modpack crashes during startup; inspect latest.log.",
      contextQuery: {
        externalModResolutionExecutor: ({ candidate, requestPlan }) => {
          expect(requestPlan.requestText).toContain(
            "Crash log loader mod ids: fabric-api"
          );
          expect(requestPlan.requestText).toContain(
            "Crash log loader dependency: modId=fabric-api; requestedBy=demo_addon; expected=any version; actual=missing; kind=missing_dependency"
          );

          return {
            matched: true,
            summary: "Resolved fabric-api from crash context.",
            payload: {
              source: "external_mod_resolution",
              candidateId: candidate.id,
              requestText: requestPlan.requestText
            }
          };
        }
      }
    });

    expect(result.executions).toMatchObject([
      {
        routeStep: "log_files",
        status: "context",
        payload: {
          source: "workspace_analyze",
          signals: {
            loaderModReferences: [
              {
                modId: "fabric-api",
                requestedBy: "demo_addon",
                kind: "missing_dependency"
              }
            ]
          }
        }
      },
      {
        routeStep: "mod_archive_content",
        status: "skipped",
        payload: {
          source: "mod_archive_content",
          mode: "loader_dependency_owner",
          missingDependencyModId: "fabric-api",
          requestedBy: "demo_addon",
          owner: {
            archiveRelativePath: "mods/demo-addon.jar",
            modId: "demo_addon",
            version: "1.2.3"
          }
        }
      },
      {
        routeStep: "external_mod_resolution",
        status: "selected",
        payload: {
          source: "external_mod_resolution",
          candidateId: "candidate-3-external_mod_resolution"
        }
      }
    ]);
    expect(result.trace).toMatchObject({
      routeSteps: [
        "log_files",
        "mod_archive_content",
        "external_mod_resolution",
        "workspace_source",
        "docs_lookup"
      ],
      selectedCandidateId: "candidate-3-external_mod_resolution"
    });
  });
});

async function createFabricCrashWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-loader-crash-");

  await writeText(
    join(workspaceRoot, "build.gradle"),
    [
      "plugins { id 'fabric-loom' }",
      "minecraft_version = '1.20.1'",
      ""
    ].join("\n")
  );
  await writeText(
    join(workspaceRoot, "logs", "latest.log"),
    [
      "net.fabricmc.loader.impl.FormattedException: Some of your mods are incompatible!",
      "- Mod 'Demo Addon' (demo_addon) 1.0.0 requires any version of fabric-api, which is missing!",
      ""
    ].join("\n")
  );
  await writeBinary(
    join(workspaceRoot, "mods", "demo-addon.jar"),
    createZip([
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "demo_addon",
          name: "Demo Addon",
          version: "1.2.3"
        }),
        compressionMethod: 0
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
