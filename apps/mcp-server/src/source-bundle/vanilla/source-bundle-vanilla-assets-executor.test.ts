import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildLocalSourcePackageRecipeExecutor,
  buildVanillaResourcePackArchiveRecipe,
  writeSourcePackageConfirmation
} from "minecraft-developing-mcp-source-package-manager";
import type { SourcePackageConfirmation } from "minecraft-developing-mcp-shared-types";

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

describe("source.bundle vanilla assets package execution", () => {
  it("uses a confirmed generated vanilla assets package when no local resource roots exist", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createForgeWorkspace();
    const clientJar = join(runtimeRoot, "minecraft-client.jar");

    await writeSourcePackageConfirmation(
      {
        root: runtimeRoot,
        downloads: join(runtimeRoot, "downloads"),
        installs: join(runtimeRoot, "installs"),
        locks: join(runtimeRoot, "locks")
      },
      createVanillaResourcePackConfirmation("1.20.1")
    );
    await writeText(
      clientJar,
      createZip([
        {
          name: "assets/minecraft/models/item/stone.json",
          content: "{\"parent\":\"minecraft:item/generated\"}\n"
        },
        {
          name: "data/minecraft/recipes/stone.json",
          content: "{\"type\":\"minecraft:crafting_shapeless\"}\n"
        }
      ])
    );

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Read the vanilla official asset assets/minecraft/models/item/stone.json"
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
        "minecraft-1.20.1-vanilla-resource-pack-official":
          buildVanillaResourcePackArchiveRecipe({
            minecraftVersion: "1.20.1",
            sourceArchive: clientJar
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
        source: "vanilla_assets",
        result: {
          status: "ready",
          packageId: "minecraft-1.20.1-vanilla-resource-pack-official",
          resourceSummary: {
            tokenPolicy: "counts_only",
            byDomain: {
              assets: 1
            },
            byKind: {
              models: 1
            }
          },
          reads: [
            {
              file: {
                relativePath: "assets/minecraft/models/item/stone.json",
                namespace: "minecraft",
                kind: "models",
                domain: "assets"
              },
              content: "{\"parent\":\"minecraft:item/generated\"}\n"
            }
          ],
          nextReads: [
            "source.read assets/minecraft/models/item/stone.json:1-1"
          ]
        }
      }
    });
  });

  it("traces references inside a confirmed generated vanilla assets package", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createForgeWorkspace();
    const clientJar = join(runtimeRoot, "minecraft-client.jar");

    await writeSourcePackageConfirmation(
      {
        root: runtimeRoot,
        downloads: join(runtimeRoot, "downloads"),
        installs: join(runtimeRoot, "installs"),
        locks: join(runtimeRoot, "locks")
      },
      createVanillaResourcePackConfirmation("1.20.1")
    );
    await writeText(
      clientJar,
      createZip([
        {
          name: "assets/minecraft/blockstates/stone.json",
          content: JSON.stringify({
            variants: {
              "": {
                model: "minecraft:block/stone"
              }
            }
          })
        },
        {
          name: "assets/minecraft/models/block/stone.json",
          content: JSON.stringify({
            textures: {
              all: "minecraft:block/stone"
            }
          })
        },
        {
          name: "assets/minecraft/textures/block/stone.png",
          content: "png"
        }
      ])
    );

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Trace vanilla official references for assets/minecraft/blockstates/stone.json"
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
        "minecraft-1.20.1-vanilla-resource-pack-official":
          buildVanillaResourcePackArchiveRecipe({
            minecraftVersion: "1.20.1",
            sourceArchive: clientJar
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
        source: "vanilla_assets",
        result: {
          status: "ready",
          resourceReferenceTrace: {
            tokenPolicy: "explicit_trace",
            startPaths: ["assets/minecraft/blockstates/stone.json"],
            referenceCount: 2,
            unresolvedCount: 0,
            references: [
              {
                fromPath: "assets/minecraft/blockstates/stone.json",
                relation: "blockstate_model",
                toPath: "assets/minecraft/models/block/stone.json",
                status: "resolved"
              },
              {
                fromPath: "assets/minecraft/models/block/stone.json",
                relation: "model_texture",
                toPath: "assets/minecraft/textures/block/stone.png",
                status: "resolved"
              }
            ],
            truncated: false
          }
        }
      }
    });
  });

  it("traces item definition references inside a generated vanilla assets package", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createForgeWorkspace();
    const clientJar = join(runtimeRoot, "minecraft-client.jar");

    await writeSourcePackageConfirmation(
      {
        root: runtimeRoot,
        downloads: join(runtimeRoot, "downloads"),
        installs: join(runtimeRoot, "installs"),
        locks: join(runtimeRoot, "locks")
      },
      createVanillaResourcePackConfirmation("1.20.1")
    );
    await writeText(
      clientJar,
      createZip([
        {
          name: "assets/minecraft/items/stone.json",
          content:
            "{\"model\":{\"type\":\"minecraft:model\",\"model\":\"minecraft:item/stone\"}}\n"
        },
        {
          name: "assets/minecraft/models/item/stone.json",
          content: "{\"textures\":{\"layer0\":\"minecraft:item/stone\"}}\n"
        },
        {
          name: "assets/minecraft/textures/item/stone.png",
          content: "png"
        }
      ])
    );

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Trace vanilla official references for assets/minecraft/items/stone.json"
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
        "minecraft-1.20.1-vanilla-resource-pack-official":
          buildVanillaResourcePackArchiveRecipe({
            minecraftVersion: "1.20.1",
            sourceArchive: clientJar
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
        source: "vanilla_assets",
        result: {
          resourceReferenceTrace: {
            tokenPolicy: "explicit_trace",
            startPaths: ["assets/minecraft/items/stone.json"],
            references: [
              {
                fromPath: "assets/minecraft/items/stone.json",
                fromKind: "items",
                relation: "item_model",
                toPath: "assets/minecraft/models/item/stone.json",
                status: "resolved"
              },
              {
                fromPath: "assets/minecraft/models/item/stone.json",
                relation: "model_texture",
                toPath: "assets/minecraft/textures/item/stone.png",
                status: "resolved"
              }
            ],
            truncated: false
          }
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

async function writeText(path: string, content: string | Buffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

function createVanillaResourcePackConfirmation(
  minecraftVersion: string
): SourcePackageConfirmation {
  return {
    packageId: `minecraft-${minecraftVersion}-vanilla-resource-pack-official`,
    namespace: "minecraft",
    minecraftVersion,
    artifactType: "resource-pack",
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
