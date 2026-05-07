import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { executeMcpServerMappingIndexWorkItem } from "./source-acquisition-mapping-index.js";

describe("executeMcpServerMappingIndexWorkItem", () => {
  it("rejects unsafe version path segments before cache access", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mcpskill-mapping-safe-"));
    const outsidePath = join(tempRoot, "outside", "mappings.jsonl");

    try {
      const result = await executeMcpServerMappingIndexWorkItem({
        runtimeRoot: join(tempRoot, "runtime"),
        minecraftVersion: "../outside",
        mappingFamily: "yarn",
        provider: async () => ({
          entries: [
            {
              fromNamespace: "official",
              toNamespace: "named",
              fromName: "a",
              toName: "Example",
              kind: "class"
            }
          ]
        })
      });

      expect(result).toMatchObject({
        payload: {
          source: "source_acquisition_mapping_index",
          status: "invalid_cache_key",
          minecraftVersion: "../outside",
          mappingFamily: "yarn"
        }
      });
      await expect(readFile(outsidePath, "utf-8")).rejects.toMatchObject({
        code: "ENOENT"
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects unsafe mapping family path segments before cache access", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mcpskill-mapping-family-"));

    try {
      const result = await executeMcpServerMappingIndexWorkItem({
        runtimeRoot: join(tempRoot, "runtime"),
        minecraftVersion: "1.21.1",
        mappingFamily: "../outside" as "yarn",
        provider: async () => ({ entries: [] })
      });

      expect(result).toMatchObject({
        payload: {
          source: "source_acquisition_mapping_index",
          status: "invalid_cache_key",
          minecraftVersion: "1.21.1",
          mappingFamily: "../outside"
        }
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rebuilds malformed cached JSONL with provider data", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mcpskill-mapping-corrupt-"));
    const runtimeRoot = join(tempRoot, "runtime");
    const indexPath = join(
      runtimeRoot,
      "source-acquisition",
      "mapping-indexes",
      "yarn",
      "1.21.1",
      "mappings.jsonl"
    );
    await mkdir(join(indexPath, ".."), { recursive: true });
    await writeFile(indexPath, "not-json\n");
    let providerCalls = 0;

    try {
      const result = await executeMcpServerMappingIndexWorkItem({
        runtimeRoot,
        minecraftVersion: "1.21.1",
        mappingFamily: "yarn",
        provider: async () => {
          providerCalls += 1;
          return {
            provenance: { source: "test-provider" },
            entries: [
              {
                fromNamespace: "official",
                toNamespace: "named",
                fromName: "a",
                toName: "net.minecraft.Example",
                kind: "class"
              }
            ]
          };
        }
      });

      expect(providerCalls).toBe(1);
      expect(result).toMatchObject({
        payload: {
          status: "ready",
          entryCount: 1,
          cache: {
            hit: false
          }
        }
      });
      expect(await readFile(indexPath, "utf-8")).toContain(
        "net.minecraft.Example"
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rebuilds cached JSONL with invalid mapping entries", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mcpskill-mapping-entry-"));
    const runtimeRoot = join(tempRoot, "runtime");
    const indexPath = join(
      runtimeRoot,
      "source-acquisition",
      "mapping-indexes",
      "yarn",
      "1.21.1",
      "mappings.jsonl"
    );
    await mkdir(join(indexPath, ".."), { recursive: true });
    await writeFile(
      indexPath,
      [
        JSON.stringify({
          recordKind: "mapping_index_header",
          minecraftVersion: "1.21.1",
          mappingFamily: "yarn"
        }),
        JSON.stringify({
          recordKind: "mapping_entry",
          kind: "bogus"
        }),
        ""
      ].join("\n")
    );
    let providerCalls = 0;

    try {
      const result = await executeMcpServerMappingIndexWorkItem({
        runtimeRoot,
        minecraftVersion: "1.21.1",
        mappingFamily: "yarn",
        provider: async () => {
          providerCalls += 1;
          return {
            entries: [
              {
                fromNamespace: "official",
                toNamespace: "named",
                fromName: "a",
                toName: "net.minecraft.Valid",
                kind: "class"
              }
            ]
          };
        }
      });

      expect(providerCalls).toBe(1);
      expect(result).toMatchObject({
        payload: {
          status: "ready",
          entryCount: 1,
          cache: {
            hit: false
          }
        }
      });
      expect(await readFile(indexPath, "utf-8")).toContain(
        "net.minecraft.Valid"
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports provider_required when no cache or provider exists", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mcpskill-mapping-provider-"));

    try {
      const result = await executeMcpServerMappingIndexWorkItem({
        runtimeRoot: join(tempRoot, "runtime"),
        minecraftVersion: "1.21.1",
        mappingFamily: "yarn"
      });

      expect(result).toMatchObject({
        payload: {
          source: "source_acquisition_mapping_index",
          status: "provider_required",
          minecraftVersion: "1.21.1",
          mappingFamily: "yarn",
          cache: {
            hit: false,
            scope: "private_runtime"
          }
        }
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("does not treat non-ENOENT cache read failures as cache misses", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mcpskill-mapping-eisdir-"));
    const runtimeRoot = join(tempRoot, "runtime");
    const indexPath = join(
      runtimeRoot,
      "source-acquisition",
      "mapping-indexes",
      "yarn",
      "1.21.1",
      "mappings.jsonl"
    );
    await mkdir(indexPath, { recursive: true });

    try {
      await expect(
        executeMcpServerMappingIndexWorkItem({
          runtimeRoot,
          minecraftVersion: "1.21.1",
          mappingFamily: "yarn",
          provider: async () => ({ entries: [] })
        })
      ).rejects.toMatchObject({
        code: "EISDIR"
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
