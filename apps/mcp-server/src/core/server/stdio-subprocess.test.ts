import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { cp, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { deflateRawSync } from "node:zlib";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

import { MCP_SERVER_VERSION } from "../metadata/server-metadata.js";
import { MC_DEVELOP_TOOL_NAME } from "../tools/mcp-tools.js";

const tempRoots: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("stdio MCP subprocess", () => {
  it("prints the server version without starting stdio transport", async () => {
    const packageRoot = fileURLToPath(new URL("../../..", import.meta.url));
    const stdioEntrypoint = fileURLToPath(
      new URL("../../../dist/stdio.js", import.meta.url)
    );

    const { stdout, stderr } = await execFileAsync(process.execPath, [
      stdioEntrypoint,
      "--version"
    ], { cwd: packageRoot });

    expect(stdout.trim()).toBe(MCP_SERVER_VERSION);
    expect(stderr).toBe("");
  });

  it("starts the built stdio server and routes mc_develop through real JSON-RPC pipes", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-stdio-runtime-");
    const workspaceRoot = await createCrashModpackWorkspace();
    const packageRoot = fileURLToPath(new URL("../../..", import.meta.url));
    const stdioEntrypoint = fileURLToPath(
      new URL("../../../dist/stdio.js", import.meta.url)
    );
    const client = new Client({
      name: "mcpskill-stdio-subprocess-test",
      version: "0.0.0"
    });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [stdioEntrypoint],
      cwd: packageRoot,
      env: {
        MC_DEVELOPING_MCP_RUNTIME_ROOT: runtimeRoot,
        MC_DEVELOPING_MCP_WORKSPACE_ROOT: workspaceRoot
      },
      stderr: "pipe"
    });
    const stderr = collectStderr(transport);

    await connectWithStderr(client, transport, stderr);

    try {
      const tools = await withCapturedStderr(client.listTools(), stderr);
      const result = await withCapturedStderr(
        client.callTool({
          name: MC_DEVELOP_TOOL_NAME,
          arguments: {
            requestText: "The server crashes on startup; inspect latest.log and mods."
          }
        }),
        stderr
      );

      expect(tools.tools.map((tool) => tool.name)).toEqual([
        MC_DEVELOP_TOOL_NAME
      ]);
      expect(extractText(result)).toContain(
        "Selected: candidate-2-mod_archive_content"
      );
      expect(result.structuredContent).toMatchObject({
        trace: {
          contextCandidateIds: ["candidate-1-log_files"],
          selectedCandidateId: "candidate-2-mod_archive_content"
        },
        selectedEvidence: {
          payload: {
            source: "mod_archive_content",
            mode: "class_owner",
            requestedClasses: ["com.example.problem.CrashHandler"]
          }
        }
      });
    } finally {
      await client.close();
    }
  });

  it("installs and searches a real mdm-sources release over stdio", async () => {
    const mdmSourcesRoot = await findMdmSourcesRoot();
    if (!mdmSourcesRoot) {
      return;
    }

    const tempRoot = await createTempRoot("mcpskill-stdio-mdm-release-");
    const copiedMdmSourcesRoot = join(tempRoot, "mdm-sources");
    const releaseOut = join(tempRoot, "release-out");
    const runtimeRoot = join(tempRoot, "runtime");
    const workspaceRoot = await createKubeJsWorkspace(tempRoot);
    const packageRoot = fileURLToPath(new URL("../../..", import.meta.url));
    const stdioEntrypoint = fileURLToPath(
      new URL("../../../dist/stdio.js", import.meta.url)
    );
    const client = new Client({
      name: "mcpskill-stdio-mdm-release-test",
      version: "0.0.0"
    });

    await cp(mdmSourcesRoot, copiedMdmSourcesRoot, {
      recursive: true,
      filter: (source) => !source.includes(`${mdmSourcesRoot}/.git`)
    });
    await execFileAsync(process.execPath, [
      "tools/build-local-release.mjs",
      "--out",
      releaseOut,
      "--channel",
      "docs"
    ], { cwd: copiedMdmSourcesRoot });

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [stdioEntrypoint],
      cwd: packageRoot,
      env: {
        MC_DEVELOPING_MCP_RUNTIME_ROOT: runtimeRoot,
        MC_DEVELOPING_MCP_WORKSPACE_ROOT: workspaceRoot,
        MDM_SOURCES_ROOT: copiedMdmSourcesRoot
      },
      stderr: "pipe"
    });
    const stderr = collectStderr(transport);

    await connectWithStderr(client, transport, stderr);

    try {
      const recommendation = await withCapturedStderr(
        client.callTool({
          name: MC_DEVELOP_TOOL_NAME,
          arguments: {
            requestText:
              "Find sqlite index role docs for offline MDM package queries."
          }
        }),
        stderr
      );
      const installAction = extractMdmInstallAction(
        recommendation,
        "core-docs-search-sqlite"
      );

      expect(installAction).toMatchObject({
        kind: "mdm_release_install",
        safety: "requires_user_confirmation",
        packageId: "core-docs-search-sqlite",
        inputPatch: {
          mdmReleaseInstall: {
            packageId: "core-docs-search-sqlite",
            downloadPolicy: "disabled"
          }
        }
      });

      const result = await withCapturedStderr(
        client.callTool({
          name: MC_DEVELOP_TOOL_NAME,
          arguments: {
            requestText:
              "Find sqlite index role docs for offline MDM package queries.",
            mdmReleaseInstall: {
              ...installAction.inputPatch.mdmReleaseInstall,
              downloadPolicy: "allowed"
            }
          }
        }),
        stderr
      );

      expect(result.structuredContent).toMatchObject({
        mdmReleaseInstall: {
          status: "downloaded",
          packageId: "core-docs-search-sqlite"
        },
        executions: expect.arrayContaining([
          expect.objectContaining({
            routeStep: "docs_lookup",
            payload: expect.objectContaining({
              hits: expect.arrayContaining([
                expect.objectContaining({
                  entryId: "mdm.sqlite-index-role",
                  packageId: "core-docs-search-sqlite",
                  source: "sqlite"
                })
              ])
            })
          })
        ])
      });
    } finally {
      await client.close();
    }
  }, 20_000);
});

