import { describe, expect, it } from "vitest";

import { analyzeResourcePackVersionMigration } from "./resource-pack-migration-analysis.js";

describe("analyzeResourcePackVersionMigration", () => {
  it("reports resource pack format changes between known Minecraft versions", () => {
    expect(
      analyzeResourcePackVersionMigration({
        fromMinecraftVersion: "1.20.1",
        toMinecraftVersion: "1.21.1",
        observedAssetKinds: ["models", "textures", "lang"]
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
        packFormatId: "34"
      },
      packFormatChange: {
        fromPackFormatId: "15",
        toPackFormatId: "34",
        numericDelta: 19
      },
      requiredActions: [
        {
          kind: "update_pack_format",
          summary: "Update pack.mcmeta pack.pack_format from 15 to 34."
        }
      ],
      riskHints: [
        {
          kind: "models",
          severity: "medium"
        },
        {
          kind: "textures",
          severity: "low"
        },
        {
          kind: "lang",
          severity: "low"
        }
      ]
    });
  });

  it("keeps minor resource pack format deltas stable", () => {
    expect(
      analyzeResourcePackVersionMigration({
        fromMinecraftVersion: "1.21.11",
        toMinecraftVersion: "26.1.2"
      })
    ).toMatchObject({
      status: "ready",
      compatibility: "pack_format_changed",
      packFormatChange: {
        fromPackFormatId: "75.0",
        toPackFormatId: "84.0",
        numericDelta: 9
      }
    });
  });

  it("reports unknown versions without guessing resource pack formats", () => {
    expect(
      analyzeResourcePackVersionMigration({
        fromMinecraftVersion: "1.20.1",
        toMinecraftVersion: "unknown-version"
      })
    ).toMatchObject({
      status: "unknown_target_version",
      compatibility: "unknown",
      requiredActions: [],
      riskHints: []
    });
  });
});
