import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { MinecraftReleaseCatalog } from "./vanilla-release-catalog.js";
import {
  planAllVanillaReleaseGenerationTargets,
  planVanillaReleaseGenerationFromCatalog
} from "./vanilla-release-catalog.js";

describe("vanilla release catalog generation planner", () => {
  it("maps a release catalog entry to consent-gated local generation targets", () => {
    const plan = planVanillaReleaseGenerationFromCatalog({
      catalog: createCatalog(["1.20.1", "26.1.2"]),
      minecraftVersion: "26.1.2"
    });

    expect(plan.minecraftVersion).toBe("26.1.2");
    expect(plan.targets.map((target) => target.sourcePackage)).toEqual([
      {
        packageId: "minecraft-26.1.2-source-pack-named",
        namespace: "minecraft",
        minecraftVersion: "26.1.2",
        artifactType: "source-pack",
        variant: "named"
      },
      {
        packageId: "minecraft-26.1.2-vanilla-datapack-official",
        namespace: "minecraft",
        minecraftVersion: "26.1.2",
        artifactType: "datapack",
        variant: "official"
      },
      {
        packageId: "minecraft-26.1.2-vanilla-resource-pack-official",
        namespace: "minecraft",
        minecraftVersion: "26.1.2",
        artifactType: "resource-pack",
        variant: "official"
      },
      {
        packageId: "minecraft-26.1.2-vanilla-assets-official",
        namespace: "minecraft",
        minecraftVersion: "26.1.2",
        artifactType: "assets",
        variant: "official"
      }
    ]);
    expect(plan.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requiresUserConsent: true,
          distributionPolicy: "local-generation-only"
        })
      ])
    );
  });

  it("allows callers to request a small target subset", () => {
    const plan = planVanillaReleaseGenerationFromCatalog({
      catalog: createCatalog(["1.20.1"]),
      minecraftVersion: "1.20.1",
      include: ["datapack", "resource-pack"]
    });

    expect(plan.targets.map((target) => target.kind)).toEqual([
      "datapack",
      "resource-pack"
    ]);
  });

  it("rejects versions outside the official release catalog", () => {
    expect(() =>
      planVanillaReleaseGenerationFromCatalog({
        catalog: createCatalog(["1.20.1"]),
        minecraftVersion: "missing-version"
      })
    ).toThrow("missing-version is not in the official release catalog");
  });

  it("maps every public mdm-sources release catalog entry without hand-written packages", async () => {
    const catalog = await readSiblingMdmSourcesCatalog();
    if (!catalog) {
      return;
    }

    const plans = planAllVanillaReleaseGenerationTargets({
      catalog,
      include: ["datapack", "resource-pack", "assets"]
    });

    expect(plans).toHaveLength(catalog.releaseCount);
    expect(plans.at(0)?.minecraftVersion).toBe(catalog.latest?.release);
    expect(plans.at(-1)?.minecraftVersion).toBe("1.0");
    expect(plans.every((plan) => plan.targets.length === 3)).toBe(true);
    expect(
      plans.flatMap((plan) =>
        plan.targets.map((target) => target.sourcePackage.packageId)
      )
    ).toEqual(
      expect.arrayContaining([
        "minecraft-1.18.2-vanilla-datapack-official",
        "minecraft-1.20.1-vanilla-resource-pack-official",
        "minecraft-26.1.2-vanilla-assets-official"
      ])
    );
  });
});

function createCatalog(ids: string[]): MinecraftReleaseCatalog {
  return {
    schemaVersion: 1,
    latest: {
      release: ids.at(-1)
    },
    releaseCount: ids.length,
    releases: ids.map((id) => ({ id }))
  };
}

async function readSiblingMdmSourcesCatalog(): Promise<
  MinecraftReleaseCatalog | undefined
> {
  const path = resolve(
    process.cwd(),
    "..",
    "mdm-sources",
    "packages",
    "minecraft",
    "releases",
    "catalog",
    "payload",
    "release-catalog.json"
  );

  try {
    return JSON.parse(await readFile(path, "utf-8")) as MinecraftReleaseCatalog;
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return undefined;
    }

    throw error;
  }
}
