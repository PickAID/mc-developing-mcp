import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  traceModArchiveResourceReferences,
  traceNestedModArchiveResourceReferences
} from "./mod-archive-resource-references.js";

describe("traceModArchiveResourceReferences", () => {
  it("traces blockstate models and model textures inside a mod archive", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-jar-resource-trace-"));
    const archivePath = join(runtimeRoot, "content-mod.jar");

    await writeFile(
      archivePath,
      createZip([
        {
          name: "assets/demo/blockstates/gear.json",
          content: "{\"variants\":{\"\":{\"model\":\"demo:block/gear\"}}}\n",
          compressionMethod: 0
        },
        {
          name: "assets/demo/models/block/gear.json",
          content: "{\"textures\":{\"all\":\"demo:block/gear\",\"missing\":\"demo:block/missing\"}}\n",
          compressionMethod: 8
        },
        {
          name: "assets/demo/textures/block/gear.png",
          content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
          compressionMethod: 0
        }
      ])
    );

    await expect(
      traceModArchiveResourceReferences({
        sourceArchive: archivePath,
        startPaths: ["assets/demo/blockstates/gear.json"]
      })
    ).resolves.toMatchObject({
      startPaths: ["assets/demo/blockstates/gear.json"],
      references: [
        {
          fromPath: "assets/demo/blockstates/gear.json",
          fromKind: "blockstates",
          relation: "blockstate_model",
          value: "demo:block/gear",
          toPath: "assets/demo/models/block/gear.json",
          toKind: "models",
          status: "resolved"
        },
        {
          fromPath: "assets/demo/models/block/gear.json",
          fromKind: "models",
          relation: "model_texture",
          value: "demo:block/gear",
          toPath: "assets/demo/textures/block/gear.png",
          toKind: "textures",
          status: "resolved"
        },
        {
          fromPath: "assets/demo/models/block/gear.json",
          fromKind: "models",
          relation: "model_texture",
          value: "demo:block/missing",
          toPath: "assets/demo/textures/block/missing.png",
          toKind: "textures",
          status: "missing"
        }
      ],
      unresolved: [
        {
          toPath: "assets/demo/textures/block/missing.png",
          status: "missing"
        }
      ],
      skipped: [],
      truncated: false
    });
  });

  it("traces blockstate models and model textures inside nested mod archives", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-nested-resource-trace-"));
    const archivePath = join(runtimeRoot, "outer-mod.jar");
    const nestedArchive = createZip([
      {
        name: "assets/demo/blockstates/gear.json",
        content: "{\"variants\":{\"\":{\"model\":\"demo:block/gear\"}}}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/models/block/gear.json",
        content: "{\"textures\":{\"all\":\"demo:block/gear\"}}\n",
        compressionMethod: 8
      },
      {
        name: "assets/demo/textures/block/gear.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        compressionMethod: 0
      }
    ]);

    await writeFile(
      archivePath,
      createZip([
        {
          name: "META-INF/jarjar/nested-content.jar",
          content: nestedArchive,
          compressionMethod: 8
        }
      ])
    );

    await expect(
      traceNestedModArchiveResourceReferences({
        sourceArchive: archivePath,
        embeddedArchivePath: "META-INF/jarjar/nested-content.jar",
        startPaths: ["assets/demo/blockstates/gear.json"]
      })
    ).resolves.toMatchObject({
      sourceArchive: archivePath,
      embeddedArchivePath: "META-INF/jarjar/nested-content.jar",
      startPaths: ["assets/demo/blockstates/gear.json"],
      references: [
        {
          fromPath: "assets/demo/blockstates/gear.json",
          relation: "blockstate_model",
          toPath: "assets/demo/models/block/gear.json",
          status: "resolved"
        },
        {
          fromPath: "assets/demo/models/block/gear.json",
          relation: "model_texture",
          toPath: "assets/demo/textures/block/gear.png",
          status: "resolved"
        }
      ],
      unresolved: [],
      skipped: [],
      truncated: false
    });
  });

  it("traces item definition models and textures inside a mod archive", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-jar-item-trace-"));
    const archivePath = join(runtimeRoot, "content-mod.jar");

    await writeFile(
      archivePath,
      createZip([
        {
          name: "assets/demo/items/gear.json",
          content: "{\"model\":{\"type\":\"minecraft:model\",\"model\":\"demo:item/gear\"}}\n",
          compressionMethod: 0
        },
        {
          name: "assets/demo/models/item/gear.json",
          content: "{\"textures\":{\"layer0\":\"demo:item/gear\"}}\n",
          compressionMethod: 8
        },
        {
          name: "assets/demo/textures/item/gear.png",
          content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
          compressionMethod: 0
        }
      ])
    );

    await expect(
      traceModArchiveResourceReferences({
        sourceArchive: archivePath,
        startPaths: ["assets/demo/items/gear.json"]
      })
    ).resolves.toMatchObject({
      startPaths: ["assets/demo/items/gear.json"],
      references: [
        {
          fromPath: "assets/demo/items/gear.json",
          fromKind: "items",
          relation: "item_model",
          value: "demo:item/gear",
          toPath: "assets/demo/models/item/gear.json",
          toKind: "models",
          status: "resolved"
        },
        {
          fromPath: "assets/demo/models/item/gear.json",
          fromKind: "models",
          relation: "model_texture",
          toPath: "assets/demo/textures/item/gear.png",
          status: "resolved"
        }
      ],
      unresolved: [],
      skipped: [],
      truncated: false
    });
  });

  it("traces item definition models inside nested mod archives", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-nested-item-trace-"));
    const archivePath = join(runtimeRoot, "outer-mod.jar");
    const nestedArchive = createZip([
      {
        name: "assets/demo/items/gear.json",
        content: "{\"model\":{\"type\":\"minecraft:model\",\"model\":\"demo:item/gear\"}}\n",
        compressionMethod: 0
      },
      {
        name: "assets/demo/models/item/gear.json",
        content: "{}\n",
        compressionMethod: 8
      }
    ]);

    await writeFile(
      archivePath,
      createZip([
        {
          name: "META-INF/jarjar/nested-content.jar",
          content: nestedArchive,
          compressionMethod: 8
        }
      ])
    );

    await expect(
      traceNestedModArchiveResourceReferences({
        sourceArchive: archivePath,
        embeddedArchivePath: "META-INF/jarjar/nested-content.jar",
        startPaths: ["assets/demo/items/gear.json"]
      })
    ).resolves.toMatchObject({
      embeddedArchivePath: "META-INF/jarjar/nested-content.jar",
      startPaths: ["assets/demo/items/gear.json"],
      references: [
        {
          fromPath: "assets/demo/items/gear.json",
          fromKind: "items",
          relation: "item_model",
          toPath: "assets/demo/models/item/gear.json",
          status: "resolved"
        }
      ],
      unresolved: [],
      skipped: [],
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
