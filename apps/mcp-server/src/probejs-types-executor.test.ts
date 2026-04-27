import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createKubeJsLanguageServiceCache,
  type KubeJsLanguageServiceProject
} from "@mcpskill/kubejs-language-service";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";
import { createMcpServerProbeJsTypesExecutor } from "./probejs-types-executor.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("createMcpServerProbeJsTypesExecutor", () => {
  it("reuses cached KubeJS language projects for repeated ProbeJS semantic queries", async () => {
    const workspaceRoot = await createKubeJsLanguageWorkspace();
    const input = await createProbeJsExecutorInput(workspaceRoot);
    const languageProjectCache =
      createKubeJsLanguageServiceCache<KubeJsLanguageServiceProject>({
        maxEntries: 2
      });
    const executor = createMcpServerProbeJsTypesExecutor({
      languageProjectCache
    });

    const first = await executor(input);
    const second = await executor(input);

    expect(first).toMatchObject({
      matched: true,
      payload: {
        cacheHit: false,
        source: "kubejs_language_service"
      }
    });
    expect(second).toMatchObject({
      matched: true,
      payload: {
        cacheHit: true,
        source: "kubejs_language_service"
      }
    });
    expect(languageProjectCache.size()).toBe(1);

    languageProjectCache.clear();
  });

  it("reuses cached KubeJS language projects for different symbols in the same workspace", async () => {
    const workspaceRoot = await createKubeJsLanguageWorkspace();
    const languageProjectCache =
      createKubeJsLanguageServiceCache<KubeJsLanguageServiceProject>({
        maxEntries: 2
      });
    const executor = createMcpServerProbeJsTypesExecutor({
      languageProjectCache
    });

    const first = await executor(await createProbeJsExecutorInput(workspaceRoot));
    const second = await executor(
      await createProbeJsExecutorInput(
        workspaceRoot,
        "Use KubeJS server_scripts ServerEvents.recipes in this modpack."
      )
    );

    expect(first).toMatchObject({
      matched: true,
      payload: {
        cacheHit: false,
        symbol: "ItemEvents.foodEaten"
      }
    });
    expect(second).toMatchObject({
      matched: true,
      payload: {
        cacheHit: true,
        quickInfo: expect.stringContaining("recipes(handler"),
        symbol: "ServerEvents.recipes"
      }
    });
    expect(languageProjectCache.size()).toBe(1);

    languageProjectCache.clear();
  });

  it("includes compact ProbeJS resources that match the request", async () => {
    const workspaceRoot = await createKubeJsLanguageWorkspace();
    const input = await createProbeJsExecutorInput(
      workspaceRoot,
      [
        "Use KubeJS server_scripts ItemEvents.foodEaten with minecraft:stone,",
        "minecraft:block, minecraft:water, #forge:ingots/iron,",
        "item.minecraft.diamond, and ItemStack."
      ].join(" ")
    );
    const executor = createMcpServerProbeJsTypesExecutor();

    const result = await executor(input);

    expect(result).toMatchObject({
      matched: true,
      payload: {
        probeResources: {
          entries: {
            item: [
              {
                name: "minecraft:stone",
                value: "minecraft:stone",
                file: "kubejs/probejs/items/minecraft.txt"
              }
            ],
            registry: [
              {
                name: "minecraft:block",
                value: "minecraft:block",
                file: "kubejs/probejs/registries/blocks.txt"
              }
            ],
            fluid: [
              {
                name: "minecraft:water",
                value: "minecraft:water",
                file: ".vscode/fluid-attributes.json"
              }
            ],
            tag: [
              {
                name: "forge:ingots/iron",
                value: "#forge:ingots/iron",
                file: ".vscode/item-tag-attributes.json"
              }
            ],
            language_key: [
              {
                name: "item.minecraft.diamond",
                value: "item.minecraft.diamond",
                file: ".vscode/lang-keys.json",
                metadata: {
                  label: "Diamond",
                  selectedLanguage: "en_us"
                }
              }
            ],
            class: [
              {
                name: "net.minecraft.world.item.ItemStack",
                value: "net.minecraft.world.item.ItemStack",
                file: ".vscode/probe.class-definitions.json",
                metadata: {
                  packageName: "net.minecraft.world.item",
                  simpleName: "ItemStack"
                }
              }
            ],
            snippet: [
              {
                confidence: 0.95,
                extractorId: "vscode-code-snippets-json-v1",
                name: "Food Eaten",
                sourceFormat: "vscode-code-snippets-json",
                value: "ItemEvents.foodEaten",
                file: ".vscode/probe.code-snippets"
              }
            ]
          },
          unknownResources: []
        }
      }
    });
  });

  it("omits unrelated ProbeJS resources for a symbol-only request", async () => {
    const workspaceRoot = await createKubeJsLanguageWorkspace();
    const input = await createProbeJsExecutorInput(workspaceRoot);
    const executor = createMcpServerProbeJsTypesExecutor();

    const result = await executor(input);

    expect(result).toMatchObject({
      matched: true,
      payload: {
        probeResources: {
          entries: {
            item: [],
            registry: [],
            fluid: [],
            tag: [],
            language_key: [],
            class: [],
            snippet: [
              {
                name: "Food Eaten",
                value: "ItemEvents.foodEaten"
              }
            ]
          },
          unknownResources: []
        }
      }
    });
  });

  it("uses a virtual query script when the requested symbol is not in project scripts", async () => {
    const workspaceRoot = await createKubeJsLanguageWorkspace({
      scriptContent: "ServerEvents.recipes(event => {});\n",
      probeLayout: "kubejs-probe-generated"
    });
    const input = await createProbeJsExecutorInput(workspaceRoot);
    const executor = createMcpServerProbeJsTypesExecutor();

    const result = await executor(input);

    expect(result).toMatchObject({
      matched: true,
      payload: {
        declarationCount: 1,
        queryMode: "virtual",
        quickInfo: expect.stringContaining("foodEaten(handler")
      }
    });
  });

  it("does not return unrelated diagnostics from the selected workspace script", async () => {
    const workspaceRoot = await createKubeJsLanguageWorkspace({
      scriptContent: "MissingGlobal.call();\n"
    });
    const input = await createProbeJsExecutorInput(workspaceRoot);
    const executor = createMcpServerProbeJsTypesExecutor();

    const result = await executor(input);

    expect(result).toMatchObject({
      matched: true,
      payload: {
        diagnostics: []
      }
    });
  });
});