function collectStderr(transport: StdioClientTransport): string[] {
  const chunks: string[] = [];

  transport.stderr?.on("data", (chunk: Buffer) => {
    chunks.push(chunk.toString("utf-8"));
  });

  return chunks;
}

async function connectWithStderr(
  client: Client,
  transport: StdioClientTransport,
  stderr: string[]
): Promise<void> {
  try {
    await client.connect(transport);
  } catch (error) {
    throw withStderr(error, stderr);
  }
}

async function withCapturedStderr<T>(
  promise: Promise<T>,
  stderr: string[]
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    throw withStderr(error, stderr);
  }
}

function withStderr(error: unknown, stderr: string[]): Error {
  const message = error instanceof Error ? error.message : String(error);
  const details = stderr.join("").trim();

  return new Error(details ? `${message}\nstdio stderr:\n${details}` : message);
}

function extractText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  if (!("content" in result)) {
    return "";
  }

  return result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function extractMdmInstallAction(
  result: Awaited<ReturnType<Client["callTool"]>>,
  packageId: string
): MdmInstallAction {
  const structuredContent = result.structuredContent as
    | { resourceActions?: { actions?: unknown[] } }
    | undefined;
  const action = structuredContent?.resourceActions?.actions?.find(
    (entry): entry is MdmInstallAction =>
      isRecord(entry) &&
      entry.kind === "mdm_release_install" &&
      entry.packageId === packageId &&
      isRecord(entry.inputPatch) &&
      isRecord(entry.inputPatch.mdmReleaseInstall)
  );

  if (!action) {
    throw new Error(`Missing MDM install action for ${packageId}.`);
  }

  return action;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function createCrashModpackWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-stdio-crash-pack-");

  await writeText(
    join(workspaceRoot, "logs", "latest.log"),
    [
      "[Server thread/ERROR] [minecraft/]: java.lang.IllegalStateException: crash",
      "\tat com.example.problem.CrashHandler.tick(CrashHandler.java:42)",
      ""
    ].join("\n")
  );
  await writeBinary(
    join(workspaceRoot, "mods", "problem-mod.jar"),
    createZip([
      {
        name: "com/example/problem/CrashHandler.class",
        content: Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
        compressionMethod: 0
      }
    ])
  );

  return workspaceRoot;
}

async function createKubeJsWorkspace(tempRoot: string): Promise<string> {
  const workspaceRoot = join(tempRoot, "kubejs-workspace");

  await writeText(join(workspaceRoot, "kubejs", "server_scripts", "main.js"), "\n");

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

async function findMdmSourcesRoot(): Promise<string | undefined> {
  const candidates = [
    resolve(process.cwd(), "..", "mdm-sources"),
    resolve(process.cwd(), "..", "..", "..", "mdm-sources"),
    resolve("/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources")
  ];

  for (const candidate of candidates) {
    if (await pathExists(join(candidate, "tools", "build-local-release.mjs"))) {
      return candidate;
    }
  }

  return undefined;
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  );
}

interface ZipFixtureEntry {
  name: string;
  content: string | Buffer;
  compressionMethod: 0 | 8;
}

interface MdmInstallAction {
  kind: "mdm_release_install";
  safety: "requires_user_confirmation";
  packageId: string;
  inputPatch: {
    mdmReleaseInstall: {
      manifestPath?: string;
      manifestUrl?: string;
      packageId: string;
      downloadPolicy: "disabled" | "allowed";
    };
  };
}
