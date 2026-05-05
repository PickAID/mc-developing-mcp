import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { executeMcpServerExternalModResolution } from "../resolution/external-mod-resolution-executor.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";

describe("executeMcpServerExternalModResolution local archives", () => {
  it("uses matching workspace mod jars before remote project resolvers", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-local-extmod-"));
    const modJar = join(workspaceRoot, "mods", "local-energy.jar");

    await writeZip(modJar, [
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "local_energy",
          name: "Local Energy",
          version: "1.0.0"
        })
      }
    ]);
    const input = await createExecutorInput(
      workspaceRoot,
      "Find the CurseForge mod for Local Energy fabric 1.20.1."
    );

    const result = await executeMcpServerExternalModResolution(input, {
      modrinthResolver: async () => {
        throw new Error("local archive lookup must not search Modrinth");
      },
      curseForgeResolver: async () => {
        throw new Error("local archive lookup must not search CurseForge");
      }
    });

    expect(result).toMatchObject({
      matched: true,
      summary: "Resolved local mod archive: mods/local-energy.jar.",
      payload: {
        source: "external_mod_resolution",
        result: {
          source: "local_archive",
          query: "local energy",
          remoteLookupSkipped: true,
          candidates: [
            {
              source: "local_archive",
              confidence: "high",
              modId: "local_energy",
              title: "Local Energy",
              versionNumber: "1.0.0",
              loaders: ["fabric"],
              fileName: basename(modJar),
              relativePath: "mods/local-energy.jar",
              archiveSource: "mods-directory",
              metadataPath: "fabric.mod.json"
            }
          ],
          warnings: []
        }
      }
    });
  });

  it("uses local mod metadata even when remote lookup constraints are incomplete", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-loose-extmod-"));
    const modJar = join(workspaceRoot, "mods", "local-energy.jar");

    await writeZip(modJar, [
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "local_energy",
          name: "Local Energy",
          version: "1.0.0"
        })
      }
    ]);
    const input = await createExecutorInput(
      workspaceRoot,
      "Find the Modrinth mod for Local Energy."
    );

    const result = await executeMcpServerExternalModResolution(input, {
      modrinthResolver: async () => {
        throw new Error("local archive lookup must not search Modrinth");
      }
    });

    expect(result).toMatchObject({
      matched: true,
      summary: "Resolved local mod archive: mods/local-energy.jar.",
      payload: {
        source: "external_mod_resolution",
        request: {
          platform: "modrinth",
          query: "local energy"
        },
        result: {
          source: "local_archive",
          remoteLookupSkipped: true,
          candidates: [
            {
              modId: "local_energy",
              loaders: ["fabric"],
              relativePath: "mods/local-energy.jar"
            }
          ],
          warnings: []
        }
      }
    });
  });

  it("uses matching JarJar nested mod metadata before remote project resolvers", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-nested-extmod-"));
    const outerJar = join(workspaceRoot, "mods", "outer-mod.jar");
    const nestedJar = createZip([
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "nested_energy",
          name: "Nested Energy",
          version: "2.0.0"
        })
      }
    ]);

    await writeZip(outerJar, [
      {
        name: "META-INF/jarjar/nested-energy.jar",
        content: nestedJar
      }
    ]);
    const input = await createExecutorInput(
      workspaceRoot,
      "Find the Modrinth mod for Nested Energy fabric 1.20.1."
    );

    const result = await executeMcpServerExternalModResolution(input, {
      modrinthResolver: async () => {
        throw new Error("nested local archive lookup must not search Modrinth");
      },
      curseForgeResolver: async () => {
        throw new Error("nested local archive lookup must not search CurseForge");
      }
    });

    expect(result).toMatchObject({
      matched: true,
      summary:
        "Resolved local mod archive: mods/outer-mod.jar!META-INF/jarjar/nested-energy.jar.",
      payload: {
        source: "external_mod_resolution",
        result: {
          source: "local_archive",
          query: "nested energy",
          remoteLookupSkipped: true,
          candidates: [
            {
              source: "local_archive",
              confidence: "high",
              modId: "nested_energy",
              title: "Nested Energy",
              versionNumber: "2.0.0",
              loaders: ["fabric"],
              fileName: "nested-energy.jar",
              relativePath: "mods/outer-mod.jar",
              embeddedArchivePath: "META-INF/jarjar/nested-energy.jar",
              archiveSource: "mods-directory",
              metadataPath: "fabric.mod.json"
            }
          ],
          warnings: []
        }
      }
    });
  });

  it("keeps crash dependency version expectations on local archive candidates", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-local-crash-extmod-"));
    const modJar = join(workspaceRoot, "mods", "fabric-api.jar");

    await writeZip(modJar, [
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "fabric-api",
          name: "Fabric API",
          version: "0.91.0"
        })
      }
    ]);
    const input = await createExecutorInput(
      workspaceRoot,
      [
        "Find the Modrinth mod for the startup crash fabric 1.20.1.",
        "Crash log loader dependency: modId=fabric-api; requestedBy=demo_addon; expected=0.92.2 or later; actual=0.91.0; kind=incompatible_dependency"
      ].join("\n")
    );

    const result = await executeMcpServerExternalModResolution(input, {
      modrinthResolver: async () => {
        throw new Error("local archive lookup must not search Modrinth");
      }
    });

    expect(result).toMatchObject({
      matched: true,
      summary: "Resolved local mod archive: mods/fabric-api.jar.",
      payload: {
        source: "external_mod_resolution",
        request: {
          loaderDependency: {
            modId: "fabric-api",
            requestedBy: "demo_addon",
            expectedRange: "0.92.2 or later",
            actualVersion: "0.91.0",
            kind: "incompatible_dependency"
          }
        },
        result: {
          source: "local_archive",
          candidates: [
            {
              modId: "fabric-api",
              versionNumber: "0.91.0",
              confidenceReasons: expect.arrayContaining([
                "crash dependency requested by demo_addon expected 0.92.2 or later but log reported 0.91.0"
              ])
            }
          ]
        }
      }
    });
  });

  it("attaches the local requesting mod owner for crash dependency candidates", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-local-requester-"));
    const requesterJar = join(workspaceRoot, "mods", "demo-addon.jar");
    const dependencyJar = join(workspaceRoot, "mods", "fabric-api.jar");

    await writeZip(requesterJar, [
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "demo_addon",
          name: "Demo Addon",
          version: "1.4.0"
        })
      }
    ]);
    await writeZip(dependencyJar, [
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "fabric-api",
          name: "Fabric API",
          version: "0.91.0"
        })
      }
    ]);
    const input = await createExecutorInput(
      workspaceRoot,
      [
        "Find the Modrinth mod for the startup crash fabric 1.20.1.",
        "Crash log loader dependency: modId=fabric-api; requestedBy=demo_addon; expected=0.92.2 or later; actual=0.91.0; kind=incompatible_dependency"
      ].join("\n")
    );

    const result = await executeMcpServerExternalModResolution(input, {
      modrinthResolver: async () => {
        throw new Error("local archive lookup must not search Modrinth");
      }
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "external_mod_resolution",
        result: {
          source: "local_archive",
          candidates: [
            {
              modId: "fabric-api",
              relativePath: "mods/fabric-api.jar",
              loaderDependencyRequester: {
                modId: "demo_addon",
                title: "Demo Addon",
                versionNumber: "1.4.0",
                relativePath: "mods/demo-addon.jar",
                metadataPath: "fabric.mod.json"
              }
            }
          ]
        }
      }
    });
  });

  it("does not attach the requester to path-only crash dependency matches", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-local-requester-miss-"));
    const requesterJar = join(workspaceRoot, "mods", "demo-addon.jar");
    const pathOnlyJar = join(workspaceRoot, "mods", "fabric-api-compat.jar");

    await writeZip(requesterJar, [
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "demo_addon",
          name: "Demo Addon",
          version: "1.4.0"
        })
      }
    ]);
    await writeZip(pathOnlyJar, [
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "compat",
          name: "Compatibility Bridge",
          version: "3.0.0"
        })
      }
    ]);
    const input = await createExecutorInput(
      workspaceRoot,
      [
        "Find the Modrinth mod for the startup crash fabric 1.20.1.",
        "Crash log loader dependency: modId=fabric-api; requestedBy=demo_addon; expected=0.92.2 or later; actual=0.91.0; kind=incompatible_dependency"
      ].join("\n")
    );

    const result = await executeMcpServerExternalModResolution(input, {
      modrinthResolver: async () => {
        throw new Error("local archive lookup must not search Modrinth");
      }
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "external_mod_resolution",
        result: {
          source: "local_archive",
          candidates: [
            {
              modId: "compat",
              relativePath: "mods/fabric-api-compat.jar"
            }
          ]
        }
      }
    });
    const candidate = result.payload.result.candidates[0];

    expect(candidate).not.toHaveProperty("loaderDependencyRequester");
    expect(candidate.confidenceReasons).not.toContain(
      "crash dependency requester demo_addon 1.4.0 from mods/demo-addon.jar"
    );
  });
});

async function createExecutorInput(workspaceRoot: string, requestText: string) {
  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot: "/tmp/mcpskill-runtime",
    workspace: { workspaceRoot }
  });
  const requestPlan = buildMcpServerRequestPlan(bootstrap, requestText);
  const evidencePlan = buildMcpServerEvidencePlan(requestPlan);

  return {
    candidate: evidencePlan.candidates[0],
    evidencePlan,
    requestPlan
  };
}

async function writeZip(
  path: string,
  entries: Array<{ name: string; content: string | Buffer }>
): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, createZip(entries));
}

function createZip(
  entries: Array<{ name: string; content: string | Buffer }>
): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content);
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
