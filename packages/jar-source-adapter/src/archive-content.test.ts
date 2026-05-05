import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  createArchiveContentCache,
  extractArchiveContent,
  listArchiveContent,
  readArchiveContentFile,
  searchArchiveContent
} from "./archive-content.js";

describe("extractArchiveContent", () => {
  it("extracts selected Java, datapack data, and assets content from mod jars", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-archive-content-"));
    const archivePath = join(runtimeRoot, "content-mod.jar");
    const targetRoot = join(runtimeRoot, "extracted");

    await writeFile(
      archivePath,
      createZip([
        {
          name: "net/example/Example.java",
          content: "package net.example; public class Example {}\n",
          compressionMethod: 8
        },
        {
          name: "data/demo/recipes/stone.json",
          content: "{\"result\":\"minecraft:stone\"}\n",
          compressionMethod: 0
        },
        {
          name: "assets/demo/lang/en_us.json",
          content: "{\"item.demo.foo\":\"Foo\"}\n",
          compressionMethod: 8
        },
        {
          name: "META-INF/mods.toml",
          content: "modLoader='javafml'\n",
          compressionMethod: 0
        },
        {
          name: "../escape.json",
          content: "{}\n",
          compressionMethod: 0
        }
      ])
    );

    await expect(
      extractArchiveContent({
        sourceArchive: archivePath,
        targetRoot,
        domains: ["java", "data", "assets"]
      })
    ).resolves.toEqual({
      fileCount: 3,
      byDomain: {
        java: 1,
        data: 1,
        assets: 1,
        class: 0,
        metadata: 0
      }
    });
    await expect(
      readFile(join(targetRoot, "data", "demo", "recipes", "stone.json"), "utf-8")
    ).resolves.toContain("minecraft:stone");
    await expect(
      readFile(join(targetRoot, "assets", "demo", "lang", "en_us.json"), "utf-8")
    ).resolves.toContain("item.demo.foo");
    await expect(readFile(join(targetRoot, "escape.json"), "utf-8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("lists, reads, and searches selected mod jar content without extracting it", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-archive-read-"));
    const archivePath = join(runtimeRoot, "content-mod.jar");

    await writeFile(
      archivePath,
      createZip([
        {
          name: "data/demo/recipes/stone.json",
          content: "{\"result\":\"minecraft:stone\"}\n",
          compressionMethod: 0
        },
        {
          name: "assets/demo/lang/en_us.json",
          content: "{\"item.demo.foo\":\"Foo\"}\n",
          compressionMethod: 8
        },
        {
          name: "assets/demo/textures/item/foo.png",
          content: Buffer.from([0, 1, 2, 3, 0]),
          compressionMethod: 0
        },
        {
          name: "net/example/Example.java",
          content: "package net.example; public class Example {}\n",
          compressionMethod: 8
        }
      ])
    );

    await expect(
      listArchiveContent({
        sourceArchive: archivePath,
        domains: ["data", "assets"],
        limit: 2
      })
    ).resolves.toMatchObject({
      entries: [
        {
          domain: "assets",
          relativePath: "assets/demo/lang/en_us.json",
          sizeBytes: 24
        },
        {
          domain: "assets",
          relativePath: "assets/demo/textures/item/foo.png",
          sizeBytes: 5
        }
      ],
      truncated: true
    });
    await expect(
      readArchiveContentFile({
        sourceArchive: archivePath,
        relativePath: "data/demo/recipes/stone.json",
        maxBytes: 100
      })
    ).resolves.toMatchObject({
      content: "{\"result\":\"minecraft:stone\"}\n",
      entry: {
        domain: "data",
        relativePath: "data/demo/recipes/stone.json"
      }
    });
    await expect(
      readArchiveContentFile({
        sourceArchive: archivePath,
        relativePath: "assets/demo/textures/item/foo.png",
        maxBytes: 100
      })
    ).resolves.toMatchObject({
      skipped: {
        reason: "binary",
        relativePath: "assets/demo/textures/item/foo.png"
      }
    });
    await expect(
      searchArchiveContent({
        sourceArchive: archivePath,
        domains: ["data", "assets", "java"],
        query: "minecraft:stone",
        maxBytesPerFile: 100
      })
    ).resolves.toMatchObject({
      matches: [
        {
          entry: {
            domain: "data",
            relativePath: "data/demo/recipes/stone.json"
          },
          line: 1,
          preview: "{\"result\":\"minecraft:stone\"}"
        }
      ],
      skipped: [
        {
          reason: "binary",
          relativePath: "assets/demo/textures/item/foo.png"
        }
      ],
      truncated: false
    });
  });

  it("searches class entry paths for crash stack traces without reading bytecode", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-archive-class-"));
    const archivePath = join(runtimeRoot, "runtime-mod.jar");

    await writeFile(
      archivePath,
      createZip([
        {
          name: "com/example/problem/CrashHandler.class",
          content: Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
          compressionMethod: 0
        }
      ])
    );

    await expect(
      readArchiveContentFile({
        sourceArchive: archivePath,
        relativePath: "com/example/problem/CrashHandler.class",
        maxBytes: 100
      })
    ).resolves.toMatchObject({
      skipped: {
        reason: "binary",
        relativePath: "com/example/problem/CrashHandler.class"
      }
    });
    await expect(
      searchArchiveContent({
        sourceArchive: archivePath,
        domains: ["class"],
        query: "com.example.problem.CrashHandler",
        maxBytesPerFile: 1
      })
    ).resolves.toMatchObject({
      matches: [
        {
          entry: {
            domain: "class",
            relativePath: "com/example/problem/CrashHandler.class"
          },
          line: 1,
          preview: "com/example/problem/CrashHandler.class"
        }
      ],
      skipped: [],
      truncated: false
    });
  });

  it("searches root and META-INF metadata entries for loader and mixin evidence", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-archive-meta-"));
    const archivePath = join(runtimeRoot, "metadata-mod.jar");

    await writeFile(
      archivePath,
      createZip([
        {
          name: "fabric.mod.json",
          content: "{\"id\":\"demo\"}\n",
          compressionMethod: 0
        },
        {
          name: "demo.mixins.json",
          content: "{\"package\":\"com.example.mixin\"}\n",
          compressionMethod: 0
        },
        {
          name: "META-INF/mods.toml",
          content: "modLoader='javafml'\n",
          compressionMethod: 0
        }
      ])
    );

    await expect(
      searchArchiveContent({
        sourceArchive: archivePath,
        domains: ["metadata"],
        query: "com.example.mixin",
        maxBytesPerFile: 100
      })
    ).resolves.toMatchObject({
      matches: [
        {
          entry: {
            domain: "metadata",
            relativePath: "demo.mixins.json"
          },
          preview: "{\"package\":\"com.example.mixin\"}"
        }
      ],
      skipped: [],
      truncated: false
    });
  });

  it("classifies access widener files as readable metadata content", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-archive-aw-"));
    const archivePath = join(runtimeRoot, "access-widener-mod.jar");

    await writeFile(
      archivePath,
      createZip([
        {
          name: "demo.accesswidener",
          content: [
            "accessWidener v2 named",
            "accessible class net/minecraft/client/MinecraftClient"
          ].join("\n"),
          compressionMethod: 0
        },
        {
          name: "META-INF/demo.classtweaker",
          content: "accessWidener v2 named\naccessible class net/minecraft/world/World",
          compressionMethod: 0
        }
      ])
    );

    await expect(
      listArchiveContent({
        sourceArchive: archivePath,
        domains: ["metadata"]
      })
    ).resolves.toMatchObject({
      entries: [
        {
          domain: "metadata",
          relativePath: "demo.accesswidener"
        },
        {
          domain: "metadata",
          relativePath: "META-INF/demo.classtweaker"
        }
      ],
      truncated: false
    });
    await expect(
      readArchiveContentFile({
        sourceArchive: archivePath,
        relativePath: "demo.accesswidener"
      })
    ).resolves.toMatchObject({
      content: expect.stringContaining("accessWidener v2 named"),
      entry: {
        domain: "metadata",
        relativePath: "demo.accesswidener"
      }
    });
    await expect(
      searchArchiveContent({
        sourceArchive: archivePath,
        domains: ["metadata"],
        query: "MinecraftClient"
      })
    ).resolves.toMatchObject({
      matches: [
        {
          entry: {
            domain: "metadata",
            relativePath: "demo.accesswidener"
          },
          preview: "accessible class net/minecraft/client/MinecraftClient"
        }
      ],
      skipped: [],
      truncated: false
    });
  });

  it("caches central directory metadata and selected text entry reads", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-archive-cache-"));
    const archivePath = join(runtimeRoot, "content-mod.jar");
    const cache = createArchiveContentCache({
      maxCentralDirectories: 2,
      maxTextFiles: 2
    });

    await writeFile(
      archivePath,
      createZip([
        {
          name: "data/demo/recipes/gear.json",
          content: "{\"result\":\"demo:gear\"}\n",
          compressionMethod: 0
        }
      ])
    );

    await expect(
      listArchiveContent({
        sourceArchive: archivePath,
        domains: ["data"],
        cache
      })
    ).resolves.toMatchObject({
      cache: { centralDirectoryHit: false }
    });
    await expect(
      listArchiveContent({
        sourceArchive: archivePath,
        domains: ["data"],
        cache
      })
    ).resolves.toMatchObject({
      cache: { centralDirectoryHit: true }
    });
    await expect(
      readArchiveContentFile({
        sourceArchive: archivePath,
        relativePath: "data/demo/recipes/gear.json",
        cache
      })
    ).resolves.toMatchObject({
      cache: {
        centralDirectoryHit: true,
        textFileHit: false
      }
    });
    await expect(
      readArchiveContentFile({
        sourceArchive: archivePath,
        relativePath: "data/demo/recipes/gear.json",
        cache
      })
    ).resolves.toMatchObject({
      content: "{\"result\":\"demo:gear\"}\n",
      cache: {
        centralDirectoryHit: true,
        textFileHit: true
      }
    });

    expect(cache.size()).toEqual({
      centralDirectories: 1,
      textFiles: 1,
      archiveInspections: 0
    });
    cache.clear();
    expect(cache.size()).toEqual({
      centralDirectories: 0,
      textFiles: 0,
      archiveInspections: 0
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
