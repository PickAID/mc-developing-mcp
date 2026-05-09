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

describe("mc_develop source acquisition acceptance", () => {
  it("indexes workspace mod jars through source acquisition context evidence", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-source-e2e-runtime-");
    const workspaceRoot = await createModpackWorkspace();

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText:
        "Find source for the local mod jar from Modrinth without downloading.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      workspacePreparation: expect.objectContaining({
        source: "source_acquisition_plan",
        capabilityMap: expect.objectContaining({
          mode: "progressive_discovery"
        })
      }),
      executions: expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          status: "context",
          payload: expect.objectContaining({
            source: "source_acquisition_plan",
            workItemExecutionStatus: "partial",
            workItemExecutions: expect.arrayContaining([
              expect.objectContaining({
                kind: "jar_index",
                status: "completed",
                payload: expect.objectContaining({
                  source: "source_acquisition_jar_index",
                  archiveCount: 1,
                  entryCount: 3,
                  domainCounts: {
                    assets: 1,
                    class: 1,
                    data: 1
                  }
                })
              }),
              expect.objectContaining({
                kind: "remote_metadata",
                status: "skipped",
                reason: "handler_unavailable"
              })
            ])
          })
        })
      ])
    });
  });

  it("returns vanilla generation confirmation evidence from request text version", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-vanilla-e2e-runtime-");
    const workspaceRoot = await createEmptyWorkspace();

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText:
        "Find source for official Minecraft vanilla 1.20.1 from Modrinth context.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      executions: expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          status: "context",
          payload: expect.objectContaining({
            source: "source_acquisition_plan",
            workItemExecutions: expect.arrayContaining([
              expect.objectContaining({
                kind: "vanilla_generation",
                status: "completed",
                payload: expect.objectContaining({
                  source: "source_acquisition_vanilla_generation",
                  result: expect.objectContaining({
                    status: "needs_confirmation",
                    packageId: "minecraft-1.20.1-source-pack-named",
                    confirmationScope: "package-version"
                  })
                })
              })
            ])
          })
        })
      ])
    });
  });

  it("materializes mapping indexes through an injected provider", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-mapping-e2e-runtime-");
    const workspaceRoot = await createEmptyWorkspace();

    registerMcpServerTools(registry, {
      mappingIndexProvider: async () => ({
        provenance: { source: "test-provider" },
        entries: [
          {
            fromNamespace: "official",
            toNamespace: "named",
            fromName: "a",
            toName: "net.minecraft.world.item.ItemStack",
            kind: "class"
          }
        ]
      })
    });

    const result = await registry.calls[0].handler({
      requestText:
        "Find source for a NeoForge mod from Modrinth and Yarn mappings for Minecraft 1.21.1 mixin target.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      executions: expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          payload: expect.objectContaining({
            workItemExecutions: expect.arrayContaining([
              expect.objectContaining({
                kind: "mapping_index",
                status: "completed",
                payload: expect.objectContaining({
                  source: "source_acquisition_mapping_index",
                  status: "ready",
                  minecraftVersion: "1.21.1",
                  mappingFamily: "yarn",
                  entryCount: 1,
                  cache: expect.objectContaining({
                    scope: "private_runtime"
                  })
                })
              })
            ])
          })
        })
      ])
    });
  });

  it("materializes Yarn mappings from a configured Tiny v2 URL template", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-mapping-template-runtime-");
    const workspaceRoot = await createEmptyWorkspace();
    const fetchedUrls: string[] = [];

    registerMcpServerTools(registry, {
      env: {
        MCPSKILL_YARN_MAPPING_URL_TEMPLATE:
          "https://maven.test/yarn/{version}/mappings.tiny"
      },
      mappingIndexFetch: async (url) => {
        fetchedUrls.push(url.toString());
        return new Response(
          "tiny\t2\t0\tofficial\tnamed\nc\ta\tnet.minecraft.TemplateHit\n",
          { status: 200 }
        );
      }
    });

    const result = await registry.calls[0].handler({
      requestText:
        "Find source for a NeoForge mod from Modrinth and Yarn mappings for Minecraft 1.21.1 mixin target.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(fetchedUrls).toEqual([
      "https://maven.test/yarn/1.21.1/mappings.tiny"
    ]);
    expect(result.structuredContent).toMatchObject({
      executions: expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          payload: expect.objectContaining({
            workItemExecutions: expect.arrayContaining([
              expect.objectContaining({
                kind: "mapping_index",
                payload: expect.objectContaining({
                  status: "ready",
                  entryCount: 1,
                  provenance: expect.objectContaining({
                    format: "tiny_v2",
                    fromNamespace: "official",
                    toNamespace: "named"
                  })
                })
              })
            ])
          })
        })
      ])
    });
  });

  it("materializes Yarn mappings from configured Fabric Maven metadata", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-mapping-maven-runtime-");
    const workspaceRoot = await createEmptyWorkspace();
    const fetchedUrls: string[] = [];

    registerMcpServerTools(registry, {
      env: {
        MCPSKILL_YARN_MAVEN_BASE_URL: "https://maven.fabricmc.test"
      },
      mappingIndexFetch: async (url) => {
        fetchedUrls.push(url.toString());
        if (url.pathname.endsWith("/maven-metadata.xml")) {
          return new Response(
            [
              "<metadata><versioning><versions>",
              "<version>1.21.1+build.2</version>",
              "<version>1.20.1+build.10</version>",
              "<version>1.21.1+build.12</version>",
              "</versions></versioning></metadata>"
            ].join(""),
            { status: 200 }
          );
        }

        return new Response(
          createZipWithContents([
            {
              name: "mappings/mappings.tiny",
              content:
                "tiny\t2\t0\tofficial\tnamed\nc\ta\tnet.minecraft.MavenHit\n"
            }
          ]),
          { status: 200 }
        );
      }
    });

    const result = await registry.calls[0].handler({
      requestText:
        "Find source for a NeoForge mod from Modrinth and Yarn mappings for Minecraft 1.21.1 mixin target.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(fetchedUrls).toEqual([
      "https://maven.fabricmc.test/net/fabricmc/yarn/maven-metadata.xml",
      "https://maven.fabricmc.test/net/fabricmc/yarn/1.21.1%2Bbuild.12/yarn-1.21.1%2Bbuild.12-v2.jar"
    ]);
    expect(result.structuredContent).toMatchObject({
      executions: expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          payload: expect.objectContaining({
            workItemExecutions: expect.arrayContaining([
              expect.objectContaining({
                kind: "mapping_index",
                payload: expect.objectContaining({
                  status: "ready",
                  entryCount: 1,
                  provenance: expect.objectContaining({
                    yarnVersion: "1.21.1+build.12"
                  })
                })
              })
            ])
          })
        })
      ])
    });
  });

  it("does not fetch Yarn mappings when no mapping provider is configured", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-mapping-disabled-runtime-");
    const workspaceRoot = await createEmptyWorkspace();
    const fetchedUrls: string[] = [];

    registerMcpServerTools(registry, {
      env: {
        MCPSKILL_YARN_MAPPING_URL_TEMPLATE: undefined,
        MCPSKILL_YARN_MAVEN_BASE_URL: undefined,
        MCPSKILL_MOJANG_VERSION_MANIFEST_URL: undefined,
        MCPSKILL_PARCHMENT_MAVEN_BASE_URL: undefined
      },
      mappingIndexFetch: async (url) => {
        fetchedUrls.push(url.toString());
        return new Response("", { status: 500 });
      }
    });

    const result = await registry.calls[0].handler({
      requestText:
        "Find source for a NeoForge mod from Modrinth and Yarn mappings for Minecraft 1.21.1 mixin target.",
      runtimeRoot,
      workspaceRoot
    });

    expect(result.isError).toBeUndefined();
    expect(fetchedUrls).toEqual([]);
    expect(result.structuredContent).toMatchObject({
      executions: expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          payload: expect.objectContaining({
            workItemExecutions: expect.arrayContaining([
              expect.objectContaining({
                kind: "mapping_index",
                payload: expect.objectContaining({
                  status: "provider_required",
                  minecraftVersion: "1.21.1",
                  mappingFamily: "yarn"
                })
              })
            ])
          })
        })
      ])
    });
  });

  it("honors explicit preparation route origins without auto-adding remote providers", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-explicit-routes-runtime-");
    const workspaceRoot = await createModpackWorkspace();

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText:
        "Prepare source acquisition routes for this modpack. Do not infer remote providers.",
      runtimeRoot,
      workspaceRoot,
      preparationRoutes: ["runtime_cache", "local_jar"]
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      selectedEvidence: expect.objectContaining({
        routeStep: "source_acquisition_plan",
        payload: expect.objectContaining({
          routes: [
            expect.objectContaining({ origin: "runtime_cache" }),
            expect.objectContaining({ origin: "local_jar" })
          ],
          capabilityGuidance: expect.objectContaining({
            capabilityMap: expect.objectContaining({
              routeCapabilities: [
                expect.objectContaining({ origin: "runtime_cache" }),
                expect.objectContaining({ origin: "local_jar" })
              ]
            })
          })
        })
      })
    });
    const selected = (result.structuredContent as any).selectedEvidence;
    expect(selected.payload.routes.map((route: any) => route.origin)).toEqual([
      "runtime_cache",
      "local_jar"
    ]);
  });

  it("honors explicit local jar prewarm mode with compact shared-cache evidence", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-prewarm-runtime-");
    const workspaceRoot = await createModpackWorkspace();

    registerMcpServerTools(registry);

    const prewarm = await registry.calls[0].handler({
      requestText:
        "后台预热这个整合包的本地 mod jar 索引，之后用于 crash 和资源 owner 查询。",
      runtimeRoot,
      workspaceRoot,
      preparationRoutes: ["local_jar"],
      preparationPolicy: { localJarMode: "prewarm_entry_index" }
    });
    const inspect = await registry.calls[0].handler({
      requestText: "Inspect the local jar evidence from the runtime cache.",
      runtimeRoot,
      workspaceRoot,
      preparationRoutes: ["local_jar"]
    });

    expect(prewarm.isError).toBeUndefined();
    expect(prewarm.structuredContent).toMatchObject({
      selectedEvidence: expect.objectContaining({
        routeStep: "source_acquisition_plan",
        payload: expect.objectContaining({
          workItemExecutions: expect.arrayContaining([
            expect.objectContaining({
              kind: "jar_index",
              status: "completed",
              payload: expect.objectContaining({
                source: "source_acquisition_jar_index",
                mode: "prewarm_entry_index",
                tokenPolicy: "counts_only",
                archiveCount: 1,
                entryCount: 3,
                cache: expect.objectContaining({
                  databasePath: join(
                    runtimeRoot,
                    "caches",
                    "mod-archives",
                    "mod-archive-inventory.sqlite"
                  ),
                  archiveMisses: 1
                })
              })
            })
          ])
        })
      })
    });
    expect(JSON.stringify(prewarm.structuredContent)).not.toContain(
      "sampleEntries"
    );
    expect(inspect.structuredContent).toMatchObject({
      selectedEvidence: expect.objectContaining({
        payload: expect.objectContaining({
          workItemExecutions: expect.arrayContaining([
            expect.objectContaining({
              kind: "jar_index",
              payload: expect.objectContaining({
                mode: "inspect",
                cache: expect.objectContaining({
                  archiveHits: 1,
                  archiveMisses: 0
                })
              })
            })
          ])
        })
      })
    });
  });

  it("infers local jar prewarm mode from explicit prewarm requests", async () => {
    const registry = createCapturingRegistry();
    const runtimeRoot = await createTempRoot("mcpskill-inferred-prewarm-runtime-");
    const workspaceRoot = await createModpackWorkspace();

    registerMcpServerTools(registry);

    const result = await registry.calls[0].handler({
      requestText:
        "Prewarm the local mod jar entry index for later crash triage.",
      runtimeRoot,
      workspaceRoot,
      preparationRoutes: ["local_jar"]
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      selectedEvidence: expect.objectContaining({
        routeStep: "source_acquisition_plan",
        payload: expect.objectContaining({
          workItemExecutions: expect.arrayContaining([
            expect.objectContaining({
              kind: "jar_index",
              status: "completed",
              payload: expect.objectContaining({
                source: "source_acquisition_jar_index",
                mode: "prewarm_entry_index",
                tokenPolicy: "counts_only",
                archiveCount: 1,
                entryCount: 3
              })
            })
          ])
        })
      })
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain(
      "sampleEntries"
    );
  });

});

