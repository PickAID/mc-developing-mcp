import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deflateRawSync } from "node:zlib";

import {
  buildLocalSourcePackageRecipeExecutor,
  buildVanillaSourcePackCopyRecipe,
  buildVanillaSourcePackZipRecipe,
  ensureSourcePackageInstalled,
  readSourcePackageInstallState,
  readSourcePackageManifest,
  writeSourcePackageConfirmation
} from "minecraft-developing-mcp-source-package-manager";
import type {
  CurrentRuntime,
  ManagedRuntimeLayout,
  SourcePackageConfirmation,
  SourcePackageCoordinate
} from "minecraft-developing-mcp-shared-types";
import { resolveVanillaSource } from "minecraft-developing-mcp-vanilla-source-adapter";

import { buildMcpServerBootstrap } from "../src/bootstrap.ts";
import { buildMcpServerEvidencePlan } from "../src/evidence-plan.ts";
import { buildMcpServerRequestPlan } from "../src/request-plan.ts";
import { buildMcpServerSourceBundleExecutor } from "../src/source-bundle-executor.ts";

const sourcePackage: SourcePackageCoordinate = {
  packageId: "minecraft-1.20.1-source-pack-named",
  namespace: "minecraft",
  minecraftVersion: "1.20.1",
  artifactType: "source-pack",
  variant: "named"
};

async function main(): Promise<void> {
  const ensureNeedsConfirmation = await sampleEnsureNeedsConfirmation();
  const ensureReady = await sampleEnsureReady();
  const ensureInstallValidationFailed = await sampleEnsureInstallValidationFailed();
  const resolveReady = await sampleResolveReady();
  const resolveInstallValidationFailed =
    await sampleResolveInstallValidationFailed();
  const sourceBundleUnmatched = await sampleSourceBundleUnmatched();
  const sourceBundleReady = await sampleSourceBundleReady();

  console.log(
    JSON.stringify(
      {
        ensureSourcePackageInstalled: {
          needsConfirmation: ensureNeedsConfirmation,
          ready: ensureReady,
          installValidationFailed: ensureInstallValidationFailed
        },
        resolveVanillaSource: {
          ready: resolveReady,
          installValidationFailed: resolveInstallValidationFailed
        },
        sourceBundleExecutor: {
          unmatched: sourceBundleUnmatched,
          ready: sourceBundleReady
        }
      },
      null,
      2
    )
  );
}

async function sampleEnsureNeedsConfirmation() {
  const runtimeLayout = createRuntimeLayout(
    await mkdtemp(join(tmpdir(), "mcpskill-runtime-sample-"))
  );

  return ensureSourcePackageInstalled({
    runtimeLayout,
    sourcePackage,
    recipes: {},
    executeRecipe: async () => {
      throw new Error("should not run");
    }
  });
}

async function sampleEnsureReady() {
  const runtimeLayout = createRuntimeLayout(
    await mkdtemp(join(tmpdir(), "mcpskill-runtime-sample-"))
  );
  const sourceZip = await createVanillaSourceZip("ItemStack");

  await writeSourcePackageConfirmation(runtimeLayout, createConfirmation("1.20.1"));

  const result = await ensureSourcePackageInstalled({
    runtimeLayout,
    sourcePackage,
    recipes: {
      [sourcePackage.packageId]: buildVanillaSourcePackZipRecipe({
        minecraftVersion: "1.20.1",
        sourceZip
      })
    },
    executeRecipe: buildLocalSourcePackageRecipeExecutor()
  });

  return {
    result,
    installState: await readSourcePackageInstallState(runtimeLayout, sourcePackage),
    manifest:
      result.status === "ready"
        ? await readSourcePackageManifest(result.installState.installPath ?? "")
        : undefined
  };
}

async function sampleEnsureInstallValidationFailed() {
  const runtimeLayout = createRuntimeLayout(
    await mkdtemp(join(tmpdir(), "mcpskill-runtime-sample-"))
  );
  const invalidInstallPath = await mkdtemp(join(tmpdir(), "mcpskill-invalid-install-"));

  await writeSourcePackageConfirmation(runtimeLayout, createConfirmation("1.20.1"));

  const result = await ensureSourcePackageInstalled({
    runtimeLayout,
    sourcePackage,
    recipes: {
      [sourcePackage.packageId]: buildVanillaSourcePackCopyRecipe({
        minecraftVersion: "1.20.1",
        sourceRoot: invalidInstallPath
      })
    },
    executeRecipe: async () => ({
      installPath: invalidInstallPath,
      summary: "executor returned an invalid install"
    })
  });

  return {
    result,
    installState: await readSourcePackageInstallState(runtimeLayout, sourcePackage)
  };
}

