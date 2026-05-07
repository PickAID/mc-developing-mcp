import { describe, expect, it } from "vitest";

import {
  createMojangManifestMappingIndexProvider,
  parseProguardMappings
} from "./source-acquisition-mojmap-provider.js";

describe("parseProguardMappings", () => {
  it("converts Mojang ProGuard class, field, and method rows into mojmap entries", () => {
    const result = parseProguardMappings({
      minecraftVersion: "1.21.1",
      mappingFamily: "mojmap",
      content: [
        "net.minecraft.world.item.ItemStack -> cxo:",
        "    int count -> b",
        "    12:13:int getCount() -> c",
        "    14:15:int getDamage():42:43 -> e",
        "    21:22:void setName(java.lang.String,int[]) -> d",
        ""
      ].join("\n")
    });

    expect(result).toMatchObject({
      provenance: {
        format: "proguard",
        minecraftVersion: "1.21.1",
        mappingFamily: "mojmap",
        fromNamespace: "official",
        toNamespace: "mojmap"
      },
      entries: [
        {
          kind: "class",
          fromNamespace: "official",
          toNamespace: "mojmap",
          fromName: "cxo",
          toName: "net.minecraft.world.item.ItemStack"
        },
        {
          kind: "field",
          fromName: "b",
          toName: "count",
          owner: "net.minecraft.world.item.ItemStack",
          descriptor: "I"
        },
        {
          kind: "method",
          fromName: "c",
          toName: "getCount",
          owner: "net.minecraft.world.item.ItemStack",
          descriptor: "()I"
        },
        {
          kind: "method",
          fromName: "e",
          toName: "getDamage",
          owner: "net.minecraft.world.item.ItemStack",
          descriptor: "()I"
        },
        {
          kind: "method",
          fromName: "d",
          toName: "setName",
          owner: "net.minecraft.world.item.ItemStack",
          descriptor: "(Ljava/lang/String;[I)V"
        }
      ]
    });
  });
});

describe("createMojangManifestMappingIndexProvider", () => {
  it("fetches version metadata and both official mapping artifacts", async () => {
    const fetchedUrls: string[] = [];
    const provider = createMojangManifestMappingIndexProvider({
      versionManifestUrl: "https://piston-meta.test/version_manifest_v2.json",
      fetch: async (url) => {
        fetchedUrls.push(url.toString());
        if (url.pathname.endsWith("version_manifest_v2.json")) {
          return jsonResponse({
            versions: [
              {
                id: "1.21.1",
                url: "https://piston-meta.test/v1/packages/abc/1.21.1.json"
              }
            ]
          });
        }
        if (url.pathname.endsWith("1.21.1.json")) {
          return jsonResponse({
            downloads: {
              client_mappings: {
                url: "https://piston-data.test/client.txt"
              },
              server_mappings: {
                url: "https://piston-data.test/server.txt"
              }
            }
          });
        }

        return textResponse(
          "net.minecraft.Example -> abc:\n    int value -> a\n"
        );
      }
    });

    const result = await provider({
      minecraftVersion: "1.21.1",
      mappingFamily: "mojmap"
    });

    expect(fetchedUrls).toEqual([
      "https://piston-meta.test/version_manifest_v2.json",
      "https://piston-meta.test/v1/packages/abc/1.21.1.json",
      "https://piston-data.test/client.txt",
      "https://piston-data.test/server.txt"
    ]);
    expect(result.provenance).toMatchObject({
      format: "proguard",
      mappingFamily: "mojmap",
      artifactUrls: [
        "https://piston-data.test/client.txt",
        "https://piston-data.test/server.txt"
      ]
    });
    expect(result.entries).toHaveLength(4);
  });

  it("does not cache a missing Mojang version as a ready empty index", async () => {
    const provider = createMojangManifestMappingIndexProvider({
      versionManifestUrl: "https://piston-meta.test/version_manifest_v2.json",
      fetch: async () =>
        jsonResponse({
          versions: [
            {
              id: "1.20.1",
              url: "https://piston-meta.test/v1/packages/old/1.20.1.json"
            }
          ]
        })
    });

    const result = await provider({
      minecraftVersion: "1.21.1",
      mappingFamily: "mojmap"
    });

    expect(result).toEqual({
      provenance: {
        format: "proguard",
        status: "mojang_version_unavailable",
        minecraftVersion: "1.21.1",
        mappingFamily: "mojmap"
      },
      cacheable: false,
      entries: []
    });
  });

  it("does not handle non-mojmap mapping families", async () => {
    const provider = createMojangManifestMappingIndexProvider({
      versionManifestUrl: "https://piston-meta.test/version_manifest_v2.json",
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}

function textResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain"
    }
  });
}
