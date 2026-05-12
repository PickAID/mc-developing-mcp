import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  MC_DEVELOP_TOOL_NAME,
  registerMcpServerTools,
  type McpToolHandler
} from "./mcp-tools.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("mc_develop Gradle source discovery", () => {
  it("uses one Gradle user home policy for service profile and source lookup", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-gradle-runtime-");
    const workspaceRoot = await createGradleWorkspace();
    const gradleUserHome = await createTempRoot("mcpskill-gradle-home-");
    const sourceJar = join(
      gradleUserHome,
      "caches/modules-2/files-2.1/com.example/example-lib/1.0.0/hash/example-lib-1.0.0-sources.jar"
    );

    await writeStoredZip(sourceJar, {
      "com/example/lib/Widget.java":
        "package com.example.lib;\npublic class Widget {}\n"
    });
    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText: "Inspect com.example.lib.Widget before guessing this integration.",
      runtimeRoot,
      workspaceRoot,
      gradleSourceDiscovery: {
        gradleUserHome,
        includeDefaultGradleUserHome: false
      }
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      selectedEvidence: {
        payload: {
          source: "gradle_source_archive",
          request: {
            symbol: "com.example.lib.Widget"
          },
          result: {
            references: [
              {
                sourceArchive: sourceJar,
                relativePath: "com/example/lib/Widget.java",
                content: expect.stringContaining("class Widget")
              }
            ]
          }
        }
      }
    });
    expect(JSON.stringify(result.structuredContent)).toContain(
      "declared source archives=1"
    );
  });

  it("reads simple class names from Gradle cache source jars through mc_develop", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-gradle-runtime-");
    const workspaceRoot = await createGradleWorkspace();
    const gradleUserHome = await createTempRoot("mcpskill-gradle-home-");
    const sourceJar = join(
      gradleUserHome,
      "caches/modules-2/files-2.1/net.minecraftforge/fmlloader/1.20.1-47.4.10/hash/fmlloader-1.20.1-47.4.10-sources.jar"
    );

    await writeStoredZip(sourceJar, {
      "net/minecraftforge/fml/loading/FMLLoader.java":
        "package net.minecraftforge.fml.loading;\npublic class FMLLoader {}\n"
    });
    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText: "Read FMLLoader source from Gradle cache for Forge 1.20.1.",
      runtimeRoot,
      workspaceRoot,
      gradleSourceDiscovery: {
        gradleUserHome,
        includeDefaultGradleUserHome: false
      }
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      selectedEvidence: {
        payload: {
          source: "gradle_source_archive",
          request: {
            symbol: "FMLLoader",
            simpleName: "FMLLoader"
          },
          result: {
            references: [
              {
                sourceArchive: sourceJar,
                relativePath: "net/minecraftforge/fml/loading/FMLLoader.java",
                content: expect.stringContaining(
                  "package net.minecraftforge.fml.loading"
                )
              }
            ]
          }
        }
      }
    });
  });
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function createGradleWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-gradle-workspace-");

  await mkdir(join(workspaceRoot, "src/main/java"), { recursive: true });
  await writeFile(
    join(workspaceRoot, "build.gradle"),
    'plugins { id "java" }\ndependencies { implementation "com.example:example-lib:1.0.0" }\n'
  );

  return workspaceRoot;
}

function createCapturingRegistry() {
  const calls: Array<{
    name: string;
    handler: McpToolHandler;
  }> = [];

  return {
    calls,
    registerTool(name: string, _config: unknown, handler: McpToolHandler) {
      calls.push({ name, handler });
      expect(name).toBe(MC_DEVELOP_TOOL_NAME);
    }
  };
}

async function writeStoredZip(
  path: string,
  entries: Record<string, string>
): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, createStoredZip(entries));
}

function createStoredZip(entries: Record<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const [entryName, entryContent] of Object.entries(entries)) {
    const name = Buffer.from(entryName);
    const content = Buffer.from(entryContent);
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
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localFiles.length, 16);

  return Buffer.concat([localFiles, centralDirectory, eocd]);
}
