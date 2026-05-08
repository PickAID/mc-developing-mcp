import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { SourcePackageConfirmation } from "minecraft-developing-mcp-shared-types";
import {
  buildLocalSourcePackageRecipeExecutor,
  buildVanillaDataPackArchiveRecipe,
  writeSourcePackageConfirmation
} from "minecraft-developing-mcp-source-package-manager";

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

describe("source.bundle vanilla datapack execution", () => {
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
