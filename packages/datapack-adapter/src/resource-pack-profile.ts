import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { discoverRoots } from "./discovery.js";
import {
  packFormatToNumber,
  parsePackFormatValue,
  samePackFormat,
  type DatapackPackFormatVersion
} from "./pack-format.js";
import {
  KNOWN_RESOURCE_PACK_PROFILES,
  type KnownResourcePackProfile
} from "./resource-pack-profile-catalog.js";
import type { AssetKind } from "./types.js";

export type ResourcePackVersionProfileSource =
  | "pack_mcmeta"
  | "assets_runtime"
  | "pack_mcmeta_and_assets_runtime"
  | "conflict"
  | "unknown";

export type ResourcePackVersionSupportLevel =
  | "known_profile"
  | "unknown_version"
  | "format_catalog_not_available"
  | "unresolved";

export type ResourcePackFormatStatus =
  | "known"
  | "metadata_only"
  | "missing_metadata"
  | "conflict"
  | "unknown";

export type ResourcePackProfileConfidence =
  | "high"
  | "medium"
  | "low"
  | "unknown";

export interface ResourcePackVersionProfile {
  source: ResourcePackVersionProfileSource;
  confidence: ResourcePackProfileConfidence;
  supportLevel: ResourcePackVersionSupportLevel;
  packFormatStatus: ResourcePackFormatStatus;
  packFormat?: number;
  packFormatId?: string;
  packFormatVersion?: DatapackPackFormatVersion;
  minecraftVersion?: string;
  compatibleMinecraftVersions: string[];
  knownAssetKinds: AssetKind[];
  assetKinds: AssetKind[];
  semanticValidation: "not_available";
  migrationAnalysis: "not_available";
  notes: string[];
}

export interface ResourcePackVersionProfileOptions {
  assetKinds?: AssetKind[];
  minecraftVersion?: string;
  runtimeConfidence?: ResourcePackProfileConfidence;
}

interface ResourcePackMetadataEvidence {
  hasAssets: boolean;
  hasMetadata: boolean;
  conflict: boolean;
  packFormatVersion?: DatapackPackFormatVersion;
}

export async function resolveResourcePackVersionProfile(
  root: string,
  options: ResourcePackVersionProfileOptions = {}
): Promise<ResourcePackVersionProfile> {
  const evidence = await readResourcePackMetadataEvidence(root);
  const assetKinds = [...new Set(options.assetKinds ?? [])].sort();
  const knownProfile = options.minecraftVersion
    ? knownProfileForVersion(options.minecraftVersion)
    : undefined;
  const metadataKnownProfile =
    knownProfile ?? knownProfileFromPackFormat(evidence.packFormatVersion);

  if (evidence.conflict) {
    return createProfile({
      source: "conflict",
      confidence: "unknown",
      supportLevel: "unresolved",
      packFormatStatus: "conflict",
      knownProfile: metadataKnownProfile,
      assetKinds,
      note: "multiple resource pack formats were found in pack.mcmeta files"
    });
  }

  if (isConflictingEvidence(evidence.packFormatVersion, knownProfile)) {
    return createProfile({
      source: "conflict",
      confidence: "unknown",
      supportLevel: "known_profile",
      packFormatStatus: "conflict",
      minecraftVersion: options.minecraftVersion,
      packFormatVersion: evidence.packFormatVersion,
      knownProfile,
      assetKinds,
      note: `pack.mcmeta resource format is incompatible with runtime ${options.minecraftVersion}`
    });
  }

  if (evidence.packFormatVersion && evidence.hasAssets) {
    return createProfile({
      source: "pack_mcmeta_and_assets_runtime",
      confidence: "medium",
      supportLevel: metadataKnownProfile ? "known_profile" : "unresolved",
      packFormatStatus: metadataKnownProfile ? "known" : "metadata_only",
      minecraftVersion:
        options.minecraftVersion ?? metadataKnownProfile?.minecraftVersion,
      knownProfile: metadataKnownProfile,
      packFormatVersion: evidence.packFormatVersion,
      assetKinds
    });
  }

  if (evidence.packFormatVersion) {
    return createProfile({
      source: "pack_mcmeta",
      confidence: "low",
      supportLevel: metadataKnownProfile ? "known_profile" : "unresolved",
      packFormatStatus: metadataKnownProfile ? "known" : "metadata_only",
      minecraftVersion: metadataKnownProfile?.minecraftVersion,
      knownProfile: metadataKnownProfile,
      packFormatVersion: evidence.packFormatVersion,
      assetKinds
    });
  }

  if (knownProfile) {
    return createProfile({
      source: evidence.hasAssets ? "assets_runtime" : "unknown",
      confidence: options.runtimeConfidence ?? "medium",
      supportLevel: "known_profile",
      packFormatStatus: "known",
      minecraftVersion: options.minecraftVersion,
      knownProfile,
      assetKinds
    });
  }

  if (evidence.hasAssets || assetKinds.length > 0) {
    return createProfile({
      source: "assets_runtime",
      confidence: "low",
      supportLevel: options.minecraftVersion ? "unknown_version" : "unresolved",
      packFormatStatus: evidence.hasMetadata ? "unknown" : "missing_metadata",
      minecraftVersion: options.minecraftVersion,
      assetKinds
    });
  }

  return createProfile({
    source: "unknown",
    confidence: "unknown",
    supportLevel: "unresolved",
    packFormatStatus: "unknown",
    assetKinds
  });
}

