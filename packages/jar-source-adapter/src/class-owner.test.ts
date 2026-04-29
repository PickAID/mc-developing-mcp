import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractJavaClassReferences,
  findArchiveSetClassOwners
} from "./class-owner.js";

describe("extractJavaClassReferences", () => {
  it("extracts stacktrace class references while filtering configured platform packages", () => {
    const references = extractJavaClassReferences(
      [
        "java.lang.NullPointerException: crash",
        "\tat com.example.problem.CrashHandler.tick(CrashHandler.java:42)",
        "\tat net.minecraft.server.MinecraftServer.runServer(MinecraftServer.java:870)",
        "\tat com.example.problem.CrashHandler.tick(CrashHandler.java:43)"
      ].join("\n"),
      {
        ignoredPackagePrefixes: ["java.", "net.minecraft."]
      }
    );

    expect(references).toEqual(["com.example.problem.CrashHandler"]);
  });
});

describe("findArchiveSetClassOwners", () => {
  it("locates exact class owners across multiple mod jars without reading bytecode", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-class-owner-"));
    const firstArchive = join(runtimeRoot, "first-mod.jar");
    const secondArchive = join(runtimeRoot, "second-mod.jar");

    await writeFile(
      firstArchive,
      createZip([
        "com/example/problem/CrashHandler.class",
        "com/example/problem/CrashHandler$Nested.class"
      ])
    );
    await writeFile(
      secondArchive,
      createZip(["com/example/other/CrashHandler.class"])
    );

    await expect(
      findArchiveSetClassOwners({
        sourceArchives: [firstArchive, secondArchive],
        classNames: ["com.example.problem.CrashHandler"],
        maxMatches: 4
      })
    ).resolves.toMatchObject({
      matches: [
        {
          sourceArchive: firstArchive,
          requestedClassName: "com.example.problem.CrashHandler",
          binaryName: "com.example.problem.CrashHandler",
          relativePath: "com/example/problem/CrashHandler.class",
          matchKind: "exact"
        }
      ],
      searchedArchives: 2,
      truncated: false
    });
  });

  it("locates class owners inside one-level JarJar nested archives", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-class-owner-jarjar-"));
    const outerArchive = join(runtimeRoot, "outer-mod.jar");
    const nestedArchive = createZip([
      "fabric.mod.json",
      "com/example/nested/NestedCrash.class"
    ]);

    await writeFile(
      outerArchive,
      createZipEntries([
        {
          name: "META-INF/jarjar/nested-lib.jar",
          content: nestedArchive
        }
      ])
    );

    await expect(
      findArchiveSetClassOwners({
        sourceArchives: [outerArchive],
        classNames: ["com.example.nested.NestedCrash"],
        maxMatches: 4
      })
    ).resolves.toMatchObject({
      matches: [
        {
          sourceArchive: outerArchive,
          embeddedArchivePath: "META-INF/jarjar/nested-lib.jar",
          requestedClassName: "com.example.nested.NestedCrash",
          binaryName: "com.example.nested.NestedCrash",
          relativePath: "com/example/nested/NestedCrash.class",
          matchKind: "exact"
        }
      ],
      searchedArchives: 1,
      truncated: false
    });
  });
});

function createZip(entryNames: string[]): Buffer {
  return createZipEntries(
    entryNames.map((entryName) => ({
      name: entryName,
      content: Buffer.from([0xca, 0xfe, 0xba, 0xbe])
    }))
  );
}

function createZipEntries(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = entry.content;
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

interface ZipFixtureEntry {
  name: string;
  content: Buffer;
}
