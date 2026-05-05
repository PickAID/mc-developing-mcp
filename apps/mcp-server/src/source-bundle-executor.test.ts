import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  buildLocalSourcePackageRecipeExecutor,
  buildVanillaSourcePackCopyRecipe,
  writeSourcePackageConfirmation
} from "@mcpskill/source-package-manager";
import type { SourcePackageConfirmation } from "@mcpskill/shared-types";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";
import { buildMcpServerSourceBundleExecutor } from "./source-bundle-executor.js";

describe("buildMcpServerSourceBundleExecutor", () => {
  it("claims vanilla workspace_source requests that require confirmation", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-bundle-"));
    const workspaceRoot = await createForgeWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: {
        workspaceRoot
      }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Inspect net.minecraft.world.item.ItemStack for this modpack."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = getWorkspaceSourceCandidate(evidencePlan);
    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      executeRecipe: async () => {
        throw new Error("should not run");
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
        source: "vanilla_source",
        result: {
          status: "needs_confirmation",
          packageId: "minecraft-1.20.1-source-pack-named"
        }
      }
    });
  });

  it("reads local build files when source.bundle request text targets Gradle context", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-bundle-"));
    const workspaceRoot = await createForgeWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: {
        workspaceRoot
      }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Inspect the project build.gradle files for this crash."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = getWorkspaceSourceCandidate(evidencePlan);
    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      executeRecipe: async () => {
        throw new Error("should not run");
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
      summary: "Resolved 1 local workspace source file(s).",
      payload: {
        source: "workspace_source",
        references: [
          {
            relativePath: "build.gradle",
            kind: "gradle",
            content: expect.stringContaining("net.minecraftforge.gradle")
          }
        ]
      }
    });
  });

  it("reads a non-vanilla Java class from a Gradle sources jar", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-bundle-"));
    const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-gradle-home-"));
    const workspaceRoot = await createForgeWorkspace();
    const sourceJar = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "com.example",
      "example-lib",
      "1.0.0",
      "hash",
      "example-lib-1.0.0-sources.jar"
    );
    const unusedJar = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "aaa.example",
      "unused-lib",
      "1.0.0",
      "hash",
      "unused-lib-1.0.0-sources.jar"
    );
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: {
        workspaceRoot
      }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Inspect com.example.lib.Widget before guessing this integration."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = getWorkspaceSourceCandidate(evidencePlan);

    await mkdir(join(sourceJar, ".."), { recursive: true });
    await writeFile(
      sourceJar,
      createZip([
        {
          name: "com/example/lib/Widget.java",
          content: "package com.example.lib;\npublic class Widget {}\n",
          compressionMethod: 8
        }
      ])
    );
    await mkdir(join(unusedJar, ".."), { recursive: true });
    await writeFile(
      unusedJar,
      createZip([
        {
          name: "aaa/example/Unused.java",
          content: "package aaa.example;\npublic class Unused {}\n",
          compressionMethod: 0
        }
      ])
    );

    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      gradleSourceDiscovery: {
        gradleUserHome,
        includeDefaultGradleUserHome: false
      },
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
        source: "gradle_source_archive",
        request: {
          symbol: "com.example.lib.Widget",
          relativePath: "com/example/lib/Widget.java"
        },
        result: {
          status: "ready",
          searchedArchives: 1,
          references: [
            {
              relativePath: "com/example/lib/Widget.java",
              content: "package com.example.lib;\npublic class Widget {}\n"
            }
          ]
        }
      }
    });
  });

  it("returns ready payload when the confirmed vanilla source file is installed", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-bundle-"));
    const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-materialized-"));
    const workspaceRoot = await createForgeWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: {
        workspaceRoot
      }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Inspect net.minecraft.world.item.ItemStack for this modpack."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = getWorkspaceSourceCandidate(evidencePlan);

    await writeSourcePackageConfirmation(
      {
        root: runtimeRoot,
        downloads: join(runtimeRoot, "downloads"),
        installs: join(runtimeRoot, "installs"),
        locks: join(runtimeRoot, "locks")
      },
      createConfirmation("1.20.1")
    );
    await mkdir(join(sourceRoot, "net", "minecraft", "world", "item"), {
      recursive: true
    });
    await writeFile(
      join(sourceRoot, "net", "minecraft", "world", "item", "ItemStack.java"),
      "package net.minecraft.world.item;\npublic class ItemStack {}\n"
    );

    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      recipes: {
        "minecraft-1.20.1-source-pack-named": buildVanillaSourcePackCopyRecipe({
          minecraftVersion: "1.20.1",
          sourceRoot
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
        source: "vanilla_source",
        result: {
          status: "ready",
          references: [
            {
              relativePath: "net/minecraft/world/item/ItemStack.java",
              reason: "indexed vanilla source match",
              startLine: 1,
              endLine: 3,
              totalLines: 3,
              matchReasons: ["path_exact"]
            }
          ]
        }
      }
    });
  });

  it("discovers a confirmed vanilla source file from a Gradle sources jar", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-bundle-"));
    const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-gradle-home-"));
    const workspaceRoot = await createForgeWorkspace();
    const sourceJar = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "net.minecraft",
      "client",
      "1.20.1",
      "hash",
      "client-1.20.1-sources.jar"
    );
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: {
        workspaceRoot
      }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Inspect net.minecraft.world.item.ItemStack for this modpack."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = getWorkspaceSourceCandidate(evidencePlan);

    await mkdir(join(sourceJar, ".."), { recursive: true });
    await writeFile(
      sourceJar,
      createZip([
        {
          name: "net/minecraft/world/item/ItemStack.java",
          content: "package net.minecraft.world.item;\npublic class ItemStack {}\n",
          compressionMethod: 8
        }
      ])
    );
    await writeSourcePackageConfirmation(
      {
        root: runtimeRoot,
        downloads: join(runtimeRoot, "downloads"),
        installs: join(runtimeRoot, "installs"),
        locks: join(runtimeRoot, "locks")
      },
      createConfirmation("1.20.1")
    );

    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      gradleSourceDiscovery: {
        gradleUserHome,
        includeDefaultGradleUserHome: false
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
        source: "vanilla_source",
        result: {
          status: "ready",
          references: [
            {
              relativePath: "net/minecraft/world/item/ItemStack.java"
            }
          ]
        }
      }
    });
  });
});

async function createForgeWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-forge-workspace-"));

  await mkdir(join(workspaceRoot, "src", "main", "java", "example"), {
    recursive: true
  });
  await writeFile(
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

function createConfirmation(
  minecraftVersion: string
): SourcePackageConfirmation {
  return {
    packageId: `minecraft-${minecraftVersion}-source-pack-named`,
    namespace: "minecraft",
    minecraftVersion,
    artifactType: "source-pack",
    variant: "named",
    scope: "package-version",
    approvedAt: "2026-04-24T02:00:00Z",
    source: "explicit-user-confirmation"
  };
}

function getWorkspaceSourceCandidate(
  evidencePlan: ReturnType<typeof buildMcpServerEvidencePlan>
) {
  const candidate = evidencePlan.candidates.find(
    (entry) => entry.routeStep === "workspace_source"
  );

  if (!candidate) {
    throw new Error("workspace_source candidate missing");
  }

  return candidate;
}

interface ZipFixtureEntry {
  name: string;
  content: string;
  compressionMethod: 0 | 8;
}

function createZip(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.from(entry.content);
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
