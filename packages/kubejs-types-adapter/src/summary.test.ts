import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { summarizeKubeJsTypeResources } from "./index.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("summarizeKubeJsTypeResources", () => {
  it("returns all matching semantic resources by default", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-summary-all");
    const itemIds = Array.from(
      { length: 25 },
      (_, index) => `example:item_${index}`
    );

    await writeText(
      join(workspaceRoot, "kubejs", "probejs", "items", "example.txt"),
      itemIds.join("\n")
    );

    const result = await summarizeKubeJsTypeResources({ workspaceRoot });

    expect(result.entries.item.map((entry) => entry.name)).toEqual(itemIds);
    expect(result.summary).toMatchObject({
      counts: {
        item: 25
      },
      totalCounts: {
        item: 25
      },
      truncated: false
    });
  });

  it("uses explicit resource kind and per-kind limits when requested", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-summary-limit");

    await writeText(
      join(workspaceRoot, "kubejs", "probejs", "items", "example.txt"),
      [
        "example:alpha_ingot",
        "example:beta_ingot",
        "example:gamma_ingot"
      ].join("\n")
    );
    await writeText(
      join(workspaceRoot, "kubejs", "probejs", "recipes", "example.txt"),
      "example:alpha_recipe\n"
    );

    const result = await summarizeKubeJsTypeResources({
      workspaceRoot,
      maxEntriesPerKind: 2,
      resourceKinds: ["item"],
      resourceQueries: ["ingot"]
    });

    expect(result.entries.item.map((entry) => entry.name)).toEqual([
      "example:alpha_ingot",
      "example:beta_ingot"
    ]);
    expect(result.entries.recipe).toEqual([]);
    expect(result.summary.counts.item).toBe(2);
    expect(result.summary.totalCounts.item).toBe(3);
    expect(result.summary.truncated).toBe(true);
  });

  it("extracts token-efficient snippets, items, and registries from ProbeJS resources", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-summary");

    await writeText(
      join(workspaceRoot, ".vscode", "probe.code-snippets"),
      JSON.stringify({
        "Food Eaten": {
          prefix: "ItemEvents.foodEaten",
          body: ["ItemEvents.foodEaten(event => {", "  ${1}", "})"],
          description: "Run when food is eaten"
        }
      })
    );
    await writeText(
      join(workspaceRoot, "kubejs", "probejs", "snippets", "recipes.txt"),
      [
        "# common snippets",
        "ServerEvents.recipes(event => {})",
        ""
      ].join("\n")
    );
    await writeText(
      join(workspaceRoot, "kubejs", "probejs", "items", "minecraft.txt"),
      ["minecraft:stone", "minecraft:dirt", "minecraft:oak_log"].join("\n")
    );
    await writeText(
      join(workspaceRoot, "kubejs", "probejs", "recipes", "minecraft.txt"),
      ["minecraft:crafting_shaped", "minecraft:smelting"].join("\n")
    );
    await writeText(
      join(workspaceRoot, "kubejs", "probejs", "registries", "blocks.txt"),
      "minecraft:block\n"
    );

    const result = await summarizeKubeJsTypeResources({
      workspaceRoot,
      maxEntriesPerKind: 2
    });

    expect(result.entries.snippet).toEqual([
      expect.objectContaining({
        confidence: 0.95,
        extractorId: "vscode-code-snippets-json-v1",
        name: "Food Eaten",
        sourceFormat: "vscode-code-snippets-json",
        value: "ItemEvents.foodEaten",
        metadata: {
          description: "Run when food is eaten"
        }
      }),
      expect.objectContaining({
        confidence: 0.75,
        extractorId: "probejs-line-list-v1",
        name: "ServerEvents.recipes(event => {})",
        sourceFormat: "text-line-list",
        value: "ServerEvents.recipes(event => {})",
        lineNumber: 2
      })
    ]);
    expect(result.entries.item.map((entry) => entry.name)).toEqual([
      "minecraft:stone",
      "minecraft:dirt"
    ]);
    expect(result.entries.registry).toEqual([
      expect.objectContaining({
        confidence: 0.75,
        extractorId: "probejs-line-list-v1",
        name: "minecraft:block",
        sourceFormat: "text-line-list",
        value: "minecraft:block"
      })
    ]);
    expect(result.entries.recipe).toEqual([
      expect.objectContaining({
        confidence: 0.75,
        extractorId: "probejs-line-list-v1",
        lineNumber: 1,
        name: "minecraft:crafting_shaped",
        sourceFormat: "text-line-list",
        value: "minecraft:crafting_shaped"
      }),
      expect.objectContaining({
        lineNumber: 2,
        name: "minecraft:smelting"
      })
    ]);
    expect(result.summary).toMatchObject({
      counts: {
        snippet: 2,
        item: 2,
        recipe: 2,
        registry: 1
      },
      totalCounts: {
        snippet: 2,
        item: 3,
        recipe: 2,
        registry: 1
      },
      truncated: true
    });
    expect(result.capabilityUsage.resourceUseCases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKind: "item",
          useFor: expect.arrayContaining(["validate item ids"]),
          kubeJsContexts: expect.arrayContaining(["ServerEvents.recipes"])
        }),
        expect.objectContaining({
          sourceKind: "snippet",
          useFor: expect.arrayContaining(["discover KubeJS event entrypoints"])
        }),
        expect.objectContaining({
          sourceKind: "recipe",
          useFor: expect.arrayContaining(["validate recipe ids"])
        })
      ])
    );
  });

  it("parses large ProbeJS snippet JSON without falling back to raw lines", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-large-snippets");
    const largeDescription = "x".repeat(80_000);

    await writeText(
      join(workspaceRoot, ".vscode", "probe.code-snippets"),
      JSON.stringify({
        "probejs$$minecraft:item": {
          prefix: ["@item"],
          body: "\"${1|minecraft:stone,minecraft:dirt|}\"",
          description: largeDescription
        }
      })
    );

    const result = await summarizeKubeJsTypeResources({
      workspaceRoot,
      maxEntriesPerKind: 1
    });

    expect(result.entries.snippet).toEqual([
      expect.objectContaining({
        confidence: 0.95,
        extractorId: "vscode-code-snippets-json-v1",
        name: "probejs$$minecraft:item",
        sourceFormat: "vscode-code-snippets-json",
        value: "@item"
      })
    ]);
  });

  it("records fallback warnings and compact unknown resources for evolving ProbeJS layouts", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-unknown-summary");

    await writeText(
      join(workspaceRoot, ".vscode", "probe.code-snippets"),
      "{not valid json"
    );
    await writeText(
      join(workspaceRoot, "kubejs", "probe", "cache", "docs", "registry.json"),
      JSON.stringify({ futureProbeShape: ["minecraft:item"] })
    );

    const result = await summarizeKubeJsTypeResources({
      workspaceRoot,
      maxEntriesPerKind: 2,
      maxUnknownResources: 2
    });

    expect(result.entries.snippet).toEqual([
      expect.objectContaining({
        confidence: 0.4,
        extractorId: "probejs-line-list-v1",
        sourceFormat: "text-line-list",
        warnings: ["snippet_json_parse_failed"]
      })
    ]);
    expect(result.unknownResources).toEqual([
      expect.objectContaining({
        confidence: 0.2,
        extractorId: "unknown-probe-resource-preview-v1",
        file: expect.objectContaining({
          relativePath: "kubejs/probe/cache/docs/registry.json"
        }),
        preview: expect.stringContaining("futureProbeShape"),
        reason: "unknown_probejs_resource_format",
        sourceFormat: "unknown-json"
      })
    ]);
    expect(result.summary).toMatchObject({
      unknownCount: 1
    });
  });

  it("extracts item entries from VS Code item attribute JSON discovered in real ProbeJS runs", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-item-attributes");

    await writeText(
      join(workspaceRoot, ".vscode", "item-attributes.json"),
      JSON.stringify([
        {
          id: "minecraft:stone",
          localized: "Stone",
          maxStackSize: 64
        },
        {
          id: "minecraft:diamond_sword",
          localized: "Diamond Sword",
          maxStackSize: 1
        }
      ])
    );

    const result = await summarizeKubeJsTypeResources({
      workspaceRoot,
      maxEntriesPerKind: 2
    });

    expect(result.entries.item).toEqual([
      expect.objectContaining({
        confidence: 0.9,
        extractorId: "vscode-item-attributes-json-v1",
        metadata: {
          label: "Stone"
        },
        name: "minecraft:stone",
        sourceFormat: "vscode-item-attributes-json",
        value: "minecraft:stone"
      }),
      expect.objectContaining({
        metadata: {
          label: "Diamond Sword"
        },
        name: "minecraft:diamond_sword"
      })
    ]);
    expect(result.unknownResources).toEqual([]);
  });

  it("extracts fluid and item tag entries from VS Code attribute JSON", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-fluid-tags");

    await writeText(
      join(workspaceRoot, ".vscode", "fluid-attributes.json"),
      JSON.stringify([
        {
          id: "minecraft:water",
          localized: "Water",
          bucketItem: "minecraft:water_bucket"
        }
      ])
    );
    await writeText(
      join(workspaceRoot, ".vscode", "item-tag-attributes.json"),
      JSON.stringify([
        {
          id: "forge:ingots/iron",
          items: ["minecraft:iron_ingot"]
        }
      ])
    );

    const result = await summarizeKubeJsTypeResources({ workspaceRoot });

    expect(result.entries.fluid).toEqual([
      expect.objectContaining({
        confidence: 0.9,
        extractorId: "vscode-fluid-attributes-json-v1",
        metadata: {
          bucketItem: "minecraft:water_bucket",
          label: "Water"
        },
        name: "minecraft:water",
        sourceFormat: "vscode-fluid-attributes-json",
        value: "minecraft:water"
      })
    ]);
    expect(result.entries.tag).toEqual([
      expect.objectContaining({
        confidence: 0.9,
        extractorId: "vscode-item-tag-attributes-json-v1",
        metadata: {
          itemCount: 1
        },
        name: "forge:ingots/iron",
        sourceFormat: "vscode-item-tag-attributes-json",
        value: "#forge:ingots/iron"
      })
    ]);
    expect(result.unknownResources).toEqual([]);
  });

  it("extracts localization keys and class names from VS Code ProbeJS JSON", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-lang-class");

    await writeText(
      join(workspaceRoot, ".vscode", "lang-keys.json"),
      JSON.stringify([
        {
          key: "item.minecraft.diamond",
          languages: {
            en_us: "Diamond",
            en_gb: "Diamond"
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
              "dev.latvian.mods.kubejs.item.ItemStackJS"
            ]
          }
        }
      })
    );

    const result = await summarizeKubeJsTypeResources({
      workspaceRoot,
      maxEntriesPerKind: 2
    });
    const entries = result.entries as Record<string, unknown[]>;

    expect(entries.language_key).toEqual([
      expect.objectContaining({
        confidence: 0.9,
        extractorId: "vscode-lang-keys-json-v1",
        metadata: {
          label: "Diamond",
          selectedLanguage: "en_us"
        },
        name: "item.minecraft.diamond",
        sourceFormat: "vscode-lang-keys-json",
        value: "item.minecraft.diamond"
      })
    ]);
    expect(entries.class).toEqual([
      expect.objectContaining({
        confidence: 0.85,
        extractorId: "probe-class-definitions-json-v1",
        metadata: {
          packageName: "net.minecraft.world.item",
          simpleName: "ItemStack"
        },
        name: "net.minecraft.world.item.ItemStack",
        sourceFormat: "probe-class-definitions-json",
        value: "net.minecraft.world.item.ItemStack"
      }),
      expect.objectContaining({
        metadata: {
          packageName: "dev.latvian.mods.kubejs.item",
          simpleName: "ItemStackJS"
        },
        name: "dev.latvian.mods.kubejs.item.ItemStackJS"
      })
    ]);
    expect(result.unknownResources).toEqual([]);
  });

  it("extracts registry entries from ProbeJS registry definition JSON", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-registry-defs");

    await writeText(
      join(workspaceRoot, ".vscode", "probe.registry-definitions.json"),
      JSON.stringify({
        typeWorldgenTemplatePool: {
          type: "string",
          enum: [
            "minecraft:village/desert/streets",
            "minecraft:bastion/blocks/gold"
          ]
        },
        typeBannerPattern: {
          type: "string",
          enum: ["minecraft:creeper"]
        }
      })
    );

    const result = await summarizeKubeJsTypeResources({
      workspaceRoot,
      maxEntriesPerKind: 3
    });

    expect(result.entries.registry).toEqual([
      expect.objectContaining({
        confidence: 0.88,
        extractorId: "probe-registry-definitions-json-v1",
        metadata: {
          registryType: "WorldgenTemplatePool"
        },
        name: "minecraft:village/desert/streets",
        sourceFormat: "probe-registry-definitions-json",
        value: "minecraft:village/desert/streets"
      }),
      expect.objectContaining({
        metadata: {
          registryType: "WorldgenTemplatePool"
        },
        name: "minecraft:bastion/blocks/gold"
      }),
      expect.objectContaining({
        metadata: {
          registryType: "BannerPattern"
        },
        name: "minecraft:creeper"
      })
    ]);
    expect(result.unknownResources).toEqual([]);
  });

  it("expands legacy ProbeJS compressed class lists", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-legacy-classes");

    await writeText(
      join(workspaceRoot, ".probe", "classes.txt"),
      [
        "com.electronwill.nightconfig.core.$CommentedConfig",
        "....$CommentedConfig$Entry",
        "....file.$FileConfig",
        ".....$FileConfigBuilder",
        ".google.common.base.$Function"
      ].join("\n")
    );

    const result = await summarizeKubeJsTypeResources({
      workspaceRoot,
      maxEntriesPerKind: 5
    });

    expect(result.entries.class).toEqual([
      expect.objectContaining({
        confidence: 0.78,
        extractorId: "probe-classes-text-v1",
        lineNumber: 1,
        metadata: {
          packageName: "com.electronwill.nightconfig.core",
          simpleName: "CommentedConfig"
        },
        name: "com.electronwill.nightconfig.core.CommentedConfig",
        sourceFormat: "probe-classes-text",
        value: "com.electronwill.nightconfig.core.CommentedConfig"
      }),
      expect.objectContaining({
        lineNumber: 2,
        name: "com.electronwill.nightconfig.core.CommentedConfig$Entry"
      }),
      expect.objectContaining({
        lineNumber: 3,
        name: "com.electronwill.nightconfig.core.file.FileConfig"
      }),
      expect.objectContaining({
        lineNumber: 4,
        name: "com.electronwill.nightconfig.core.file.FileConfigBuilder"
      }),
      expect.objectContaining({
        lineNumber: 5,
        name: "com.google.common.base.Function"
      })
    ]);
    expect(result.unknownResources).toEqual([]);
  });
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `${prefix}-`));
  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