async function readResourcePackMetadataEvidence(
  root: string
): Promise<ResourcePackMetadataEvidence> {
  const roots = (await discoverRoots(root)).filter((entry) => entry.hasAssets);
  const formats = new Map<string, DatapackPackFormatVersion>();
  let hasMetadata = false;

  for (const contentRoot of roots) {
    const metadata = await readPackMetadata(join(contentRoot.absolutePath, "pack.mcmeta"));
    hasMetadata = hasMetadata || metadata.hasMetadata;
    if (metadata.packFormatVersion) {
      formats.set(metadata.packFormatVersion.id, metadata.packFormatVersion);
    }
  }

  return {
    hasAssets: roots.length > 0,
    hasMetadata,
    conflict: formats.size > 1,
    packFormatVersion: formats.size === 1 ? [...formats.values()][0] : undefined
  };
}

async function readPackMetadata(path: string): Promise<{
  hasMetadata: boolean;
  packFormatVersion?: DatapackPackFormatVersion;
}> {
  try {
    const payload = JSON.parse(await readFile(path, "utf8")) as {
      pack?: {
        pack_format?: unknown;
      };
    };
    return {
      hasMetadata: true,
      packFormatVersion: parsePackFormatValue(payload.pack?.pack_format)
    };
  } catch {
    return { hasMetadata: false };
  }
}

function createProfile(input: {
  source: ResourcePackVersionProfileSource;
  confidence: ResourcePackProfileConfidence;
  supportLevel: ResourcePackVersionSupportLevel;
  packFormatStatus: ResourcePackFormatStatus;
  minecraftVersion?: string;
  packFormatVersion?: DatapackPackFormatVersion;
  knownProfile?: KnownResourcePackProfile;
  assetKinds: AssetKind[];
  note?: string;
}): ResourcePackVersionProfile {
  return {
    source: input.source,
    confidence: input.confidence,
    supportLevel: input.supportLevel,
    packFormatStatus: input.packFormatStatus,
    packFormat: packFormatToNumber(input.packFormatVersion) ??
      input.knownProfile?.packFormat,
    packFormatId: input.packFormatVersion?.id ?? input.knownProfile?.packFormatId,
    packFormatVersion:
      input.packFormatVersion ?? input.knownProfile?.packFormatVersion,
    minecraftVersion: input.minecraftVersion,
    compatibleMinecraftVersions: [],
    knownAssetKinds: input.knownProfile?.knownAssetKinds ?? [],
    assetKinds: input.assetKinds,
    semanticValidation: "not_available",
    migrationAnalysis: "not_available",
    notes: [
      "profile describes resource-pack metadata and observed asset kinds only",
      "deep per-asset validation is outside this compact profile",
      "resource-pack migration evidence is reported separately when source and target versions are known",
      ...(input.note ? [input.note] : [])
    ]
  };
}

function knownProfileForVersion(
  minecraftVersion: string
): KnownResourcePackProfile | undefined {
  return KNOWN_RESOURCE_PACK_PROFILES.find(
    (profile) => profile.minecraftVersion === minecraftVersion
  );
}

function knownProfileFromPackFormat(
  packFormatVersion: DatapackPackFormatVersion | undefined
): KnownResourcePackProfile | undefined {
  if (!packFormatVersion) {
    return undefined;
  }
  return [...KNOWN_RESOURCE_PACK_PROFILES]
    .reverse()
    .find((profile) =>
      samePackFormat(profile.packFormatVersion, packFormatVersion)
    );
}

function isConflictingEvidence(
  packFormatVersion: DatapackPackFormatVersion | undefined,
  knownProfile: KnownResourcePackProfile | undefined
): boolean {
  return Boolean(
    packFormatVersion &&
      knownProfile &&
      !samePackFormat(packFormatVersion, knownProfile.packFormatVersion)
  );
}
