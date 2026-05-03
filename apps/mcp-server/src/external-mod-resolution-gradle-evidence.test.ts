import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { executeMcpServerExternalModResolution } from "./external-mod-resolution-executor.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";

describe("external mod resolution Gradle dependency evidence", () => {
  it("uses declared Gradle cache jars before remote Modrinth lookup", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-gradle-ext-"));
    const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-gradle-home-"));
    const archivePath = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "org.widgets",
      "widget-api",
      "1.0.0",
      "hash",
      "widget-api-1.0.0.jar"
    );
    const input = await createExecutorInput(
      workspaceRoot,
      "Find the Modrinth mod for Widget API fabric 1.20.1."
    );

    await writeText(
      join(workspaceRoot, "build.gradle"),
      [
        "repositories { maven { url = 'https://maven.widgets.example/releases' } }",
        'dependencies { modImplementation "org.widgets:widget-api:1.0.0" }',
        ""
      ].join("\n")
    );
    await writeBinary(
      archivePath,
      createZip([{ name: "META-INF/MANIFEST.MF", content: "Manifest-Version: 1.0\n" }])
    );

    const result = await executeMcpServerExternalModResolution(input, {
      gradleDependencyDiscovery: {
        gradleUserHome,
        includeDefaultGradleUserHome: false
      },
      mavenRepositories: [
        {
          name: "Gradle build.gradle",
          url: "https://maven.widgets.example/releases"
        }
      ],
      modrinthResolver: async () => {
        throw new Error("Remote Modrinth resolver must not run.");
      }
    });

    expect(result).toMatchObject({
      matched: true,
      summary: "Resolved Gradle dependency archive: org.widgets:widget-api:1.0.0.",
      payload: {
        source: "external_mod_resolution",
        request: {
          platform: "modrinth",
          query: "widget api",
          loader: "fabric",
          minecraftVersion: "1.20.1"
        },
        result: {
          source: "gradle_dependency_archive",
          query: "widget api",
          remoteLookupSkipped: true,
          candidates: [
            {
              source: "gradle_dependency_archive",
              coordinate: "org.widgets:widget-api:1.0.0",
              sourceFile: "build.gradle",
              archivePath,
              fileName: "widget-api-1.0.0.jar",
              mavenArtifacts: [
                {
                  coordinates: "org.widgets:widget-api:1.0.0",
                  repositoryUrl: "https://maven.widgets.example/releases",
                  gradle: {
                    loom: {
                      modImplementation:
                        'modImplementation "org.widgets:widget-api:1.0.0"'
                    }
                  }
                }
              ]
            }
          ]
        }
      }
    });
  });

  it("matches declared Gradle cache jar metadata before remote lookup", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-gradle-meta-"));
    const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-gradle-home-"));
    const archivePath = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "org.widgets",
      "energy-core",
      "1.0.0",
      "hash",
      "energy-core-1.0.0.jar"
    );
    const input = await createExecutorInput(
      workspaceRoot,
      "Find the Modrinth mod for Local Energy fabric 1.20.1."
    );

    await writeText(
      join(workspaceRoot, "build.gradle"),
      'dependencies { modImplementation "org.widgets:energy-core:1.0.0" }\n'
    );
    await writeBinary(
      archivePath,
      createZip([
        {
          name: "fabric.mod.json",
          content: JSON.stringify({
            id: "local_energy",
            name: "Local Energy",
            version: "1.0.0"
          })
        }
      ])
    );

    const result = await executeMcpServerExternalModResolution(input, {
      gradleDependencyDiscovery: {
        gradleUserHome,
        includeDefaultGradleUserHome: false
      },
      modrinthResolver: async () => {
        throw new Error("Remote Modrinth resolver must not run.");
      }
    });

    expect(result).toMatchObject({
      matched: true,
      summary: "Resolved Gradle dependency archive: org.widgets:energy-core:1.0.0.",
      payload: {
        result: {
          source: "gradle_dependency_archive",
          query: "local energy",
          candidates: [
            {
              source: "gradle_dependency_archive",
              coordinate: "org.widgets:energy-core:1.0.0",
              modId: "local_energy",
              title: "Local Energy",
              loader: "fabric",
              metadataPath: "fabric.mod.json",
              archivePath
            }
          ],
          remoteLookupSkipped: true
        }
      }
    });
  });

  it("uses declared Gradle subproject cache jars before remote lookup", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-gradle-sub-"));
    const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-gradle-home-"));
    const archivePath = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "org.widgets",
      "energy-core",
      "1.0.0",
      "hash",
      "energy-core-1.0.0.jar"
    );
    const input = await createExecutorInput(
      workspaceRoot,
      "Find the Modrinth mod for Local Energy fabric 1.20.1."
    );

    await writeText(join(workspaceRoot, "settings.gradle"), 'include ":common"\n');
    await writeText(
      join(workspaceRoot, "common", "build.gradle"),
      'dependencies { modImplementation "org.widgets:energy-core:1.0.0" }\n'
    );
    await writeBinary(
      archivePath,
      createZip([
        {
          name: "fabric.mod.json",
          content: JSON.stringify({
            id: "local_energy",
            name: "Local Energy",
            version: "1.0.0"
          })
        }
      ])
    );

    const result = await executeMcpServerExternalModResolution(input, {
      gradleDependencyDiscovery: {
        gradleUserHome,
        includeDefaultGradleUserHome: false
      },
      modrinthResolver: async () => {
        throw new Error("Remote Modrinth resolver must not run.");
      }
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        result: {
          source: "gradle_dependency_archive",
          candidates: [
            {
              coordinate: "org.widgets:energy-core:1.0.0",
              sourceFile: "common/build.gradle",
              modId: "local_energy",
              archivePath
            }
          ],
          remoteLookupSkipped: true
        }
      }
    });
  });
});

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

async function writeBinary(path: string, content: Buffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

interface ZipFixtureEntry {
  name: string;
  content: string;
}

function createZip(entries: ZipFixtureEntry[]): Buffer {
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
