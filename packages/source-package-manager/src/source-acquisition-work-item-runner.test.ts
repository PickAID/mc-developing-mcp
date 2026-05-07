import { describe, expect, it } from "vitest";

import {
  runSourceAcquisitionWorkItems,
  type SourceAcquisitionWorkItemRunnerHandlers
} from "./source-acquisition-work-item-runner.js";
import type { SourceAcquisitionWorkItem } from "./source-acquisition-hand-off.js";

describe("runSourceAcquisitionWorkItems", () => {
  it("dispatches jar, vanilla, remote, and mapping work items to injected handlers", async () => {
    const calls: string[] = [];
    const result = await runSourceAcquisitionWorkItems({
      workItems: workItemsFixture(),
      handlers: handlersFixture(calls)
    });

    expect(calls).toEqual([
      "jar:/packs/libs/example.jar",
      "vanilla:1.21.1",
      "remote:modrinth",
      "mapping:yarn:1.21.1"
    ]);
    expect(result).toMatchObject({
      status: "completed",
      completedCount: 4,
      skippedCount: 0,
      failedCount: 0
    });
    expect(result.executions.map((execution) => execution.status)).toEqual([
      "completed",
      "completed",
      "completed",
      "completed"
    ]);
  });

  it("records skipped work items when a handler is unavailable", async () => {
    const result = await runSourceAcquisitionWorkItems({
      workItems: workItemsFixture(),
      handlers: {
        remoteMetadata: async () => ({ summary: "resolved remote metadata" })
      }
    });

    expect(result.status).toBe("partial");
    expect(result.completedCount).toBe(1);
    expect(result.skippedCount).toBe(3);
    expect(result.executions).toEqual([
      expect.objectContaining({
        kind: "jar_index",
        status: "skipped",
        reason: "handler_unavailable"
      }),
      expect.objectContaining({
        kind: "vanilla_generation",
        status: "skipped",
        reason: "handler_unavailable"
      }),
      expect.objectContaining({
        kind: "remote_metadata",
        status: "completed"
      }),
      expect.objectContaining({
        kind: "mapping_index",
        status: "skipped",
        reason: "handler_unavailable"
      })
    ]);
  });

  it("records handler failures without stopping later work items", async () => {
    const result = await runSourceAcquisitionWorkItems({
      workItems: workItemsFixture(),
      handlers: {
        jarIndex: async () => {
          throw new Error("jar unreadable");
        },
        vanillaGeneration: async () => ({ summary: "generated vanilla" }),
        remoteMetadata: async () => ({ summary: "resolved remote metadata" })
      }
    });

    expect(result).toMatchObject({
      status: "partial",
      completedCount: 2,
      failedCount: 1
    });
    expect(result.executions[0]).toMatchObject({
      kind: "jar_index",
      status: "failed",
      error: "jar unreadable"
    });
  });
});

function workItemsFixture(): SourceAcquisitionWorkItem[] {
  return [
    {
      kind: "jar_index",
      sourceArchive: "/packs/libs/example.jar",
      cacheScope: "private_runtime"
    },
    {
      kind: "vanilla_generation",
      minecraftVersion: "1.21.1",
      cacheScope: "private_runtime"
    },
    {
      kind: "remote_metadata",
      source: "modrinth",
      cacheScope: "metadata"
    },
    {
      kind: "mapping_index",
      minecraftVersion: "1.21.1",
      mappingFamily: "yarn",
      cacheScope: "private_runtime"
    }
  ];
}

function handlersFixture(
  calls: string[]
): Required<SourceAcquisitionWorkItemRunnerHandlers> {
  return {
    async jarIndex(item) {
      calls.push(`jar:${item.sourceArchive}`);
      return { summary: "indexed jar", payload: { sourceArchive: item.sourceArchive } };
    },
    async vanillaGeneration(item) {
      calls.push(`vanilla:${item.minecraftVersion}`);
      return { summary: "generated vanilla" };
    },
    async remoteMetadata(item) {
      calls.push(`remote:${item.source}`);
      return { summary: "resolved remote metadata" };
    },
    async mappingIndex(item) {
      calls.push(`mapping:${item.mappingFamily}:${item.minecraftVersion}`);
      return { summary: "indexed mappings" };
    }
  };
}
