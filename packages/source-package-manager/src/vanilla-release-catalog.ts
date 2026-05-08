import type { SourcePackageCoordinate } from "minecraft-developing-mcp-shared-types";

import {
  buildVanillaAssetsCoordinate,
  buildVanillaDataPackCoordinate,
  buildVanillaResourcePackCoordinate,
  buildVanillaSourcePackCoordinate
} from "./vanilla.js";

export interface MinecraftReleaseCatalog {
  schemaVersion: 1;
  latest?: {
    release?: string;
    snapshot?: string;
  };
  releaseCount?: number;
  releases: MinecraftReleaseCatalogEntry[];
}

export interface MinecraftReleaseCatalogEntry {
  id: string;
  releaseTime?: string;
  metadataUrl?: string;
  sha1?: string;
  complianceLevel?: number;
}

export type VanillaGeneratedTargetKind =
  | "source-pack"
  | "datapack"
  | "resource-pack"
  | "assets";

export interface VanillaGeneratedTarget {
  kind: VanillaGeneratedTargetKind;
  sourcePackage: SourcePackageCoordinate;
  requiresUserConsent: true;
  distributionPolicy: "local-generation-only";
  summary: string;
}

export interface VanillaReleaseGenerationPlan {
  minecraftVersion: string;
  release: MinecraftReleaseCatalogEntry;
  targets: VanillaGeneratedTarget[];
}

export function planVanillaReleaseGenerationFromCatalog(input: {
  catalog: MinecraftReleaseCatalog;
  minecraftVersion: string;
  include?: VanillaGeneratedTargetKind[];
}): VanillaReleaseGenerationPlan {
  assertReleaseCatalog(input.catalog);
  const release = input.catalog.releases.find(
    (entry) => entry.id === input.minecraftVersion
  );

  if (!release) {
    throw new Error(
      `minecraftVersion ${input.minecraftVersion} is not in the official release catalog`
    );
  }

  const include = input.include ?? [
    "source-pack",
    "datapack",
    "resource-pack",
    "assets"
  ];

  return {
    minecraftVersion: release.id,
    release,
    targets: include.map((kind) => buildVanillaGeneratedTarget(kind, release.id))
  };
}

export function planAllVanillaReleaseGenerationTargets(input: {
  catalog: MinecraftReleaseCatalog;
  include?: VanillaGeneratedTargetKind[];
}): VanillaReleaseGenerationPlan[] {
  assertReleaseCatalog(input.catalog);

  return input.catalog.releases.map((release) =>
    planVanillaReleaseGenerationFromCatalog({
      catalog: input.catalog,
      minecraftVersion: release.id,
      include: input.include
    })
  );
}

function buildVanillaGeneratedTarget(
  kind: VanillaGeneratedTargetKind,
  minecraftVersion: string
): VanillaGeneratedTarget {
  return {
    kind,
    sourcePackage: buildCoordinate(kind, minecraftVersion),
    requiresUserConsent: true,
    distributionPolicy: "local-generation-only",
    summary: `Generate Minecraft ${minecraftVersion} ${kind} locally from official metadata after user consent.`
  };
}

function buildCoordinate(
  kind: VanillaGeneratedTargetKind,
  minecraftVersion: string
): SourcePackageCoordinate {
  if (kind === "source-pack") {
    return buildVanillaSourcePackCoordinate(minecraftVersion);
  }

  if (kind === "datapack") {
    return buildVanillaDataPackCoordinate(minecraftVersion);
  }

  if (kind === "resource-pack") {
    return buildVanillaResourcePackCoordinate(minecraftVersion);
  }

  return buildVanillaAssetsCoordinate(minecraftVersion);
}

function assertReleaseCatalog(catalog: MinecraftReleaseCatalog): void {
  if (catalog.schemaVersion !== 1) {
    throw new Error("unsupported Minecraft release catalog schemaVersion");
  }

  if (!Array.isArray(catalog.releases) || catalog.releases.length === 0) {
    throw new Error("Minecraft release catalog must contain releases");
  }

  const invalidEntry = catalog.releases.find(
    (entry) => !entry.id || typeof entry.id !== "string"
  );

  if (invalidEntry) {
    throw new Error("Minecraft release catalog contains a release without id");
  }
}
