import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { resolveGradleDependencyArchiveEvidence } from "./external-mod-gradle-dependency-evidence.js";
import { executeMcpServerExternalModResolution } from "../resolution/external-mod-resolution-executor.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("external mod resolution Gradle dependency archives", () => {
  it("uses declared Gradle cache binary jars as local evidence before remote lookup", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-gradle-dep-work-");
    const gradleUserHome = await createTempRoot("mcpskill-gradle-dep-home-");
    const archivePath = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "com.example.mods",
      "local-energy",
      "1.2.3",
      "cachehash",
      "local-energy-1.2.3.jar"
    );
    const modrinthResolver = vi.fn(async () => {
      throw new Error("Modrinth resolver must not be called.");
    });
    const curseForgeResolver = vi.fn(async () => {
      throw new Error("CurseForge resolver must not be called.");
    });

    await writeText(
      join(workspaceRoot, "build.gradle"),
      'dependencies { modImplementation "com.example.mods:local-energy:1.2.3" }\n'
    );
    await writeZip(archivePath, [
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "local_energy",
          name: "Local Energy",
          version: "1.2.3"
        })
      }
    ]);

    const result = await executeMcpServerExternalModResolution(
      await createExecutorInput(
        workspaceRoot,
        "Find the Modrinth mod for Local Energy fabric 1.20.1."
      ),
      {
        gradleDependencyDiscovery: {
          gradleUserHome,
          includeDefaultGradleUserHome: false
        },
        modrinthResolver,
        curseForgeResolver
      }
    );

    expect(modrinthResolver).not.toHaveBeenCalled();
    expect(curseForgeResolver).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      matched: true,
      summary:
        "Resolved Gradle dependency archive: com.example.mods:local-energy:1.2.3.",
      payload: {
        source: "external_mod_resolution",
        request: {
          platform: "modrinth",
          query: "local energy",
          loader: "fabric",
          minecraftVersion: "1.20.1"
        },
        result: {
          source: "gradle_dependency_archive",
          query: "local energy",
          remoteLookupSkipped: true,
          scannedDependencies: 1,
          scannedArchives: 1,
          candidates: [
            {
              source: "gradle_dependency_archive",
              coordinate: "com.example.mods:local-energy:1.2.3",
              group: "com.example.mods",
              artifact: "local-energy",
              version: "1.2.3",
              sourceFile: "build.gradle",
              modId: "local_energy",
              title: "Local Energy",
              loader: "fabric",
              metadataPath: "fabric.mod.json",
              archivePath,
              fileName: "local-energy-1.2.3.jar",
              archiveSource: "gradle-cache",
              archiveReason:
                "declared Gradle dependency com.example.mods:local-energy:1.2.3 in build.gradle",
              confidenceReasons: expect.arrayContaining([
                "matched Gradle cache mod metadata Local Energy",
                "metadata found at fabric.mod.json",
                "loader fabric matched requested loader",
                "found binary jar in gradle-cache"
              ]),
              requiresConfirmation: false,
              cachePolicy: "metadata_only"
            }
          ],
          warnings: []
        }
      }
    });
  });

  it("uses declared workspace libs binary jars with Gradle property versions", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-gradle-dep-work-");
    const archivePath = join(workspaceRoot, "libs", "l2core-3.0.8+11.jar");

    await writeText(
      join(workspaceRoot, "build.gradle"),
      'dependencies { runtimeOnly "dev.xkmc:l2core:${l2core_ver}" }\n'
    );
    await writeText(join(workspaceRoot, "gradle.properties"), "l2core_ver=3.0.8+11\n");
    await writeZip(archivePath, [
      {
        name: "META-INF/neoforge.mods.toml",
        content: [
          'modLoader="javafml"',
          'loaderVersion="[4,)"',
          '[[mods]]',
          'modId="l2core"',
          'version="3.0.8+11"',
          'displayName="L2Core"',
          ""
        ].join("\n")
      }
    ]);

    const result = await resolveGradleDependencyArchiveEvidence({
      workspaceRoot,
      request: {
        platform: "modrinth",
        query: "l2core",
        loader: "neoforge",
        minecraftVersion: "1.21.1"
      },
      discovery: {
        includeDefaultGradleUserHome: false
      }
    });

    expect(result).toMatchObject({
      source: "gradle_dependency_archive",
      query: "l2core",
      scannedDependencies: 1,
      scannedArchives: 1,
      candidates: [
        {
          source: "gradle_dependency_archive",
          coordinate: "dev.xkmc:l2core:3.0.8+11",
          group: "dev.xkmc",
          artifact: "l2core",
          version: "3.0.8+11",
          modId: "l2core",
          title: "L2Core",
          loader: "neoforge",
          metadataPath: "META-INF/neoforge.mods.toml",
          archivePath,
          fileName: "l2core-3.0.8+11.jar",
          archiveSource: "workspace",
          archiveReason:
            "declared Gradle dependency dev.xkmc:l2core:3.0.8+11 in build.gradle; workspace libs directory"
        }
      ]
    });
  });
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));

  tempRoots.push(root);
  return root;
}

async function createExecutorInput(workspaceRoot: string, requestText: string) {
  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot: "/tmp/mcpskill-runtime",
    workspace: { workspaceRoot }
  });
  const requestPlan = buildMcpServerRequestPlan(bootstrap, requestText);
  const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
  const candidate = evidencePlan.candidates.find(
    (entry) => entry.routeStep === "external_mod_resolution"
  );

  if (!candidate) {
    throw new Error("Expected external_mod_resolution candidate.");
  }

  return {
    candidate,
    evidencePlan,
    requestPlan
  };
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

async function writeZip(
  path: string,
  entries: Array<{ name: string; content: string }>
): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, createZip(entries));
}

function createZip(entries: Array<{ name: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

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
    centralHeader.writeUInt32LE(localOffset, 42);

    localParts.push(localHeader, name, content);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + content.length;
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
