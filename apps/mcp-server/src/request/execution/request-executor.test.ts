import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";
import { createLspDiagnosticRegistry } from "minecraft-developing-mcp-java-jdtls-adapter";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { executeMcpServerRequest } from "./request-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("executeMcpServerRequest", () => {
  it("chains crash log signals into mod archive class ownership lookup", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createCrashModpackWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: "The server crashes on startup; inspect latest.log and mods."
    });

    expect(result.executions).toMatchObject([
      {
        candidateId: "candidate-1-log_files",
        routeStep: "log_files",
        preferredTool: "workspace.analyze",
        status: "context",
        attempted: true,
        payload: {
          source: "workspace_analyze",
          signals: {
            actionableClassReferences: ["com.example.problem.CrashHandler"]
          }
        }
      },
      {
        candidateId: "candidate-2-mod_archive_content",
        routeStep: "mod_archive_content",
        preferredTool: "context.query",
        status: "selected",
        attempted: true,
        payload: {
          source: "mod_archive_content",
          mode: "class_owner",
          requestedClasses: ["com.example.problem.CrashHandler"],
          matches: [
            {
              binaryName: "com.example.problem.CrashHandler",
              relativePath: "com/example/problem/CrashHandler.class",
              sourceArchive: expect.stringContaining("mods/problem-mod.jar")
            }
          ]
        }
      }
    ]);
    expect(result.selectedEvidence).toMatchObject({
      candidateId: "candidate-2-mod_archive_content"
    });
    expect(result.trace).toMatchObject({
      selectedCandidateId: "candidate-2-mod_archive_content",
      failedCandidateIds: []
    });
  });

  it("chains crash log resource ids into mod archive data and asset search", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createCrashResourceModpackWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: "The server crashes during datapack loading; inspect latest.log and mods."
    });

    expect(result.executions).toMatchObject([
      {
        candidateId: "candidate-1-log_files",
        routeStep: "log_files",
        status: "context",
        payload: {
          source: "workspace_analyze",
          signals: {
            resourceLocations: ["demo:gear"]
          }
        }
      },
      {
        candidateId: "candidate-2-mod_archive_content",
        routeStep: "mod_archive_content",
        status: "selected",
        payload: {
          source: "mod_archive_content",
          matches: [
            {
              sourceArchive: expect.stringContaining("mods/content-mod.jar"),
              entry: {
                domain: "data",
                relativePath: "data/demo/recipes/gear.json"
              },
              preview: expect.stringContaining("demo:gear")
            }
          ]
        }
      }
    ]);
    expect(result.selectedEvidence).toMatchObject({
      candidateId: "candidate-2-mod_archive_content"
    });
  });

  it("uses Java LSP diagnostics as context before selecting workspace source evidence", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createJavaWorkspace();
    const diagnostics = createLspDiagnosticRegistry();
    const seenQueries: string[] = [];
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
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: "Fix the compile error: cannot resolve symbol RegistryObject.",
      lspDiagnostics: diagnostics,
      executors: {
        "source.bundle": ({ candidate }) => {
          seenQueries.push(candidate.queryHint ?? "");
          return {
            matched: true,
            summary: "Selected source using diagnostic context.",
            payload: {
              source: "workspace_source",
              queryHint: candidate.queryHint
            }
          };
        }
      }
    });

    expect(result.executions).toMatchObject([
      {
        candidateId: "candidate-1-java_diagnostics",
        routeStep: "java_diagnostics",
        status: "context",
        payload: {
          mode: "java_diagnostics",
          totalDiagnostics: 1
        }
      },
      {
        candidateId: "candidate-2-workspace_source",
        routeStep: "workspace_source",
        status: "selected"
      }
    ]);
    expect(seenQueries[0]).toContain(
      "Java diagnostics: Broken.java:12:5 RegistryObject cannot be resolved to a type"
    );
    expect(seenQueries[0]).toContain(
      "Java diagnostic source files: src/main/java/example/Broken.java"
    );
    expect(result.trace).toMatchObject({
      contextCandidateIds: ["candidate-1-java_diagnostics"],
      selectedCandidateId: "candidate-2-workspace_source"
    });
  });

  it("reads the exact Java source file referenced by a diagnostic URI", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createMultiModuleJavaWorkspace();
    const diagnostics = createLspDiagnosticRegistry();
    diagnostics.publish({
      uri: pathToFileURL(
        join(
          workspaceRoot,
          "module-a",
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
            start: { line: 4, character: 10 },
            end: { line: 4, character: 24 }
          },
          source: "jdtls"
        }
      ]
    });
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: "Fix the compile error: cannot resolve symbol RegistryObject.",
      lspDiagnostics: diagnostics
    });

    expect(result.executions).toMatchObject([
      {
        candidateId: "candidate-1-java_diagnostics",
        routeStep: "java_diagnostics",
        status: "context"
      },
      {
        candidateId: "candidate-2-workspace_source",
        routeStep: "workspace_source",
        status: "selected",
        payload: {
          source: "workspace_source",
          references: [
            {
              relativePath: "module-a/src/main/java/example/Broken.java",
              kind: "java",
              content: expect.stringContaining("class Broken")
            }
          ]
        }
      }
    ]);
    expect(result.trace.selectedCandidateId).toBe(
      "candidate-2-workspace_source"
    );
  });

  it("selects log context as fallback when crash follow-up evidence misses", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createCrashModpackWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: "The server crashes on startup; inspect latest.log.",
      executors: {
        "context.query": () => ({
          matched: false,
          summary: "No context query evidence matched the crash context."
        }),
        "source.bundle": () => ({
          matched: false,
          summary: "No source evidence matched the crash context."
        })
      }
    });

    expect(result.selectedEvidence).toMatchObject({
      candidateId: "candidate-1-log_files",
      routeStep: "log_files",
      status: "context",
      summary: "Extracted 1 actionable crash class reference(s) from 1 log file(s)."
    });
    expect(result.trace.selectedCandidateId).toBe("candidate-1-log_files");
    expect(result.trace.fallbackUsed).toBe(true);
  });

  it("keeps Java diagnostics runtime unavailability in the evidence chain", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createJavaWorkspace();
    const diagnostics = createLspDiagnosticRegistry();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: "Fix the compile error: cannot resolve symbol RegistryObject.",
      lspDiagnostics: diagnostics,
      javaDiagnosticsPreparation: {
        status: "unavailable",
        diagnostics,
        syncedFiles: [],
        profileStatus: "missing_jdtls",
        reason: "Java LSP profile is missing_jdtls."
      }
    });

    expect(result.executions[0]).toMatchObject({
      candidateId: "candidate-1-java_diagnostics",
      routeStep: "java_diagnostics",
      status: "skipped",
      summary: "Java diagnostics unavailable: Java LSP profile is missing_jdtls.",
      payload: {
        status: "unavailable",
        profileStatus: "missing_jdtls",
        reason: "Java LSP profile is missing_jdtls.",
        totalDiagnostics: 0
      }
    });
    expect(result.trace.contextCandidateIds).toEqual([]);
  });
});

