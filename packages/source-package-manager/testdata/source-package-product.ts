import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { deflateRawSync } from "node:zlib";

import type {
  ManagedRuntimeLayout,
  SourcePackageConfirmation,
  SourcePackageCoordinate
} from "minecraft-developing-mcp-shared-types";

import {
  buildLocalSourcePackageRecipeExecutor,
  buildVanillaSourcePackZipRecipe,
  ensureSourcePackageInstalled,
  readSourcePackageConfirmation,
  readSourcePackageInstallState,
  readSourcePackageManifest,
  writeSourcePackageConfirmation
} from "../src/index.js";

const sourcePackage: SourcePackageCoordinate = {
  packageId: "minecraft-1.20.1-source-pack-named",
  namespace: "minecraft",
  minecraftVersion: "1.20.1",
  artifactType: "source-pack",
  variant: "named"
};

async function main(): Promise<void> {
  const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-package-product-"));
  const runtimeLayout = createRuntimeLayout(runtimeRoot);
  const sourceZip = await createSourceZip(runtimeRoot);
  const recipe = buildVanillaSourcePackZipRecipe({
    minecraftVersion: "1.20.1",
    sourceZip
  });
  const executeRecipe = buildLocalSourcePackageRecipeExecutor();
  const beforeConfirmation = await ensureSourcePackageInstalled({
    runtimeLayout,
    sourcePackage,
    recipes: {
      [sourcePackage.packageId]: recipe
    },
    executeRecipe
  });

  await writeSourcePackageConfirmation(
    runtimeLayout,
    createConfirmation("1.20.1")
  );

  const firstInstall = await ensureSourcePackageInstalled({
    runtimeLayout,
    sourcePackage,
    recipes: {
      [sourcePackage.packageId]: recipe
    },
    executeRecipe
  });
  const secondEnsure = await ensureSourcePackageInstalled({
    runtimeLayout,
    sourcePackage,
    recipes: {
      [sourcePackage.packageId]: recipe
    },
    executeRecipe
  });
  const installPath =
    firstInstall.status === "ready"
      ? firstInstall.installState.installPath
      : undefined;

  console.log(
    JSON.stringify(
      {
        runtimeRoot,
        layout: {
          downloads: runtimeLayout.downloads,
          installs: runtimeLayout.installs,
          locks: runtimeLayout.locks
        },
        transitions: {
          beforeConfirmation,
          firstInstall,
          secondEnsure
        },
        stateFiles: {
          confirmation: await readSourcePackageConfirmation(
            runtimeLayout,
            sourcePackage
          ),
          installState: await readSourcePackageInstallState(
            runtimeLayout,
            sourcePackage
          ),
          manifest: installPath
            ? await readSourcePackageManifest(installPath)
            : undefined
        },
        installedProduct: installPath
          ? {
              installPath,
              files: await listRelativeFiles(installPath),
              itemStackPreview: await readFile(
                join(
                  installPath,
                  "net",
                  "minecraft",
                  "world",
                  "item",
                  "ItemStack.java"
                ),
                "utf-8"
              )
            }
          : undefined
      },
      null,
      2
    )
  );
}

async function createSourceZip(runtimeRoot: string): Promise<string> {
  const sourceZip = join(runtimeRoot, "downloads", "fixture-sources.jar");

  await mkdir(dirname(sourceZip), { recursive: true });
  await writeFile(
    sourceZip,
    createZip([
      {
        name: "net/minecraft/world/item/ItemStack.java",
        content: "package net.minecraft.world.item;\npublic class ItemStack {}\n",
        compressionMethod: 8
      },
      {
        name: "assets/minecraft/lang/en_us.json",
        content: "{}\n",
        compressionMethod: 8
      }
    ])
  );

  return sourceZip;
}

async function listRelativeFiles(root: string): Promise<string[]> {
  const queue = [root];
  const files: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(path);
      } else if (entry.isFile()) {
        files.push(relative(root, path).replaceAll("\\", "/"));
      }
    }
  }

  return files.sort();
}

function createRuntimeLayout(runtimeRoot: string): ManagedRuntimeLayout {
  return {
    root: runtimeRoot,
    downloads: join(runtimeRoot, "downloads"),
    installs: join(runtimeRoot, "installs"),
    locks: join(runtimeRoot, "locks")
  };
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
    approvedAt: "2026-04-26T13:45:00Z",
    source: "explicit-user-confirmation"
  };
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

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
