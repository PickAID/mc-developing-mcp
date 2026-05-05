import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateRawSync } from "node:zlib";

export async function createLookupWorkspace(): Promise<{
  gradleUserHome: string;
  workspaceRoot: string;
}> {
  return {
    gradleUserHome: await mkdtemp(join(tmpdir(), "mcpskill-gradle-home-")),
    workspaceRoot: await mkdtemp(join(tmpdir(), "mcpskill-workspace-"))
  };
}

export function joinGradleSourceJar(
  gradleUserHome: string,
  group: string,
  artifact: string,
  version: string
): string {
  return join(
    gradleUserHome,
    "caches",
    "modules-2",
    "files-2.1",
    group,
    artifact,
    version,
    "hash",
    `${artifact}-${version}-sources.jar`
  );
}

export async function writeZip(
  path: string,
  entries: ZipFixtureEntry[]
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, createZip(entries));
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

export function longWidgetSource(): string {
  return [
    "package com.example.lib;",
    "public class Widget {",
    ...Array.from({ length: 59 }, (_, index) => `  // line ${index + 3}`),
    "}",
    ""
  ].join("\n");
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