async function createModpackWorkspace(): Promise<string> {
  const root = await createTempRoot("mcpskill-source-e2e-workspace-");
  await writeBinary(
    join(root, "mods", "content.jar"),
    createZip([
      "assets/demo/models/item/gear.json",
      "data/demo/recipe/gear.json",
      "com/example/Gear.class"
    ])
  );
  return root;
}

async function createEmptyWorkspace(): Promise<string> {
  const root = await createTempRoot("mcpskill-source-e2e-empty-");
  await mkdir(root, { recursive: true });
  return root;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function writeBinary(path: string, content: Buffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

function createCapturingRegistry(): CapturingRegistry {
  const calls: RegisteredToolCall[] = [];

  return {
    calls,
    registerTool(name, _config, handler) {
      calls.push({ name, handler });
    }
  };
}

function createZip(entryNames: string[]): Buffer {
  return createZipWithContents(
    entryNames.map((name) => ({
      name,
      content: "{}\n"
    }))
  );
}

function createZipWithContents(entries: Array<{ name: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.from(entry.content);
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
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localFiles.length, 16);

  return Buffer.concat([localFiles, centralDirectory, eocd]);
}

interface CapturingRegistry {
  calls: RegisteredToolCall[];
  registerTool: (name: string, config: unknown, handler: McpToolHandler) => void;
}

interface RegisteredToolCall {
  name: string;
  handler: McpToolHandler;
}