async function createProbeJsExecutorInput(
  workspaceRoot: string,
  requestText = "Use KubeJS server_scripts ItemEvents.foodEaten in this modpack."
) {
  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot: join(workspaceRoot, ".runtime"),
    workspace: {
      workspaceRoot
    }
  });
  const requestPlan = buildMcpServerRequestPlan(
    bootstrap,
    requestText
  );
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

interface CreateKubeJsLanguageWorkspaceOptions {
  scriptContent?: string;
  probeLayout?: "scoped-dot-probe" | "kubejs-probe-generated";
}

async function createKubeJsLanguageWorkspace(
  options: CreateKubeJsLanguageWorkspaceOptions = {}
): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-kjs-cache-"));
  tempRoots.push(workspaceRoot);

  await writeText(
    join(workspaceRoot, "kubejs", "server_scripts", "main.js"),
    options.scriptContent ??
      [
        "ItemEvents.foodEaten((event) => {",
        "  event.item.id;",
        "});",
        ""
      ].join("\n")
  );
  await writeText(
    probeDeclarationPath(workspaceRoot, options.probeLayout),
    [
      "declare const ItemEvents: {",
      "  foodEaten(handler: (event: { item: { id: string } }) => void): void;",
      "};",
      "declare const ServerEvents: {",
      "  recipes(handler: (event: { remove(input: string): void }) => void): void;",
      "};",
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
      {
        id: "minecraft:water",
        localized: "Water",
        bucketItem: "minecraft:water_bucket"
      },
      {
        id: "minecraft:lava",
        localized: "Lava",
        bucketItem: "minecraft:lava_bucket"
      }
    ])
  );
  await writeText(
    join(workspaceRoot, ".vscode", "item-tag-attributes.json"),
    JSON.stringify([
      {
        id: "forge:ingots/iron",
        items: ["minecraft:iron_ingot"]
      },
      {
        id: "forge:gems/diamond",
        items: ["minecraft:diamond"]
      }
    ])
  );
  await writeText(
    join(workspaceRoot, ".vscode", "lang-keys.json"),
    JSON.stringify([
      {
        key: "item.minecraft.diamond",
        languages: {
          en_us: "Diamond"
        },
        selected: "en_us"
      }
    ])
  );
  await writeText(
    join(workspaceRoot, ".vscode", "probe.class-definitions.json"),
    JSON.stringify({
      definitions: {
        typeClassName: {
          type: "string",
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
    join(workspaceRoot, "kubejs", "probejs", "registries", "blocks.txt"),
    "minecraft:block\nminecraft:item\n"
  );
  await writeText(
    join(workspaceRoot, "kubejs", "probe", "cache", "docs", "registry.json"),
    "{\"futureProbeShape\":[\"minecraft:item\"]}\n"
  );

  return workspaceRoot;
}

function probeDeclarationPath(
  workspaceRoot: string,
  layout: CreateKubeJsLanguageWorkspaceOptions["probeLayout"] = "scoped-dot-probe"
): string {
  if (layout === "kubejs-probe-generated") {
    return join(workspaceRoot, "kubejs", "probe", "generated", "events.d.ts");
  }
  return join(workspaceRoot, ".probe", "server", "events.d.ts");
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
