import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildSourceIndex } from "@mcpskill/source-index";
import { buildMcpServerContextQueryExecutor } from "./context-query-executor.js";
import type { McpServerEvidenceExecutorInput } from "../../request/execution/request-handler.js";

describe("context.query source acquisition plan", () => {
  it("returns compact source acquisition routes", async () => {
    const executor = buildMcpServerContextQueryExecutor();

    const result = await executor(inputFixture());

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "source_acquisition_plan",
        requiresWorkspace: false,
        routes: [
          {
            origin: "runtime_cache",
            artifactStrategy: "query_cached_packages_and_indexes",
            cacheMode: "runtime_source_index_cache",
            warnings: []
          },
          {
            origin: "modrinth",
            artifactStrategy: "resolve_remote_jar_metadata"
          }
        ],
        workItems: [
          {
            kind: "remote_metadata",
            source: "modrinth",
            cacheScope: "metadata"
          }
        ]
      }
    });
  });

  it("executes source acquisition work items when handlers are provided", async () => {
    const executor = buildMcpServerContextQueryExecutor({
      sourceAcquisitionWorkItemHandlers: {
        remoteMetadata: async (item) => ({
          summary: `resolved ${item.source}`,
          payload: {
            source: "test_remote_metadata",
            platform: item.source
          }
        })
      }
    });

    const result = await executor(inputFixture());

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "source_acquisition_plan",
        workItemExecutionStatus: "completed",
        workItemExecutions: [
          {
            kind: "remote_metadata",
            status: "completed",
            payload: {
              source: "test_remote_metadata",
              platform: "modrinth"
            }
          }
        ]
      }
    });
  });

  it("adds mapping index work items for versioned mapping requests", async () => {
    const executor = buildMcpServerContextQueryExecutor({
      sourceAcquisitionWorkItemHandlers: {
        mappingIndex: async (item) => ({
          summary: `indexed ${item.mappingFamily} ${item.minecraftVersion}`,
          payload: {
            source: "test_mapping_index",
            minecraftVersion: item.minecraftVersion,
            mappingFamily: item.mappingFamily
          }
        })
      }
    });

    const result = await executor(
      inputFixture({
        requestText: "Need Yarn mappings for Minecraft 1.21.1 mixin target."
      })
    );

    expect(result.matched).toBe(true);
    expect(result.payload).toMatchObject({
      source: "source_acquisition_plan"
    });
    expect((result.payload as { workItems: unknown[] }).workItems).toEqual(
      expect.arrayContaining([
        {
          kind: "mapping_index",
          minecraftVersion: "1.21.1",
          mappingFamily: "yarn",
          cacheScope: "private_runtime"
        }
      ])
    );
    expect(
      (result.payload as { workItemExecutions: unknown[] }).workItemExecutions
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "mapping_index",
          status: "completed",
          payload: {
            source: "test_mapping_index",
            minecraftVersion: "1.21.1",
            mappingFamily: "yarn"
          }
        })
      ])
    );
  });

  it("reports installed source index databases as immediately queryable evidence", async () => {
    const executor = buildMcpServerContextQueryExecutor({
      sourceIndexDatabasePaths: [
        "/runtime/artifacts/minecraft-1.20.1-source-index-0.1.0.sqlite"
      ]
    });

    const result = await executor(inputFixture());

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "source_acquisition_plan",
        cachedSourceIndexes: {
          databaseCount: 1,
          databases: [
            "/runtime/artifacts/minecraft-1.20.1-source-index-0.1.0.sqlite"
          ]
        }
      }
    });
  });

  it("previews lightweight source index hits for source acquisition requests", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-plan-src-"));
    const databasePath = join(sourceRoot, "source-index.sqlite");

    await mkdir(join(sourceRoot, "net", "minecraft", "world", "item"), {
      recursive: true
    });
    await writeFile(
      join(sourceRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
      [
        "package net.minecraft.world.item;",
        "public class ItemStack {",
        "  public ItemStack copy() { return this; }",
        "}"
      ].join("\n")
    );
    await buildSourceIndex({
      sourceRoot,
      databasePath,
      packageId: "minecraft-1.20.1-source-index"
    });

    const executor = buildMcpServerContextQueryExecutor({
      sourceIndexDatabasePaths: [databasePath]
    });

    const result = await executor(
      inputFixture({
        requestText: "Need source for net.minecraft.world.item.ItemStack copy method."
      })
    );

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "source_acquisition_plan",
        sourceIndexPreview: {
          query: "net.minecraft.world.item.ItemStack",
          searchedDatabaseCount: 1,
          matches: [
            {
              databasePath,
              path: "net/minecraft/world/item/ItemStack.java",
              qualifiedName: "net.minecraft.world.item.ItemStack",
              matchReasons: expect.arrayContaining(["symbol"])
            }
          ]
        }
      }
    });
  });

  it("skips wrong-version source index previews and keeps matching-version hits", async () => {
    const wrongSourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-plan-wrong-"));
    const rightSourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-plan-right-"));
    const wrongDatabasePath = join(wrongSourceRoot, "source-index.sqlite");
    const rightDatabasePath = join(rightSourceRoot, "source-index.sqlite");

    await writeItemStackSourceIndex(wrongSourceRoot, wrongDatabasePath, "1.21.1");
    await writeItemStackSourceIndex(rightSourceRoot, rightDatabasePath, "1.20.1");

    const executor = buildMcpServerContextQueryExecutor({
      sourceIndexDatabasePaths: [wrongDatabasePath, rightDatabasePath]
    });

    const result = await executor(
      inputFixture({
        requestText: "Need Minecraft 1.20.1 source for net.minecraft.world.item.ItemStack."
      })
    );

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "source_acquisition_plan",
        sourceIndexPreview: {
          query: "net.minecraft.world.item.ItemStack",
          searchedDatabaseCount: 2,
          matches: [
            {
              databasePath: rightDatabasePath,
              packageId: "minecraft-1.20.1-source-index",
              path: "net/minecraft/world/item/ItemStack.java"
            }
          ]
        }
      }
    });
  });

  it("keeps source acquisition planning available when a source index is unreadable", async () => {
    const executor = buildMcpServerContextQueryExecutor({
      sourceIndexDatabasePaths: ["/missing/source-index.sqlite"]
    });

    const result = await executor(
      inputFixture({
        requestText: "Need source for net.minecraft.world.item.ItemStack."
      })
    );

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "source_acquisition_plan",
        sourceIndexPreview: {
          query: "net.minecraft.world.item.ItemStack",
          searchedDatabaseCount: 1,
          matches: [],
          warnings: [
            "Skipped unreadable source index /missing/source-index.sqlite."
          ]
        }
      }
    });
  });
});

