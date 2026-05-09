import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";
import { createMcpServerProbeJsTypesExecutor } from "./probejs-types-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("ProbeJS resource-only summaries", () => {
  it("returns counts-first resources without requiring a symbol query", async () => {
    const workspaceRoot = await createProbeResourceWorkspace();
    const input = await createProbeJsExecutorInput(
      workspaceRoot,
      "List KubeJS ProbeJS items, tags, fluids, registries, and snippets for this modpack."
    );
    const executor = createMcpServerProbeJsTypesExecutor();

    const result = await executor(input);

    expect(result).toMatchObject({
      matched: true,
      summary:
        "Summarized ProbeJS resources without requiring a TypeScript symbol query.",
      payload: {
        source: "probejs_resources",
        queryMode: "resource_summary",
        resourceQueries: [],
        probeResources: {
          summary: {
            counts: {
              item: 2,
              registry: 2,
              fluid: 2,
              tag: 2,
              language_key: 1,
              class: 2,
              recipe: 2,
              snippet: 1
            },
            totalCounts: {
              item: 2,
              registry: 2,
              fluid: 2,
              tag: 2,
              language_key: 1,
              class: 2,
              recipe: 2,
              snippet: 1
            }
          },
          capabilityUsage: {
            capability: "probejs_resource_summary",
            resourceUseCases: expect.arrayContaining([
              expect.objectContaining({
                sourceKind: "item",
                useFor: expect.arrayContaining(["validate item ids"])
              }),
              expect.objectContaining({
                sourceKind: "snippet",
                kubeJsContexts: expect.arrayContaining(["server_scripts"])
              }),
              expect.objectContaining({
                sourceKind: "recipe",
                useFor: expect.arrayContaining(["validate recipe ids"])
              })
            ])
          },
          unknownResources: []
        }
      }
    });
    const payload = result.payload as any;
    expect(payload.probeResources.entries.item).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "minecraft:stone",
          value: "minecraft:stone",
          file: "kubejs/probejs/items/minecraft.txt"
        })
      ])
    );
    expect(payload.probeResources.entries.snippet).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Food Eaten",
          value: "ItemEvents.foodEaten"
        })
      ])
    );
    expect(payload.probeResources.entries.recipe).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "minecraft:crafting_shaped",
          value: "minecraft:crafting_shaped",
          file: "kubejs/probejs/recipes/minecraft.txt"
        })
      ])
    );
    expect(JSON.stringify(result)).not.toContain("quickInfo");
    expect(JSON.stringify(result)).not.toContain("diagnostics");
  });

  it("reuses cached resource-only summaries for repeated requests", async () => {
    const workspaceRoot = await createProbeResourceWorkspace();
    const input = await createProbeJsExecutorInput(
      workspaceRoot,
      "List KubeJS ProbeJS items and tags in this modpack."
    );
    const executor = createMcpServerProbeJsTypesExecutor();

    const first = await executor(input);
    const second = await executor(input);

    expect(first).toMatchObject({
      matched: true,
      payload: {
        source: "probejs_resources",
        probeResourceCacheHit: false
      }
    });
    expect(second).toMatchObject({
      matched: true,
      payload: {
        source: "probejs_resources",
        probeResourceCacheHit: true
      }
    });
  });

  it("keeps natural-language KubeJS requests without resource intent unmatched", async () => {
    const workspaceRoot = await createProbeResourceWorkspace();
    const input = await createProbeJsExecutorInput(
      workspaceRoot,
      "ProbeJS can you explain recipes and scripts in this pack?"
    );
    const executor = createMcpServerProbeJsTypesExecutor();

    await expect(executor(input)).resolves.toMatchObject({
      matched: false,
      summary: "No KubeJS symbol was found in the request text."
    });
  });

  it("summarizes generic ProbeJS discovery requests without an explicit symbol", async () => {
    const workspaceRoot = await createProbeResourceWorkspace();
    const input = await createProbeJsExecutorInput(
      workspaceRoot,
      "Discover ProbeJS types, snippets, items, recipes, registries, ForgeEvents, NativeEvents, and Global usage."
    );
    const executor = createMcpServerProbeJsTypesExecutor();

    const result = await executor(input);

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "probejs_resources",
        queryMode: "resource_summary",
        probeResources: {
          summary: {
            counts: {
              item: 2,
              registry: 2,
              recipe: 2,
              snippet: 1
            }
          }
        },
        lifecycleEvidence: {
          declarationScopes: expect.arrayContaining(["startup"])
        },
        nativeEventEvidence: {
          forgeEvents: {
            declarationFiles: expect.arrayContaining([
              ".probe/startup/events.d.ts"
            ])
          },
          nativeEvents: {
            declarationFiles: expect.arrayContaining([
              ".probe/startup/events.d.ts"
            ])
          }
        },
        globalStateEvidence: {
          usages: expect.arrayContaining([
            expect.objectContaining({
              object: "Global",
              key: "recipeOwner"
            })
          ])
        }
      }
    });
  });

  it("summarizes Chinese ProbeJS overview requests without an explicit symbol", async () => {
    const workspaceRoot = await createProbeResourceWorkspace();
    const input = await createProbeJsExecutorInput(
      workspaceRoot,
      "在这个整合包中优先使用 ProbeJS/KubeJS evidence，列出现有 kubejs 脚本入口、可用 registry/type 线索。"
    );
    const executor = createMcpServerProbeJsTypesExecutor();

    await expect(executor(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "probejs_resources",
        queryMode: "resource_summary",
        probeResources: {
          summary: {
            counts: {
              item: 2,
              registry: 2,
              snippet: 1
            }
          }
        }
      }
    });
  });

  it("summarizes Chinese ProbeJS resource requests with localized resource terms", async () => {
    const workspaceRoot = await createProbeResourceWorkspace();
    const input = await createProbeJsExecutorInput(
      workspaceRoot,
      "列出 ProbeJS 物品、注册表、配方、标签、流体和资源。"
    );
    const executor = createMcpServerProbeJsTypesExecutor();

    await expect(executor(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "probejs_resources",
        queryMode: "resource_summary",
        probeResources: {
          summary: {
            counts: {
              item: 2,
              recipe: 2,
              registry: 2,
              fluid: 2,
              tag: 2
            }
          }
        }
      }
    });
  });

  it("includes script quality evidence for KubeJS lint and debug cleanup requests", async () => {
    const workspaceRoot = await createProbeResourceWorkspace({
      serverScriptContent: [
        "import helper from './helper.js';",
        "console.log('debug recipe');",
        "ForgeEvents.onEvent('net.minecraftforge.event.TickEvent', event => {});",
        ""
      ].join("\n")
    });
    const input = await createProbeJsExecutorInput(
      workspaceRoot,
      "检查 KubeJS server_scripts 的 lint、console 调试日志和生命周期作用域误用，并列出 ProbeJS evidence。"
    );
    const executor = createMcpServerProbeJsTypesExecutor();

    await expect(executor(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "probejs_resources",
        queryMode: "resource_summary",
        scriptQualityEvidence: {
          issueCount: 3,
          severityCounts: {
            error: 1,
            warning: 2
          },
          issues: expect.arrayContaining([
            expect.objectContaining({
              kind: "generic_js_module_pattern",
              file: "kubejs/server_scripts/main.js"
            }),
            expect.objectContaining({
              kind: "persistent_console_output"
            }),
            expect.objectContaining({
              kind: "lifecycle_scope_mismatch",
              severity: "error"
            })
          ])
        }
      }
    });
  });

  it("filters resource-only summaries by explicit IDs", async () => {
    const workspaceRoot = await createProbeResourceWorkspace();
    const input = await createProbeJsExecutorInput(
      workspaceRoot,
      "Search ProbeJS resources for minecraft:water and #forge:ingots/iron."
    );
    const executor = createMcpServerProbeJsTypesExecutor();

    const result = await executor(input);

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "probejs_resources",
        resourceQueries: [
          "minecraft:water",
          "#forge:ingots/iron",
          "forge:ingots/iron"
        ],
        probeResources: {
          entries: {
            fluid: [
              {
                name: "minecraft:water"
              }
            ],
            tag: [
              {
                name: "forge:ingots/iron"
              }
            ],
            item: []
          }
        }
      }
    });
  });
});