async function createCrashModpackWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-crash-modpack-");

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

async function createCrashResourceModpackWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-crash-resource-modpack-");

  await writeText(
    join(workspaceRoot, "logs", "latest.log"),
    [
      "[Server thread/ERROR] [minecraft/]: Failed to load recipe demo:gear",
      "com.google.gson.JsonSyntaxException: Unknown item id demo:gear",
      ""
    ].join("\n")
  );
  await writeBinary(
    join(workspaceRoot, "mods", "content-mod.jar"),
    createZip([
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

async function createJavaWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-java-diagnostics-");

  await writeText(
    join(workspaceRoot, "build.gradle"),
    'plugins { id "java" }\n'
  );
  await writeText(
    join(workspaceRoot, "src", "main", "java", "example", "Broken.java"),
    "package example;\nclass Broken {}\n"
  );

  return workspaceRoot;
}

async function createMultiModuleJavaWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-java-multimodule-");

  await writeText(
    join(workspaceRoot, "settings.gradle"),
    'include "module-a"\n'
  );
  await writeText(
    join(workspaceRoot, "build.gradle"),
    'plugins { id "java" apply false }\n'
  );
  await writeText(
    join(
      workspaceRoot,
      "module-a",
      "src",
      "main",
      "java",
      "example",
      "Broken.java"
    ),
    [
      "package example;",
      "",
      "final class Broken {",
      "  private RegistryObject<?> missing;",
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
