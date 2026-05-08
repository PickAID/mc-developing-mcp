import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildVanillaSourcePackCopyRecipe,
  runSourceAcquisitionWorkItems,
  writeSourcePackageConfirmation,
  type SourceAcquisitionWorkItem
} from "@mcpskill/source-package-manager";

import { createMcpServerSourceAcquisitionWorkItemHandlers } from "./source-acquisition-work-item-handlers.js";

describe("createMcpServerSourceAcquisitionWorkItemHandlers", () => {
  it("returns vanilla source package confirmation evidence before generation", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-gen-"));

    try {
      const handlers = createMcpServerSourceAcquisitionWorkItemHandlers({
        requestText: "Generate vanilla source for Minecraft 1.20.1.",
        runtimeRoot: join(tempRoot, "runtime")
      });
      const result = await runSourceAcquisitionWorkItems({
        workItems: [
          {
            kind: "vanilla_generation",
            minecraftVersion: "1.20.1",
            cacheScope: "private_runtime"
          }
        ],
        handlers
      });

      expect(result).toMatchObject({
        status: "completed",
        executions: [
          {
            kind: "vanilla_generation",
            status: "completed",
            payload: {
              source: "source_acquisition_vanilla_generation",
              result: {
                status: "needs_confirmation",
                packageId: "minecraft-1.20.1-source-pack-named",
                confirmationScope: "package-version"
              }
            }
          }
        ]
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("installs confirmed vanilla source package recipes through runtime cache", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mcpskill-vanilla-ready-"));
    const runtimeRoot = join(tempRoot, "runtime");
    const sourceRoot = join(tempRoot, "source");
    await mkdir(join(sourceRoot, "net", "minecraft", "world", "item"), {
      recursive: true
    });
    await writeFile(
      join(sourceRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
      "package net.minecraft.world.item;\npublic class ItemStack {}\n"
    );
    await writeSourcePackageConfirmation(createRuntimeLayout(runtimeRoot), {
      packageId: "minecraft-1.20.1-source-pack-named",
      namespace: "minecraft",
      minecraftVersion: "1.20.1",
      artifactType: "source-pack",
      variant: "named",
      scope: "package-version",
      approvedAt: "2026-05-07T00:00:00Z",
      source: "explicit-user-confirmation"
    });

    try {
      const handlers = createMcpServerSourceAcquisitionWorkItemHandlers({
        requestText: "Generate vanilla source for Minecraft 1.20.1.",
        runtimeRoot,
        vanillaRecipes: {
          "minecraft-1.20.1-source-pack-named":
            buildVanillaSourcePackCopyRecipe({
              minecraftVersion: "1.20.1",
              sourceRoot
            })
        }
      });
      const result = await runSourceAcquisitionWorkItems({
        workItems: [
          {
            kind: "vanilla_generation",
            minecraftVersion: "1.20.1",
            cacheScope: "private_runtime"
          }
        ],
        handlers
      });

      expect(result).toMatchObject({
        status: "completed",
        executions: [
          {
            status: "completed",
            payload: {
              source: "source_acquisition_vanilla_generation",
              result: {
                status: "ready",
                packageId: "minecraft-1.20.1-source-pack-named",
                artifactType: "source-pack",
                sourceIndex: {
                  fileCount: 1,
                  javaSymbolCount: 1
                }
              }
            }
          }
        ]
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("indexes user jar work items through a runtime SQLite archive cache", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-jar-"));
    const runtimeRoot = join(tempRoot, "runtime");
    const sourceArchive = join(tempRoot, "mods", "content.jar");
    await mkdir(join(tempRoot, "mods"), { recursive: true });
    await writeFile(
      sourceArchive,
      createZip([
        "data/demo/recipe/gear.json",
        "assets/demo/models/item/gear.json",
        "com/example/Gear.class"
      ])
    );

    try {
      const handlers = createMcpServerSourceAcquisitionWorkItemHandlers({
        requestText: "Index this jar source.",
        runtimeRoot
      });
      const first = await runSourceAcquisitionWorkItems({
        workItems: [
          {
            kind: "jar_index",
            sourceArchive,
            cacheScope: "private_runtime"
          }
        ],
        handlers
      });
      const second = await runSourceAcquisitionWorkItems({
        workItems: [
          {
            kind: "jar_index",
            sourceArchive,
            cacheScope: "private_runtime"
          }
        ],
        handlers
      });

      expect(first).toMatchObject({
        status: "completed",
        executions: [
          {
            status: "completed",
            payload: {
              source: "source_acquisition_jar_index",
              archiveCount: 1,
              entryCount: 3,
              cache: {
                archiveHits: 0,
                archiveMisses: 1
              },
              domainCounts: {
                assets: 1,
                class: 1,
                data: 1
              }
            }
          }
        ]
      });
      expect(second.executions[0]).toMatchObject({
        status: "completed",
        payload: {
          cache: {
            archiveHits: 1,
            archiveMisses: 0
          }
        }
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("materializes mapping index work items into runtime-private cache", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mcpskill-mapping-index-"));
    const runtimeRoot = join(tempRoot, "runtime");

    try {
      const handlers = createMcpServerSourceAcquisitionWorkItemHandlers({
        requestText: "Need Yarn mappings for Minecraft 1.21.1.",
        runtimeRoot,
        mappingIndexProvider: async (request) => ({
          provenance: {
            source: "test-fixture",
            minecraftVersion: request.minecraftVersion,
            mappingFamily: request.mappingFamily
          },
          entries: [
            {
              fromNamespace: "official",
              toNamespace: "named",
              fromName: "a",
              toName: "net.minecraft.world.item.ItemStack",
              kind: "class"
            },
            {
              fromNamespace: "intermediary",
              toNamespace: "named",
              fromName: "method_31574",
              toName: "getCount",
              kind: "method",
              owner: "net.minecraft.world.item.ItemStack",
              descriptor: "()I"
            }
          ]
        })
      });

      const workItem: SourceAcquisitionWorkItem = {
        kind: "mapping_index",
        minecraftVersion: "1.21.1",
        mappingFamily: "yarn",
        cacheScope: "private_runtime"
      };
      const first = await runSourceAcquisitionWorkItems({
        workItems: [workItem],
        handlers
      });
      const second = await runSourceAcquisitionWorkItems({
        workItems: [workItem],
        handlers
      });

      expect(first.executions[0]).toMatchObject({
        status: "completed",
        payload: {
          source: "source_acquisition_mapping_index",
          status: "ready",
          minecraftVersion: "1.21.1",
          mappingFamily: "yarn",
          entryCount: 2,
          cache: {
            hit: false,
            scope: "private_runtime"
          }
        }
      });
      expect(second.executions[0]).toMatchObject({
        status: "completed",
        payload: {
          cache: {
            hit: true
          }
        }
      });

      const indexPath = (first.executions[0].payload as {
        indexPath: string;
      }).indexPath;
      expect(await readFile(indexPath, "utf-8")).toContain(
        "net.minecraft.world.item.ItemStack"
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

});

function createRuntimeLayout(root: string) {
  return {
    root,
    downloads: join(root, "downloads"),
    installs: join(root, "installs"),
    locks: join(root, "locks")
  };
}

function createZip(entryNames: string[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entryName of entryNames) {
    const name = Buffer.from(entryName);
    const content = Buffer.from("{}\n");
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
  eocd.writeUInt16LE(entryNames.length, 8);
  eocd.writeUInt16LE(entryNames.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localFiles.length, 16);

  return Buffer.concat([localFiles, centralDirectory, eocd]);
}
