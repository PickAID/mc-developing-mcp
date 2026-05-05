import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveGradleDependencyArchiveLookup } from "./gradle-dependency-archive-lookup.js";

describe("resolveGradleDependencyArchiveLookup", () => {
  it("locates class owners from declared Gradle binary jars when sources are unavailable", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-gradle-bin-workspace-"));
    const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-gradle-bin-home-"));
    const binaryJar = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "com.example",
      "example-lib",
      "1.0.0",
      "hash",
      "example-lib-1.0.0.jar"
    );

    await writeFile(
      join(workspaceRoot, "build.gradle"),
      'dependencies { implementation "com.example:example-lib:1.0.0" }\n'
    );
    await writeZip(binaryJar, ["com/example/lib/Widget.class"]);

    await expect(
      resolveGradleDependencyArchiveLookup({
        workspaceRoot,
        requestText: "Crash at com.example.lib.Widget.tick(Widget.java:42)",
        discovery: {
          gradleUserHome,
          includeDefaultGradleUserHome: false
        }
      })
    ).resolves.toMatchObject({
      status: "ready",
      requestedClasses: ["com.example.lib.Widget"],
      searchedArchives: 1,
      matches: [
        {
          sourceArchive: binaryJar,
          binaryName: "com.example.lib.Widget",
          relativePath: "com/example/lib/Widget.class",
          matchKind: "exact"
        }
      ]
    });
  });
});

async function writeZip(path: string, entryNames: string[]): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, createZip(entryNames));
}

function createZip(entryNames: string[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entryName of entryNames) {
    const name = Buffer.from(entryName);
    const content = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
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
