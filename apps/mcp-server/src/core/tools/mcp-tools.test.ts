import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";
import { createLspDiagnosticRegistry } from "minecraft-developing-mcp-java-jdtls-adapter";

import {
  MC_DEVELOP_TOOL_NAME,
  registerMcpServerTools,
  type McpToolHandler
} from "./mcp-tools.js";
import type { McpJavaDiagnosticsRuntime } from "../../java/diagnostics/java-diagnostics-runtime.js";

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
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true
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

  it("returns Java diagnostics runtime unavailability in structured content", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-mcp-runtime-");
    const workspaceRoot = await createJavaWorkspace();
    const diagnostics = createLspDiagnosticRegistry();
    const javaDiagnosticsRuntime: McpJavaDiagnosticsRuntime = {
      async prepare() {
        return {
          status: "unavailable",
          diagnostics,
          syncedFiles: [],
          profileStatus: "missing_jdtls",
          reason: "Java LSP profile is missing_jdtls."
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
        routeSteps: ["java_diagnostics", "workspace_source", "docs_lookup"],
        contextCandidateIds: []
      },
      executions: expect.arrayContaining([
        expect.objectContaining({
          candidateId: "candidate-1-java_diagnostics",
          status: "skipped",
          summary:
            "Java diagnostics unavailable: Java LSP profile is missing_jdtls.",
          payload: expect.objectContaining({
            status: "unavailable",
            profileStatus: "missing_jdtls",
            reason: "Java LSP profile is missing_jdtls."
          })
        })
      ])
    });
  });

  it("runs conservative source acquisition handlers through the high-level tool", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-source-runtime-");
    const workspaceRoot = await createJavaWorkspace();

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText:
        "Find source for a NeoForge mod from Modrinth without a workspace.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      executions: [
        {
          routeStep: "source_acquisition_plan",
          status: "context",
          payload: {
            source: "source_acquisition_plan",
            workItemExecutionStatus: "partial",
            workItemExecutions: expect.arrayContaining([
              expect.objectContaining({
                kind: "remote_metadata",
                status: "skipped",
                reason: "handler_unavailable"
              })
            ])
          }
        },
        {
          routeStep: "external_mod_resolution",
          status: "selected"
        }
      ]
    });
  });

  it("injects Hotai patch workflow guidance through the high-level tool", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-hotai-runtime-");
    const workspaceRoot = await createHotaiModpackWorkspace();

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText:
        "Use Hotai badiff patches from hotai/before_mixin and prove the local target owner before editing.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      promptGuidance: {
        activeFragmentIds: expect.arrayContaining([
          "task_intent_summary",
          "task_hotai_patch_workflow_policy"
        ]),
        exposedFragments: expect.arrayContaining([
          expect.objectContaining({
            id: "task_hotai_patch_workflow_policy",
            text: expect.stringContaining("class-only bytecode patch workflow")
          })
        ])
      },
      trace: {
        routeSteps: ["mod_archive_content", "docs_lookup"],
        selectedCandidateId: "candidate-1-mod_archive_content"
      },
      selectedEvidence: {
        payload: {
          source: "mod_archive_content",
          mode: "hotai_patch_proof",
          patchFileCount: 1,
          targetClassCount: 1,
          patches: [
            expect.objectContaining({
              relativePath: "hotai/before_mixin/com/example/problem/CrashHandler.badiff",
              phase: "before_mixin",
              targetClass: "com.example.problem.CrashHandler",
              proofStatus: "owner_matched",
              targetOwner: expect.objectContaining({
                sourceArchive: expect.stringContaining("mods/problem-mod.jar"),
                binaryName: "com.example.problem.CrashHandler"
              })
            })
          ]
        }
      }
    });
  });

  it("honors explicit operation route steps without depending on request text keywords", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-operations-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-operations-workspace-");

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText: "需要这个能力",
      runtimeRoot,
      workspaceRoot,
      operations: [
        {
          kind: "docs_lookup"
        }
      ]
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      trace: {
        routeSteps: ["docs_lookup"]
      },
      executions: [
        expect.objectContaining({
          routeStep: "docs_lookup",
          attempted: true
        })
      ]
    });
  });

  it("uses structured external mod requests for exact Modrinth constraints", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-operations-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-operations-workspace-");
    const fetchUrls: string[] = [];

    registerMcpServerTools(registry, {
      modrinthApiBaseUrl: "https://api.test.modrinth.local",
      modrinthFetch: async (url) => {
        fetchUrls.push(url.toString());
        if (url.pathname.includes("/version")) {
          return jsonResponse([
            {
              id: "version-id",
              version_number: "mc26.1.2-1.0.0-neoforge",
              loaders: ["neoforge"],
              game_versions: ["26.1.2"],
              files: [
                {
                  filename: "sodium-neoforge-26.1.2.jar",
                  url: "https://cdn.modrinth.test/sodium.jar",
                  hashes: { sha512: "abc" },
                  primary: true
                }
              ]
            }
          ]);
        }

        return jsonResponse({
          id: "AANobbMI",
          slug: "sodium",
          title: "Sodium",
          project_type: "mod",
          downloads: 1_000_000
        });
      }
    });

    const result = await registry.calls[0].handler({
      requestText: "外部元数据精确解析",
      runtimeRoot,
      workspaceRoot,
      operations: [
        {
          kind: "external_mod_resolution",
          externalModRequests: [
            {
              platform: "modrinth",
              slug: "sodium",
              projectId: "AANobbMI",
              loader: "neoforge",
              minecraftVersion: "26.1.2"
            }
          ]
        }
      ]
    });

    expect(result.isError).toBeUndefined();
    expect(fetchUrls).toEqual([
      "https://api.test.modrinth.local/v2/project/AANobbMI",
      "https://api.test.modrinth.local/v2/project/sodium/version?loaders=%5B%22neoforge%22%5D&game_versions=%5B%2226.1.2%22%5D"
    ]);
    expect(result.structuredContent).toMatchObject({
      selectedEvidence: {
        routeStep: "external_mod_resolution",
        payload: {
          source: "external_mod_resolution",
          request: {
            platform: "modrinth",
            slug: "sodium",
            projectId: "AANobbMI",
            loader: "neoforge",
            minecraftVersion: "26.1.2"
          },
          result: {
            candidates: [
              {
                slug: "sodium",
                fileName: "sodium-neoforge-26.1.2.jar"
              }
            ]
          }
        }
      }
    });
  });

  it("uses structured operation inputs instead of request text keywords", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-structured-runtime-");
    const workspaceRoot = await createJavaWorkspace();

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText: "需要这个能力",
      runtimeRoot,
      workspaceRoot,
      operations: [
        {
          kind: "workspace_source",
          workspaceSource: {
            javaSymbols: ["example.Broken"]
          }
        }
      ]
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      trace: {
        routeSteps: ["workspace_source"],
        selectedCandidateId: "candidate-1-workspace_source"
      },
      selectedEvidence: {
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
    });
  });

  it("uses structured mod archive operation inputs for class owner lookup", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-structured-runtime-");
    const workspaceRoot = await createCrashModpackWorkspace();

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText: "需要这个能力",
      runtimeRoot,
      workspaceRoot,
      operations: [
        {
          kind: "mod_archive_content",
          modArchive: {
            classOwners: ["com.example.problem.CrashHandler"]
          }
        }
      ]
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      trace: {
        routeSteps: ["mod_archive_content"],
        selectedCandidateId: "candidate-1-mod_archive_content"
      },
      selectedEvidence: {
        payload: {
          source: "mod_archive_content",
          mode: "class_owner",
          requestedClasses: ["com.example.problem.CrashHandler"]
        }
      }
    });
  });

  it("uses structured docs query input without encoding it in request text", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-structured-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-structured-workspace-");

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText: "需要这个能力",
      runtimeRoot,
      workspaceRoot,
      operations: [
        {
          kind: "docs_lookup",
          docsQuery: "NeoForge register event"
        }
      ]
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      trace: {
        routeSteps: ["docs_lookup"]
      },
      executions: [
        expect.objectContaining({
          routeStep: "docs_lookup",
          queryHint: "NeoForge register event",
          payload: expect.objectContaining({
            source: "docs_lookup",
            queryText: "NeoForge register event"
          })
        })
      ]
    });
  });

  it("uses structured ProbeJS resource export controls without request text keywords", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-structured-runtime-");
    const workspaceRoot = await createKubeJsProbeWorkspace();

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText: "需要这个能力",
      runtimeRoot,
      workspaceRoot,
      operations: [
        {
          kind: "probejs_types",
          probeJs: {
            resourceOnly: true,
            resourceKinds: ["item"],
            resourceLimitPerKind: 0
          }
        }
      ]
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      trace: {
        routeSteps: ["probejs_types"],
        selectedCandidateId: "candidate-1-probejs_types"
      },
      selectedEvidence: {
        queryHint: "item",
        payload: {
          source: "probejs_resources",
          queryMode: "resource_summary",
          resourceQueries: [],
          probeResources: {
            summary: {
              counts: { item: 0 },
              totalCounts: { item: 2 },
              truncated: true
            },
            entries: {
              item: []
            }
          }
        }
      }
    });
  });

  it("uses structured datapack resource-pack mode without request text keywords", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-structured-runtime-");
    const workspaceRoot = await createResourcePackWorkspace();

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText: "需要这个能力",
      runtimeRoot,
      workspaceRoot,
      operations: [
        {
          kind: "datapack_files",
          datapack: {
            mode: "resource_pack"
          }
        }
      ]
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      trace: {
        routeSteps: ["datapack_files"],
        selectedCandidateId: "candidate-1-datapack_files"
      },
      selectedEvidence: {
        payload: {
          source: "datapack_files",
          resourceRootSummary: {
            entryCount: 1
          }
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

async function createHotaiModpackWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-mcp-hotai-pack-");

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
  await writeBinary(
    join(
      workspaceRoot,
      "hotai",
      "before_mixin",
      "com",
      "example",
      "problem",
      "CrashHandler.badiff"
    ),
    Buffer.from("badiff fixture")
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

async function createResourcePackWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-mcp-resource-pack-");

  await writeText(
    join(
      workspaceRoot,
      "assets",
      "example",
      "models",
      "item",
      "demo.json"
    ),
    '{"parent":"minecraft:item/generated"}\n'
  );

  return workspaceRoot;
}

async function createKubeJsProbeWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-mcp-kubejs-probe-");

  await writeText(
    join(workspaceRoot, "kubejs", "server_scripts", "main.js"),
    "ServerEvents.recipes(event => {});\n"
  );
  await writeText(
    join(workspaceRoot, "kubejs", "probejs", "items", "example.txt"),
    "example:alpha\nexample:beta\n"
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

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
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