async function sampleResolveReady() {
  const runtimeLayout = createRuntimeLayout(
    await mkdtemp(join(tmpdir(), "mcpskill-runtime-sample-"))
  );
  const sourceZip = await createVanillaSourceZip("ItemStack");

  await writeSourcePackageConfirmation(runtimeLayout, createConfirmation("1.20.1"));

  return resolveVanillaSource({
    runtimeLayout,
    currentRuntime: createCurrentRuntime("1.20.1"),
    request: {
      symbol: "net.minecraft.world.item.ItemStack"
    },
    recipes: {
      [sourcePackage.packageId]: buildVanillaSourcePackZipRecipe({
        minecraftVersion: "1.20.1",
        sourceZip
      })
    },
    executeRecipe: buildLocalSourcePackageRecipeExecutor()
  });
}

async function sampleResolveInstallValidationFailed() {
  const runtimeLayout = createRuntimeLayout(
    await mkdtemp(join(tmpdir(), "mcpskill-runtime-sample-"))
  );
  const invalidInstallPath = await mkdtemp(join(tmpdir(), "mcpskill-invalid-install-"));

  await writeSourcePackageConfirmation(runtimeLayout, createConfirmation("1.20.1"));

  return resolveVanillaSource({
    runtimeLayout,
    currentRuntime: createCurrentRuntime("1.20.1"),
    request: {
      symbol: "net.minecraft.world.item.ItemStack"
    },
    recipes: {
      [sourcePackage.packageId]: buildVanillaSourcePackCopyRecipe({
        minecraftVersion: "1.20.1",
        sourceRoot: invalidInstallPath
      })
    },
    executeRecipe: async () => ({
      installPath: invalidInstallPath,
      summary: "executor returned an invalid install"
    })
  });
}

async function sampleSourceBundleUnmatched() {
  const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-runtime-sample-"));
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

  return executor({
    candidate,
    evidencePlan,
    requestPlan
  });
}

async function sampleSourceBundleReady() {
  const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-runtime-sample-"));
  const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-gradle-home-"));
  await createGradleMinecraftSourceZip(gradleUserHome, "ItemStack");
  const workspaceRoot = await createForgeWorkspace();

  await writeSourcePackageConfirmation(
    createRuntimeLayout(runtimeRoot),
    createConfirmation("1.20.1")
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
  const executor = buildMcpServerSourceBundleExecutor({
    runtimeRoot,
    gradleSourceDiscovery: {
      gradleUserHome,
      includeDefaultGradleUserHome: false
    },
    executeRecipe: buildLocalSourcePackageRecipeExecutor()
  });

  return executor({
    candidate,
    evidencePlan,
    requestPlan
  });
}

async function createVanillaSourceZip(className: string): Promise<string> {
  const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-materialized-"));
  const sourceZip = join(sourceRoot, "minecraft-sources.jar");
  const entryName = `net/minecraft/world/item/${className}.java`;
  const source = [
    "package net.minecraft.world.item;",
    `public class ${className} {}`,
    ""
  ].join("\n");

  await writeFile(
    sourceZip,
    createZip([
      {
        name: entryName,
        content: source,
        compressionMethod: 8
      }
    ])
  );

  return sourceZip;
}

async function createGradleMinecraftSourceZip(
  gradleUserHome: string,
  className: string
): Promise<string> {
  const sourceZip = join(
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

  await mkdir(join(sourceZip, ".."), { recursive: true });
  await writeFile(
    sourceZip,
    createZip([
      {
        name: `net/minecraft/world/item/${className}.java`,
        content: [
          "package net.minecraft.world.item;",
          `public class ${className} {}`,
          ""
        ].join("\n"),
        compressionMethod: 8
      }
    ])
  );

  return sourceZip;
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

function createRuntimeLayout(runtimeRoot: string): ManagedRuntimeLayout {
  return {
    root: runtimeRoot,
    downloads: join(runtimeRoot, "downloads"),
    installs: join(runtimeRoot, "installs"),
    locks: join(runtimeRoot, "locks")
  };
}

function createCurrentRuntime(minecraftVersion: string): CurrentRuntime {
  return {
    minecraftVersion,
    source: "workspace-detect",
    confidence: "high",
    evidenceSources: ["workspace-detect"],
    candidates: [],
    evidence: []
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

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
