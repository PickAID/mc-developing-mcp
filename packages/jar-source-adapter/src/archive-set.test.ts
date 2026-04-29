import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { discoverModArchives, searchArchiveSetContent } from "./index.js";

describe("mod archive discovery and search", () => {
  it("discovers mod jars from common modpack and Gradle runtime locations", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-mod-archives-"));
    const modJar = join(workspaceRoot, "mods", "content-mod.jar");
    const runModJar = join(workspaceRoot, "run", "mods", "runtime-mod.jar");
    const clientModJar = join(workspaceRoot, "run", "client", "mods", "client-mod.jar");
    const sourceJar = join(workspaceRoot, "libs", "dev-helper-sources.jar");

    await mkdir(join(modJar, ".."), { recursive: true });
    await mkdir(join(runModJar, ".."), { recursive: true });
    await mkdir(join(clientModJar, ".."), { recursive: true });
    await mkdir(join(sourceJar, ".."), { recursive: true });
    await writeFile(modJar, "");
    await writeFile(runModJar, "");
    await writeFile(clientModJar, "");
    await writeFile(sourceJar, "");

    await expect(discoverModArchives({ workspaceRoot, maxArchives: 2 })).resolves.toEqual({
      archives: [
        {
          archivePath: modJar,
          relativePath: "mods/content-mod.jar",
          source: "mods-directory"
        },
        {
          archivePath: clientModJar,
          relativePath: "run/client/mods/client-mod.jar",
          source: "run-mods-directory"
        }
      ],
      truncated: true
    });
  });

  it("searches text content across multiple mod jars with archive and match budgets", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-mod-search-"));
    const firstJar = join(workspaceRoot, "mods", "first.jar");
    const secondJar = join(workspaceRoot, "mods", "second.jar");

    await mkdir(join(firstJar, ".."), { recursive: true });
    await writeFile(firstJar, createZip([
      {
        name: "data/demo/recipes/problem.json",
        content: "{\"id\":\"problematic_recipe\"}\n",
        compressionMethod: 0
      }
    ]));
    await writeFile(secondJar, createZip([
      {
        name: "assets/demo/lang/en_us.json",
        content: "{\"item.demo.problematic_recipe\":\"Problem\"}\n",
        compressionMethod: 8
      }
    ]));

    await expect(
      searchArchiveSetContent({
        sourceArchives: [firstJar, secondJar],
        domains: ["data", "assets"],
        query: "problematic_recipe",
        maxArchives: 2,
        maxMatches: 1
      })
    ).resolves.toMatchObject({
      matches: [
        {
          sourceArchive: firstJar,
          entry: {
            relativePath: "data/demo/recipes/problem.json"
          },
          line: 1
        }
      ],
      searchedArchives: 1,
      truncated: true
    });
  });

  it("searches one-level JarJar nested archives with embedded metadata", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-jarjar-search-"));
    const outerJar = join(workspaceRoot, "mods", "outer.jar");
    const nestedJar = createZip([
      {
        name: "fabric.mod.json",
        content: JSON.stringify({
          id: "nested_content",
          name: "Nested Content",
          version: "2.0.0"
        }),
        compressionMethod: 0
      },
      {
        name: "data/demo/recipes/nested_gear.json",
        content: "{\"result\":\"demo:nested_gear\"}\n",
        compressionMethod: 0
      }
    ]);

    await mkdir(join(outerJar, ".."), { recursive: true });
    await writeFile(outerJar, createZip([
      {
        name: "META-INF/jarjar/nested-content.jar",
        content: nestedJar,
        compressionMethod: 8
      }
    ]));

    await expect(
      searchArchiveSetContent({
        sourceArchives: [outerJar],
        domains: ["data"],
        query: "demo:nested_gear",
        maxArchives: 1,
        maxMatches: 4
      })
    ).resolves.toMatchObject({
      matches: [
        {
          sourceArchive: outerJar,
          embeddedArchivePath: "META-INF/jarjar/nested-content.jar",
          embeddedArchiveMetadata: {
            loader: "fabric",
            modId: "nested_content",
            name: "Nested Content",
            version: "2.0.0"
          },
          entry: {
            relativePath: "data/demo/recipes/nested_gear.json"
          },
          preview: "{\"result\":\"demo:nested_gear\"}"
        }
      ],
      searchedArchives: 1,
      truncated: false
    });
  });
});

interface ZipFixtureEntry {
  name: string;
  content: string | Buffer;
  compressionMethod: 0 | 8;
}

function createZip(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content);
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
