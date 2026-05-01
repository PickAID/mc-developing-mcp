import { describe, expect, it } from "vitest";

import { analyzeDatapackVersionMigration } from "./migration-analysis.js";

describe("analyzeDatapackVersionMigration", () => {
  it("reports pack format changes between known Minecraft versions", () => {
    expect(
      analyzeDatapackVersionMigration({
        fromMinecraftVersion: "1.20.1",
        toMinecraftVersion: "1.21.1"
      })
    ).toMatchObject({
      status: "ready",
      direction: "upgrade",
      compatibility: "pack_format_changed",
      from: {
        minecraftVersion: "1.20.1",
        packFormatId: "15"
      },
      to: {
        minecraftVersion: "1.21.1",
        packFormatId: "48"
      },
      packFormatChange: {
        fromPackFormatId: "15",
        toPackFormatId: "48",
        numericDelta: 33
      },
      requiredActions: [
        {
          kind: "update_pack_format",
          summary: "Update pack.mcmeta pack.pack_format from 15 to 48."
        }
      ],
      notes: [
        "This is a pack-format migration summary, not full JSON schema rewriting."
      ]
    });
  });

  it("treats versions sharing the same minor-aware pack format as compatible", () => {
    expect(
      analyzeDatapackVersionMigration({
        fromMinecraftVersion: "1.21.9",
        toMinecraftVersion: "1.21.10"
      })
    ).toMatchObject({
      status: "ready",
      direction: "upgrade",
      compatibility: "same_pack_format",
      from: {
        packFormatId: "88.0"
      },
      to: {
        packFormatId: "88.0"
      },
      packFormatChange: {
        fromPackFormatId: "88.0",
        toPackFormatId: "88.0",
        numericDelta: 0
      },
      requiredActions: []
    });
  });

  it("keeps minor pack format deltas stable", () => {
    expect(
      analyzeDatapackVersionMigration({
        fromMinecraftVersion: "1.21.10",
        toMinecraftVersion: "1.21.11"
      })
    ).toMatchObject({
      status: "ready",
      compatibility: "pack_format_changed",
      packFormatChange: {
        fromPackFormatId: "88.0",
        toPackFormatId: "94.1",
        numericDelta: 6.1
      }
    });
  });

  it("reports unknown versions without guessing pack formats", () => {
    expect(
      analyzeDatapackVersionMigration({
        fromMinecraftVersion: "1.20.1",
        toMinecraftVersion: "unknown-version"
      })
    ).toMatchObject({
      status: "unknown_target_version",
      compatibility: "unknown",
      requiredActions: [],
      notes: [
        "Target Minecraft version unknown-version is not in the local datapack profile catalog."
      ]
    });
  });
});
