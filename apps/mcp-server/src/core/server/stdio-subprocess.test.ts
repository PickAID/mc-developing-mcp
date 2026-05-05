import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

import { MC_DEVELOP_TOOL_NAME } from "../tools/mcp-tools.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("stdio MCP subprocess", () => {
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
        MCPSKILL_RUNTIME_ROOT: runtimeRoot,
        MCPSKILL_WORKSPACE_ROOT: workspaceRoot
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

interface ZipFixtureEntry {
  name: string;
  content: string | Buffer;
  compressionMethod: 0 | 8;
}
