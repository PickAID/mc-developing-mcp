import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";
import { createLspDiagnosticRegistry } from "@mcpskill/java-jdtls-adapter";

import {
  MC_DEVELOP_TOOL_NAME,
  registerMcpServerTools,
  type McpToolHandler
} from "./mcp-tools.js";
import type { McpJavaDiagnosticsRuntime } from "./java-diagnostics-runtime.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("registerMcpServerTools", () => {
  it("registers one high-level tool that routes crash logs into mod jar evidence", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-mcp-runtime-");
    const workspaceRoot = await createCrashModpackWorkspace();

    registerMcpServerTools(registry);

    expect(registry.calls).toHaveLength(1);
    expect(registry.calls[0]).toMatchObject({
      name: MC_DEVELOP_TOOL_NAME,
      config: {
        title: "Minecraft Development Assistant",
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        }
      }
    });
    expect(registry.calls[0].config.description).toContain(
      "Use before guessing"
    );

    const result = await registry.calls[0].handler({
      requestText: "The server crashes on startup; inspect latest.log and mods.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Selected: candidate-2-mod_archive_content")
    });
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
    expect(result.structuredContent).not.toHaveProperty("requestPlan");
    expect(result.structuredContent).not.toHaveProperty("evidencePlan");
  });

  it("returns pending Java LSP diagnostics as context through the high-level tool", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-mcp-runtime-");
    const workspaceRoot = await createJavaWorkspace();
    const diagnostics = createLspDiagnosticRegistry();
    diagnostics.publish({
      uri: pathToFileURL(
        join(workspaceRoot, "src", "main", "java", "example", "Broken.java")
      ).href,
      diagnostics: [
        {
          message: "RegistryObject cannot be resolved to a type",
          severity: 1,
          range: {
            start: { line: 11, character: 4 },
            end: { line: 11, character: 18 }
          },
          source: "jdtls"
        }
      ]
    });

    registerMcpServerTools(registry, { lspDiagnostics: diagnostics });

    const result = await registry.calls[0].handler({
      requestText:
        "Fix the compile error: cannot resolve symbol RegistryObject.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Context: candidate-1-java_diagnostics")
    });
    expect(result.structuredContent).toMatchObject({
      trace: {
        contextCandidateIds: ["candidate-1-java_diagnostics"],
        selectedCandidateId: "candidate-2-workspace_source"
      },
      executions: [
        {
          candidateId: "candidate-1-java_diagnostics",
          payload: {
            mode: "java_diagnostics",
            totalDiagnostics: 1
          }
        },
        {
          candidateId: "candidate-2-workspace_source",
          payload: {
            source: "workspace_source",
            references: [
              {
                kind: "java",
                symbol: "example.Broken",
                relativePath: "src/main/java/example/Broken.java"
              }
            ]
          }
        }
      ]
    });
  });

  it("uses the Java diagnostics runtime when direct diagnostics are not injected", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-mcp-runtime-");
    const workspaceRoot = await createJavaWorkspace();
    const diagnostics = createLspDiagnosticRegistry();
    const javaDiagnosticsRuntime: McpJavaDiagnosticsRuntime = {
      async prepare(input) {
        diagnostics.publish({
          uri: pathToFileURL(
            join(
              input.workspaceRoot,
              "src",
              "main",
              "java",
              "example",
              "Broken.java"
            )
          ).href,
          diagnostics: [
            {
              message: "RegistryObject cannot be resolved to a type",
              severity: 1,
              range: {
                start: { line: 11, character: 4 },
                end: { line: 11, character: 18 }
              },
              source: "jdtls"
            }
          ]
        });

        return {
          status: "ready",
          diagnostics,
          syncedFiles: [
            join(
              input.workspaceRoot,
              "src",
              "main",
              "java",
              "example",
              "Broken.java"
            )
          ],
          profileStatus: "ready"
        };
      },
      async stopAll() {}
    };

    registerMcpServerTools(registry, { javaDiagnosticsRuntime });

    const result = await registry.calls[0].handler({
      requestText: "Fix the compile error: cannot resolve symbol RegistryObject.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      trace: {
        contextCandidateIds: ["candidate-1-java_diagnostics"],
        selectedCandidateId: "candidate-2-workspace_source"
      },
      selectedEvidence: {
        payload: {
          source: "workspace_source",
          references: [
            {
              symbol: "example.Broken",
              relativePath: "src/main/java/example/Broken.java"
            }
          ]
        }
      }
    });
  });
});

function createCapturingRegistry(): CapturingRegistry {
  const calls: RegisteredToolCall[] = [];

  return {
    calls,
    registerTool(name, config, handler) {
      calls.push({ name, config, handler });
    }
  };
}

async function createCrashModpackWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-mcp-crash-pack-");

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

async function createJavaWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-mcp-java-");

  await writeText(
    join(workspaceRoot, "build.gradle"),
    'plugins { id "java" }\n'
  );
  await writeText(
    join(workspaceRoot, "src", "main", "java", "example", "Broken.java"),
    [
      "package example;",
      "",
      "class Broken {",
      "  RegistryObject<?> value;",
      "}",
      ""
    ].join("\n")
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

interface CapturingRegistry {
  calls: RegisteredToolCall[];
  registerTool: (
    name: string,
    config: unknown,
    handler: McpToolHandler
  ) => void;
}

interface RegisteredToolCall {
  name: string;
  config: {
    title?: string;
    description?: string;
    annotations?: Record<string, unknown>;
  };
  handler: McpToolHandler;
}

interface ZipFixtureEntry {
  name: string;
  content: string | Buffer;
  compressionMethod: 0 | 8;
}
