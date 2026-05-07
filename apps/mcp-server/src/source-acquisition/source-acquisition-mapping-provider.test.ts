import { describe, expect, it } from "vitest";

import {
  createTinyV2MappingIndexProvider,
  parseTinyV2Mappings
} from "./source-acquisition-mapping-provider.js";

describe("parseTinyV2Mappings", () => {
  it("converts Tiny v2 class, field, and method rows into mapping entries", () => {
    const result = parseTinyV2Mappings({
      minecraftVersion: "1.21.1",
      mappingFamily: "yarn",
      content: [
        "tiny\t2\t0\tofficial\tnamed",
        "c\ta\tcom.example.ItemStack",
        "\tf\tI\tb\tcount",
        "\tm\t()I\tc\tgetCount",
        ""
      ].join("\n")
    });

    expect(result).toMatchObject({
      provenance: {
        format: "tiny_v2",
        minecraftVersion: "1.21.1",
        mappingFamily: "yarn",
        fromNamespace: "official",
        toNamespace: "named"
      },
      entries: [
        {
          kind: "class",
          fromNamespace: "official",
          toNamespace: "named",
          fromName: "a",
          toName: "com.example.ItemStack"
        },
        {
          kind: "field",
          fromName: "b",
          toName: "count",
          owner: "com.example.ItemStack",
          descriptor: "I"
        },
        {
          kind: "method",
          fromName: "c",
          toName: "getCount",
          owner: "com.example.ItemStack",
          descriptor: "()I"
        }
      ]
    });
  });

  it("normalizes internal slash class names to dotted Java names", () => {
    const result = parseTinyV2Mappings({
      minecraftVersion: "1.21.1",
      mappingFamily: "yarn",
      content: [
        "tiny\t2\t0\tofficial\tnamed",
        "c\ta\tnet/minecraft/world/item/ItemStack",
        "\tm\t()I\tb\tgetCount",
        ""
      ].join("\n")
    });

    expect(result.entries).toEqual([
      {
        kind: "class",
        fromNamespace: "official",
        toNamespace: "named",
        fromName: "a",
        toName: "net.minecraft.world.item.ItemStack"
      },
      {
        kind: "method",
        fromNamespace: "official",
        toNamespace: "named",
        fromName: "b",
        toName: "getCount",
        owner: "net.minecraft.world.item.ItemStack",
        descriptor: "()I"
      }
    ]);
  });

  it("selects requested Tiny namespaces instead of assuming first and last", () => {
    const result = parseTinyV2Mappings({
      minecraftVersion: "1.21.1",
      mappingFamily: "yarn",
      fromNamespace: "intermediary",
      toNamespace: "named",
      content: [
        "tiny\t2\t0\tofficial\tintermediary\tnamed",
        "c\ta\tclass_1799\tnet.minecraft.world.item.ItemStack",
        "\tm\t()I\tb\tmethod_31574\tgetCount",
        ""
      ].join("\n")
    });

    expect(result.entries).toEqual([
      {
        kind: "class",
        fromNamespace: "intermediary",
        toNamespace: "named",
        fromName: "class_1799",
        toName: "net.minecraft.world.item.ItemStack"
      },
      {
        kind: "method",
        fromNamespace: "intermediary",
        toNamespace: "named",
        fromName: "method_31574",
        toName: "getCount",
        owner: "net.minecraft.world.item.ItemStack",
        descriptor: "()I"
      }
    ]);
  });

  it("rejects unsupported Tiny headers and unknown namespaces", () => {
    expect(() =>
      parseTinyV2Mappings({
        minecraftVersion: "1.21.1",
        mappingFamily: "yarn",
        content: "tiny\t1\t0\tofficial\tnamed\n"
      })
    ).toThrow("Expected Tiny v2 mapping header.");

    expect(() =>
      parseTinyV2Mappings({
        minecraftVersion: "1.21.1",
        mappingFamily: "yarn",
        fromNamespace: "missing",
        content: "tiny\t2\t0\tofficial\tnamed\n"
      })
    ).toThrow("Tiny mapping namespace missing was not found.");
  });
});

describe("createTinyV2MappingIndexProvider", () => {
  it("fetches and parses raw Tiny v2 text through an injected fetcher", async () => {
    const fetchedUrls: string[] = [];
    const provider = createTinyV2MappingIndexProvider({
      resolveUrl: ({ minecraftVersion }) =>
        `https://maven.test/yarn/${minecraftVersion}/mappings.tiny`,
      fetch: async (url) => {
        fetchedUrls.push(url.toString());
        return textResponse("tiny\t2\t0\tofficial\tnamed\nc\ta\tExample\n");
      }
    });

    const result = await provider({
      minecraftVersion: "1.21.1",
      mappingFamily: "yarn"
    });

    expect(fetchedUrls).toEqual([
      "https://maven.test/yarn/1.21.1/mappings.tiny"
    ]);
    expect(result.entries).toEqual([
      {
        kind: "class",
        fromNamespace: "official",
        toNamespace: "named",
        fromName: "a",
        toName: "Example"
      }
    ]);
  });

  it("fetches and parses Tiny v2 mappings from a zip artifact", async () => {
    const provider = createTinyV2MappingIndexProvider({
      resolveUrl: () => "https://maven.test/yarn/1.21.1/yarn.zip",
      fetch: async () =>
        bytesResponse(
          createZip([
            {
              name: "ignored.txt",
              content: "ignore me"
            },
            {
              name: "mappings/mappings.tiny",
              content: "tiny\t2\t0\tofficial\tnamed\nc\ta\tZipExample\n"
            }
          ])
        )
    });

    const result = await provider({
      minecraftVersion: "1.21.1",
      mappingFamily: "yarn"
    });

    expect(result.entries).toEqual([
      {
        kind: "class",
        fromNamespace: "official",
        toNamespace: "named",
        fromName: "a",
        toName: "ZipExample"
      }
    ]);
  });

  it("prefers mappings/mappings.tiny over other tiny files in a zip artifact", async () => {
    const provider = createTinyV2MappingIndexProvider({
      resolveUrl: () => "https://maven.test/yarn/1.21.1/yarn.zip",
      fetch: async () =>
        bytesResponse(
          createZip([
            {
              name: "extras/wrong.tiny",
              content: "tiny\t2\t0\tofficial\tnamed\nc\ta\tWrong\n"
            },
            {
              name: "mappings/mappings.tiny",
              content: "tiny\t2\t0\tofficial\tnamed\nc\ta\tCorrect\n"
            }
          ])
        )
    });

    const result = await provider({
      minecraftVersion: "1.21.1",
      mappingFamily: "yarn"
    });

    expect(result.entries[0]).toMatchObject({
      toName: "Correct"
    });
  });
});

function textResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain"
    }
  });
}

function bytesResponse(body: Buffer): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/zip"
    }
  });
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
