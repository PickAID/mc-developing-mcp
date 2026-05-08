import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildSourceIndex } from "minecraft-developing-mcp-source-index";
import { describe, expect, it } from "vitest";

import { registerMcpServerTools } from "../tools/mcp-tools.js";
import { createCapturingRegistry } from "../../../test-fixtures/mcp-tools-mdm-resource-fixtures.js";

describe("mc_develop source-index mdm resources", () => {
  it("uses a newly installed source_index_sqlite artifact for Mixin member proof", async () => {
    const registry = createCapturingRegistry();
    const release = await createSourceIndexReleaseOut();
    const mdmSourcesRoot = await createSourceIndexMdmSourcesRoot(release);
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-runtime-"));
    const workspaceRoot = await createMixinWorkspace();

    registerMcpServerTools(registry, {
      env: {
        MDM_SOURCES_ROOT: mdmSourcesRoot,
        PATH: ""
      }
    });

    const result = await registry.calls[0].handler({
      requestText: [
        "The game crashes during Mixin apply; inspect latest.log and mods.",
        "target=Lcom/example/compat/TargetApi;call()V"
      ].join(" "),
      runtimeRoot,
      workspaceRoot,
      mdmReleaseInstall: {
        manifestPath: release.manifestPath,
        packageId: "minecraft-1.20.1-source-index",
        downloadPolicy: "allowed"
      }
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      mdmReleaseInstall: {
        status: "downloaded",
        packageId: "minecraft-1.20.1-source-index"
      },
      selectedEvidence: {
        routeStep: "mod_archive_content",
        payload: {
          mode: "mixin_target_verification",
          searchedSourceIndexes: 1,
          verifications: [
            {
              requestedTarget: "com.example.compat.TargetApi",
              memberProofs: [
                {
                  status: "valid",
                  requestedMember: "call",
                  matches: [
                    {
                      path: "com/example/compat/TargetApi.java",
                      signature: "call()"
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    });
  });
});

async function createSourceIndexReleaseOut(): Promise<SourceIndexReleaseOut> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-source-index-release-"));
  const sourceRoot = join(root, "source-root");
  const artifactName = "minecraft-1.20.1-source-index-0.1.0.sqlite";
  const artifactPath = join(root, artifactName);
  const manifestPath = join(root, "mdm-release-manifest.json");

  await writeText(
    join(sourceRoot, "com", "example", "compat", "TargetApi.java"),
    [
      "package com.example.compat;",
      "public class TargetApi {",
      "  public void call() {}",
      "}"
    ].join("\n")
  );
  await buildSourceIndex({
    sourceRoot,
    databasePath: artifactPath,
    packageId: "minecraft-1.20.1-source-index"
  });
  const body = await readFile(artifactPath);
  const sha256 = hashBytes(body);

  await writeJson(manifestPath, {
    schemaVersion: 1,
    generatedAt: "2026-05-08T00:00:00.000Z",
    packages: [
      {
        packageId: "minecraft-1.20.1-source-index",
        version: "0.1.0",
        namespace: "minecraft",
        artifactType: "source_index",
        artifactKind: "source_index",
        queryAdapter: "source_index_sqlite",
        variant: "sources",
        required: false,
        format: "sqlite",
        artifactName,
        sha256,
        sizeBytes: body.byteLength,
        metadata: sqliteSourceIndexMetadata(),
        releaseChannel: "sources",
        releaseFamily: "vanilla-source-index",
        capabilities: ["source_lookup", "source_chunk_search", "java_symbol_lookup"]
      }
    ]
  });

  return {
    manifestPath,
    artifactName,
    sha256,
    sizeBytes: body.byteLength
  };
}

async function createSourceIndexMdmSourcesRoot(
  release: SourceIndexReleaseOut
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-sources-"));

  await mkdir(join(root, "registry", "packages"), { recursive: true });
  await writeJson(join(root, "registry", "index.json"), {
    schemaVersion: 1,
    packages: [
      {
        id: "minecraft-1.20.1-source-index",
        manifestPath: "registry/packages/minecraft-1.20.1-source-index.json",
        required: false,
        format: "sqlite",
        artifactType: "source_index",
        artifactKind: "source_index",
        queryAdapter: "source_index_sqlite",
        metadata: sqliteSourceIndexMetadata()
      }
    ]
  });
  await writeJson(
    join(root, "registry", "packages", "minecraft-1.20.1-source-index.json"),
    {
      schemaVersion: 1,
      id: "minecraft-1.20.1-source-index",
      sourcePath: "packages/source-index/vanilla/1.20.1/package.json",
      artifactType: "source_index",
      artifactKind: "source_index",
      queryAdapter: "source_index_sqlite",
      metadata: sqliteSourceIndexMetadata(),
      currentRelease: {
        artifactName: release.artifactName,
        sha256: release.sha256,
        sizeBytes: release.sizeBytes
      }
    }
  );

  return root;
}

async function createMixinWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-mixin-mdm-"));

  await writeText(
    join(workspaceRoot, "logs", "latest.log"),
    [
      "Mixin apply failed demo.mixins.json:CompatMixin -> com.example.compat.TargetApi: InvalidInjectionException",
      ""
    ].join("\n")
  );
  await mkdir(join(workspaceRoot, "mods"), { recursive: true });
  await writeFile(
    join(workspaceRoot, "mods", "compat-mod.jar"),
    createZip([{ name: "com/example/compat/TargetApi.class", content: Buffer.from([0xca, 0xfe, 0xba, 0xbe]) }])
  );

  return workspaceRoot;
}

function sqliteSourceIndexMetadata() {
  return {
    storageKind: "sqlite_bundle",
    installTier: "runtime_or_optional_dataset",
    commitPolicy: "repository_manifest",
    sqlite: {
      minUserVersion: 0,
      requiredTables: [
        "files",
        "java_symbols",
        "java_members",
        "fts_files",
        "source_chunks",
        "fts_chunks"
      ]
    }
  };
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function hashBytes(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

function createZip(entries: Array<{ name: string; content: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const localHeader = Buffer.alloc(30);
    const centralHeader = Buffer.alloc(46);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(entry.content.length, 18);
    localHeader.writeUInt32LE(entry.content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(entry.content.length, 20);
    centralHeader.writeUInt32LE(entry.content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);

    localParts.push(localHeader, name, entry.content);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + entry.content.length;
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

interface SourceIndexReleaseOut {
  manifestPath: string;
  artifactName: string;
  sha256: string;
  sizeBytes: number;
}
