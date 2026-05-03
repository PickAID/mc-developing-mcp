import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { executeMcpServerExternalModResolution } from "./external-mod-resolution-executor.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";

describe("external mod resolution Gradle dependency variant evidence", () => {
  it("uses declared Gradle classifier cache jars before remote lookup", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-gradle-var-"));
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
      "energy-core-1.0.0-all.jar"
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
      payload: {
        result: {
          source: "gradle_dependency_archive",
          candidates: [
            {
              coordinate: "org.widgets:energy-core:1.0.0",
              modId: "local_energy",
              archivePath,
              fileName: "energy-core-1.0.0-all.jar"
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
