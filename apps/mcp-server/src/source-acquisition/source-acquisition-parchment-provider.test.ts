import { describe, expect, it } from "vitest";

import {
  createParchmentMavenMappingIndexProvider,
  parseParchmentMappings
} from "./source-acquisition-parchment-provider.js";

describe("parseParchmentMappings", () => {
  it("converts Parchment JSON into mojmap to parchment enrichment entries", () => {
    const result = parseParchmentMappings({
      minecraftVersion: "1.21.1",
      mappingFamily: "parchment",
      content: JSON.stringify({
        version: "1.1.0",
        classes: [
          {
            name: "net/minecraft/world/item/ItemStack",
            javadoc: ["Represents an item stack."],
            fields: [
              {
                name: "count",
                descriptor: "I",
                javadoc: ["The item count."]
              }
            ],
            methods: [
              {
                name: "setHoverName",
                descriptor: "(Lnet/minecraft/network/chat/Component;)V",
                parameters: [
                  {
                    index: 1,
                    name: "name",
                    javadoc: "the hover name"
                  }
                ]
              }
            ]
          }
        ]
      })
    });

    expect(result).toMatchObject({
      provenance: {
        format: "parchment_json",
        minecraftVersion: "1.21.1",
        mappingFamily: "parchment",
        fromNamespace: "mojmap",
        toNamespace: "parchment"
      },
      entries: [
        {
          kind: "class",
          fromNamespace: "mojmap",
          toNamespace: "parchment",
          fromName: "net.minecraft.world.item.ItemStack",
          toName: "net.minecraft.world.item.ItemStack",
          javadoc: ["Represents an item stack."]
        },
        {
          kind: "field",
          fromName: "count",
          toName: "count",
          owner: "net.minecraft.world.item.ItemStack",
          descriptor: "I",
          javadoc: ["The item count."]
        },
        {
          kind: "method",
          fromName: "setHoverName",
          toName: "setHoverName",
          owner: "net.minecraft.world.item.ItemStack",
          descriptor: "(Lnet/minecraft/network/chat/Component;)V",
          parameters: [
            {
              index: 1,
              name: "name",
              javadoc: "the hover name"
            }
          ]
        }
      ]
    });
  });
});

describe("createParchmentMavenMappingIndexProvider", () => {
  it("resolves release metadata and parses parchment.json from a zip artifact", async () => {
    const fetchedUrls: string[] = [];
    const provider = createParchmentMavenMappingIndexProvider({
      mavenBaseUrl: "https://maven.parchmentmc.test",
      fetch: async (url) => {
        fetchedUrls.push(url.toString());
        if (url.pathname.endsWith("/maven-metadata.xml")) {
          return textResponse(
            [
              "<metadata><versioning>",
              "<latest>2024.11.17</latest>",
              "<release>2024.11.17</release>",
              "<versions><version>2024.11.13</version>",
              "<version>2024.11.17</version></versions>",
              "</versioning></metadata>"
            ].join("")
          );
        }

        return bytesResponse(
          createZipWithContents([
            {
              name: "parchment.json",
              content: JSON.stringify({
                classes: [
                  {
                    name: "net/minecraft/Example",
                    methods: [
                      {
                        name: "tick",
                        descriptor: "()V",
                        javadoc: ["Runs each tick."]
                      }
                    ]
                  }
                ]
              })
            }
          ])
        );
      }
    });

    const result = await provider({
      minecraftVersion: "1.21.1",
      mappingFamily: "parchment"
    });

    expect(fetchedUrls).toEqual([
      "https://maven.parchmentmc.test/org/parchmentmc/data/parchment-1.21.1/maven-metadata.xml",
      "https://maven.parchmentmc.test/org/parchmentmc/data/parchment-1.21.1/2024.11.17/parchment-1.21.1-2024.11.17.zip"
    ]);
    expect(result.provenance).toMatchObject({
      format: "parchment_json",
      mappingFamily: "parchment",
      parchmentVersion: "2024.11.17"
    });
    expect(result.entries).toHaveLength(2);
  });

  it("does not cache unavailable Parchment versions as ready empty indexes", async () => {
    const provider = createParchmentMavenMappingIndexProvider({
      mavenBaseUrl: "https://maven.parchmentmc.test",
      fetch: async () =>
        textResponse(
          "<metadata><versioning><versions><version>BLEEDING-SNAPSHOT</version></versions></versioning></metadata>"
        )
    });

    const result = await provider({
      minecraftVersion: "1.21.1",
      mappingFamily: "parchment"
    });

    expect(result).toEqual({
      provenance: {
        format: "parchment_json",
        status: "parchment_version_unavailable",
        minecraftVersion: "1.21.1",
        mappingFamily: "parchment"
      },
      cacheable: false,
      entries: []
    });
  });

  it("does not handle non-parchment mapping families", async () => {
    const provider = createParchmentMavenMappingIndexProvider({
      mavenBaseUrl: "https://maven.parchmentmc.test",
      fetch: async () => {
        throw new Error("fetch should not be called for yarn");
      }
    });

    const result = await provider({
      minecraftVersion: "1.21.1",
      mappingFamily: "yarn"
    });

    expect(result).toMatchObject({
      provenance: {
        status: "mapping_family_unavailable",
        mappingFamily: "yarn"
      },
      cacheable: false,
      entries: []
    });
  });
});

function textResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/plain" }
  });
}

function bytesResponse(body: Buffer): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/zip" }
  });
}

function createZipWithContents(entries: Array<{ name: string; content: string }>): Buffer {
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