async function createProbeJsExecutorInput(
  workspaceRoot: string,
  requestText: string
) {
  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot: join(workspaceRoot, ".runtime"),
    workspace: { workspaceRoot }
  });
  const requestPlan = buildMcpServerRequestPlan(bootstrap, requestText);
  const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
  const candidate = evidencePlan.candidates.find(
    (item) => item.routeStep === "probejs_types"
  );

  if (!candidate) {
    throw new Error("Expected probejs_types candidate.");
  }

  return {
    candidate,
    evidencePlan,
    requestPlan
  };
}

async function createProbeResourceWorkspace(options: {
  serverScriptContent?: string;
} = {}): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-kjs-resource-"));
  tempRoots.push(workspaceRoot);

  await writeText(
    join(workspaceRoot, "kubejs", "server_scripts", "main.js"),
    options.serverScriptContent ??
      "ServerEvents.recipes(event => { Global.recipeOwner(event); });\n"
  );
  await writeText(
    join(workspaceRoot, "kubejs", "startup_scripts", "main.js"),
    "ForgeEvents.onEvent('net.minecraftforge.event.TickEvent', event => {});\n"
  );
  await writeText(
    join(workspaceRoot, ".probe", "server", "events.d.ts"),
    "declare const ServerEvents: { recipes(handler: unknown): void };\n"
  );
  await writeText(
    join(workspaceRoot, ".probe", "startup", "events.d.ts"),
    [
      "declare const ForgeEvents: { onEvent(name: string, handler: Function): void };",
      "declare const NativeEvents: { onEvent(type: unknown, handler: Function): void };",
      ""
    ].join("\n")
  );
  await writeText(
    join(workspaceRoot, ".vscode", "probe.code-snippets"),
    JSON.stringify({
      "Food Eaten": {
        prefix: "ItemEvents.foodEaten",
        body: ["ItemEvents.foodEaten(event => {})"]
      }
    })
  );
  await writeText(
    join(workspaceRoot, ".vscode", "fluid-attributes.json"),
    JSON.stringify([
      { id: "minecraft:water", localized: "Water" },
      { id: "minecraft:lava", localized: "Lava" }
    ])
  );
  await writeText(
    join(workspaceRoot, ".vscode", "item-tag-attributes.json"),
    JSON.stringify([
      { id: "forge:ingots/iron", items: ["minecraft:iron_ingot"] },
      { id: "forge:gems/diamond", items: ["minecraft:diamond"] }
    ])
  );
  await writeText(
    join(workspaceRoot, ".vscode", "lang-keys.json"),
    JSON.stringify([
      {
        key: "item.minecraft.diamond",
        languages: { en_us: "Diamond" },
        selected: "en_us"
      }
    ])
  );
  await writeText(
    join(workspaceRoot, ".vscode", "probe.class-definitions.json"),
    JSON.stringify({
      definitions: {
        typeClassName: {
          enum: [
            "net.minecraft.world.item.ItemStack",
            "net.minecraft.world.level.Level"
          ]
        }
      }
    })
  );
  await writeText(
    join(workspaceRoot, "kubejs", "probejs", "items", "minecraft.txt"),
    "minecraft:stone\nminecraft:dirt\n"
  );
  await writeText(
    join(workspaceRoot, "kubejs", "probejs", "recipes", "minecraft.txt"),
    "minecraft:crafting_shaped\nminecraft:smelting\n"
  );
  await writeText(
    join(workspaceRoot, "kubejs", "probejs", "registries", "blocks.txt"),
    "minecraft:block\nminecraft:item\n"
  );

  return workspaceRoot;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