function inputFixture(input: { requestText?: string } = {}): McpServerEvidenceExecutorInput {
  const requestText =
    input.requestText ?? "Find source for a NeoForge mod from Modrinth.";

  return {
    candidate: {
      id: "candidate-1-source_acquisition_plan",
      priority: 1,
      tier: "primary",
      routeStep: "source_acquisition_plan",
      provenance: "source_acquisition",
      preferredTool: "context.query",
      estimatedCost: "low",
      reliability: "high",
      reason: "Plan source acquisition.",
      pathHints: [],
      queryHint: requestText
    },
    evidencePlan: {
      appId: "mcp-server",
      requestPlan: requestPlanFixture(),
      candidates: [],
      trace: {
        routeSteps: ["source_acquisition_plan"],
        candidateIds: [],
        fallbackCandidateIds: []
      }
    },
    requestPlan: requestPlanFixture({ requestText })
  };
}

async function writeItemStackSourceIndex(
  sourceRoot: string,
  databasePath: string,
  minecraftVersion: string
): Promise<void> {
  await mkdir(join(sourceRoot, "net", "minecraft", "world", "item"), {
    recursive: true
  });
  await writeFile(
    join(sourceRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
    "package net.minecraft.world.item;\npublic class ItemStack {}\n"
  );
  await buildSourceIndex({
    sourceRoot,
    databasePath,
    packageId: `minecraft-${minecraftVersion}-source-index`
  });
}

function requestPlanFixture(input: {
  requestText?: string;
} = {}): McpServerEvidenceExecutorInput["requestPlan"] {
  const requestText =
    input.requestText ?? "Find source for a NeoForge mod from Modrinth.";

  return {
    appId: "mcp-server",
    requestText,
    requestContext: {},
    toolGuidance: {
      availableTools: ["context.query"],
      preferredTools: ["context.query"],
      routeSteps: ["source_acquisition_plan"]
    },
    trace: {
      bootstrapKind: "mcp-server",
      harnessSnapshot: {
        workspaceKind: "unknown",
        detectorReasons: [],
        routePlan: {
          scenario: "unknown-workspace",
          reasons: [],
          steps: ["docs_lookup"]
        },
        facts: {
          hasGradle: false,
          hasJavaSource: false,
          hasKubeJS: false,
          hasProbeJS: false,
          hasModArchives: false,
          hasDatapack: false,
          hasResourcePack: false,
          buildFileCount: 0,
          javaSourceRootCount: 0,
          datapackRootCount: 0,
          resourcePackRootCount: 0,
          logPathCount: 0
        }
      },
      taskIntent: {
        id: "external_mod_resolution",
        confidence: "high",
        reasons: []
      },
      taskBrief: {
        snapshot: {
          workspaceKind: "unknown",
          detectorReasons: [],
          routePlan: {
            scenario: "unknown-workspace",
            reasons: [],
            steps: ["docs_lookup"]
          },
          facts: {
            hasGradle: false,
            hasJavaSource: false,
            hasKubeJS: false,
            hasProbeJS: false,
            hasModArchives: false,
            hasDatapack: false,
            hasResourcePack: false,
            buildFileCount: 0,
            javaSourceRootCount: 0,
            datapackRootCount: 0,
            resourcePackRootCount: 0,
            logPathCount: 0
          }
        },
        intent: {
          id: "external_mod_resolution",
          confidence: "high",
          reasons: []
        },
        taskRoute: {
          intent: {
            id: "external_mod_resolution",
            confidence: "high",
            reasons: []
          },
          reasons: [],
          steps: ["source_acquisition_plan"],
          preferredTools: ["context.query"]
        },
        availableTools: ["context.query"],
        preferredTools: ["context.query"],
        promptFragments: []
      }
    }
  };
}
