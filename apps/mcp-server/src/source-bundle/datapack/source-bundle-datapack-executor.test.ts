import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildLocalSourcePackageRecipeExecutor,
  buildVanillaDataPackArchiveRecipe,
  writeSourcePackageConfirmation
} from "@mcpskill/source-package-manager";
import type { SourcePackageConfirmation } from "@mcpskill/shared-types";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";
import { buildMcpServerSourceBundleExecutor } from "../core/source-bundle-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("source.bundle datapack execution", () => {
  it("searches local datapack files for resource locations before docs", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-datapack-workspace-");

    await writeText(
      join(workspaceRoot, "data", "demo", "recipes", "gear.json"),
      '{ "type": "minecraft:crafting_shaped", "result": "demo:gear" }\n'
    );

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Find the datapack recipe for demo:gear before checking docs."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "datapack_files"
    );

    if (!candidate) {
      throw new Error("datapack_files candidate missing");
    }

    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      executeRecipe: async () => {
        throw new Error("vanilla recipe should not run");
      }
    });

    await expect(
      executor({
        candidate,
        evidencePlan,
        requestPlan
      })
    ).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "datapack_files",
        queries: ["demo:gear"],
        discovery: {
          namespaces: ["demo"],
          dataKinds: ["recipes"]
        },
        matches: [
          {
            file: {
              relativePath: "data/demo/recipes/gear.json",
              domain: "data",
              kind: "recipes",
              namespace: "demo"
            },
            preview: '{ "type": "minecraft:crafting_shaped", "result": "demo:gear" }'
          }
        ]
      }
    });
  });

  it("includes compact data and asset summaries for local resource roots", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-resource-workspace-");

    await writeText(join(workspaceRoot, "pack.mcmeta"), "{}\n");
    await writeText(join(workspaceRoot, "data", "demo", "recipes", "gear.json"), "{}\n");
    await writeText(join(workspaceRoot, "assets", "demo", "items", "gear.json"), "{}\n");
    await writeText(
      join(workspaceRoot, "assets", "demo", "models", "item", "gear.json"),
      "{}\n"
    );

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "List local datapack and resource asset evidence."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "datapack_files"
    );

    if (!candidate) {
      throw new Error("datapack_files candidate missing");
    }

    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      executeRecipe: async () => {
        throw new Error("vanilla recipe should not run");
      }
    });

    await expect(
      executor({
        candidate,
        evidencePlan,
        requestPlan
      })
    ).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "datapack_files",
        resourceSummary: {
          tokenPolicy: "counts_only",
          rootCount: 1,
          entryCount: 4,
          byDomain: {
            assets: 3,
            data: 1
          },
          byKind: {
            items: 1,
            models: 1,
            pack_metadata: 1,
            recipes: 1
          }
        }
      }
    });
  });

  it("traces explicit resource asset references without adding paths to the summary", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-resource-trace-");

    await writeText(join(workspaceRoot, "pack.mcmeta"), "{}\n");
    await writeText(
      join(workspaceRoot, "assets", "demo", "blockstates", "gear.json"),
      JSON.stringify({ variants: { "": { model: "demo:block/gear" } } })
    );
    await writeText(
      join(workspaceRoot, "assets", "demo", "models", "block", "gear.json"),
      JSON.stringify({ textures: { all: "demo:block/gear" } })
    );
    await writeText(
      join(workspaceRoot, "assets", "demo", "textures", "block", "gear.png"),
      Buffer.from([1, 2, 3])
    );

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Trace local datapack resource references for assets/demo/blockstates/gear.json."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "datapack_files"
    );

    if (!candidate) {
      throw new Error("datapack_files candidate missing");
    }

    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      executeRecipe: async () => {
        throw new Error("vanilla recipe should not run");
      }
    });

    const result = await executor({
      candidate,
      evidencePlan,
      requestPlan
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "datapack_files",
        resourceSummary: {
          tokenPolicy: "counts_only"
        },
        resourceReferenceTrace: {
          tokenPolicy: "explicit_trace",
          startPaths: ["assets/demo/blockstates/gear.json"],
          referenceCount: 2,
          unresolvedCount: 0,
          references: [
            {
              fromPath: "assets/demo/blockstates/gear.json",
              relation: "blockstate_model",
              toPath: "assets/demo/models/block/gear.json",
              status: "resolved"
            },
            {
              fromPath: "assets/demo/models/block/gear.json",
              relation: "model_texture",
              toPath: "assets/demo/textures/block/gear.png",
              status: "resolved"
            }
          ],
          truncated: false
        }
      }
    });
    expect(result.payload?.resourceSummary).not.toHaveProperty("files");
    expect(result.payload?.resourceSummary).not.toHaveProperty("references");
  });

  it("routes assets-only resource roots to reference tracing without pack metadata", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createTempRoot("mcpskill-assets-only-");

    await writeText(
      join(workspaceRoot, "assets", "demo", "blockstates", "gear.json"),
      JSON.stringify({ variants: { "": { model: "demo:block/gear" } } })
    );
    await writeText(
      join(workspaceRoot, "assets", "demo", "models", "block", "gear.json"),
      JSON.stringify({ textures: { all: "demo:block/gear" } })
    );
    await writeText(
      join(workspaceRoot, "assets", "demo", "textures", "block", "gear.png"),
      Buffer.from([1, 2, 3])
    );

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Trace references for assets/demo/blockstates/gear.json."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "datapack_files"
    );

    if (!candidate) {
      throw new Error("datapack_files candidate missing");
    }

    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      executeRecipe: async () => {
        throw new Error("vanilla recipe should not run");
      }
    });

    await expect(
      executor({
        candidate,
        evidencePlan,
        requestPlan
      })
    ).resolves.toMatchObject({
      matched: true,
      payload: {
        resourceSummary: {
          tokenPolicy: "counts_only",
          byDomain: {
            assets: 3
          }
        },
        resourceReferenceTrace: {
          tokenPolicy: "explicit_trace",
          startPaths: ["assets/demo/blockstates/gear.json"],
          referenceCount: 2,
          unresolvedCount: 0
        }
      }
    });
  });

  it("uses a confirmed generated vanilla datapack package when no local datapack roots exist", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createForgeWorkspace();
    const serverJar = join(runtimeRoot, "minecraft-server.jar");

    await writeSourcePackageConfirmation(
      {
        root: runtimeRoot,
        downloads: join(runtimeRoot, "downloads"),
        installs: join(runtimeRoot, "installs"),
        locks: join(runtimeRoot, "locks")
      },
      createVanillaDatapackConfirmation("1.20.1")
    );
    await writeText(
      serverJar,
      createZip([
        {
          name: "data/minecraft/recipes/stone.json",
          content: '{ "type": "minecraft:crafting_shapeless", "result": "minecraft:stone" }\n'
        },
        {
          name: "assets/minecraft/lang/en_us.json",
          content: "{\"item.minecraft.stone\":\"Stone\"}\n"
        }
      ])
    );

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Find the vanilla datapack recipe for minecraft:stone."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "datapack_files"
    );

    if (!candidate) {
      throw new Error("datapack_files candidate missing");
    }

    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      recipes: {
        "minecraft-1.20.1-vanilla-datapack-official":
          buildVanillaDataPackArchiveRecipe({
            minecraftVersion: "1.20.1",
            sourceArchive: serverJar
          })
      },
      executeRecipe: buildLocalSourcePackageRecipeExecutor()
    });

    await expect(
      executor({
        candidate,
        evidencePlan,
        requestPlan
      })
    ).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "vanilla_datapack",
        result: {
          status: "ready",
          packageId: "minecraft-1.20.1-vanilla-datapack-official",
          resourceSummary: {
            tokenPolicy: "counts_only",
            byDomain: {
              data: 1
            },
            byKind: {
              recipes: 1
            }
          },
          matches: [
            {
              file: {
                relativePath: "data/minecraft/recipes/stone.json",
                namespace: "minecraft",
                kind: "recipes"
              },
              preview: '{ "type": "minecraft:crafting_shapeless", "result": "minecraft:stone" }'
            }
          ],
          nextReads: [
            "source.read data/minecraft/recipes/stone.json:1-1"
          ]
        }
      }
    });
  });
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));

  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string | Buffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

async function createForgeWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-forge-workspace-");

  await writeText(
    join(workspaceRoot, "build.gradle"),
    [
      'plugins { id "net.minecraftforge.gradle" }',
      "dependencies {",
      '  minecraft "net.minecraftforge:forge:1.20.1-47.2.0"',
      "}"
    ].join("\n")
  );

  return workspaceRoot;
}

function createVanillaDatapackConfirmation(
  minecraftVersion: string
): SourcePackageConfirmation {
  return {
    packageId: `minecraft-${minecraftVersion}-vanilla-datapack-official`,
    namespace: "minecraft",
    minecraftVersion,
    artifactType: "datapack",
    variant: "official",
    scope: "package-version",
    approvedAt: "2026-05-01T00:00:00Z",
    source: "explicit-user-confirmation"
  };
}

interface ZipFixtureEntry {
  name: string;
  content: string;
}

function createZip(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

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
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, name, content);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + content.length;
  }

  const eocd = Buffer.alloc(22);

  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(
    centralParts.reduce((total, part) => total + part.length, 0),
    12
  );
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}
