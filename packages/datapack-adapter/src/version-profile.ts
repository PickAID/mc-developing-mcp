import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { discoverRoots } from "./discovery.js";
import {
  formatInRange,
  packFormatToNumber,
  parseMinMaxFormats,
  parsePackFormatValue,
  parseSupportedFormats,
  samePackFormat,
  type DatapackPackFormatVersion,
  type DatapackSupportedFormats
} from "./pack-format.js";
import type { DataKind } from "./types.js";
import {
  KNOWN_VERSION_PROFILES,
  type KnownVersionProfile
} from "./version-profile-catalog.js";

export type {
  DatapackPackFormatVersion,
  DatapackSupportedFormats
} from "./pack-format.js";

export type DatapackVersionProfileSource =
  | "pack_mcmeta"
  | "runtime"
  | "pack_mcmeta_and_runtime"
  | "conflict"
  | "unknown";

export type DatapackVersionSupportLevel =
  | "known_profile"
  | "unknown_version"
  | "unresolved";

export type DatapackPackFormatStatus = "known" | "unknown" | "conflict";
export type DatapackProfileConfidence = "high" | "medium" | "low" | "unknown";

export interface DatapackVersionProfile {
  source: DatapackVersionProfileSource;
  confidence: DatapackProfileConfidence;
  supportLevel: DatapackVersionSupportLevel;
  packFormatStatus: DatapackPackFormatStatus;
  minecraftVersion?: string;
  packFormat?: number;
  packFormatId?: string;
  packFormatVersion?: DatapackPackFormatVersion;
  supportedFormats?: DatapackSupportedFormats;
  compatibleMinecraftVersions: string[];
  knownDataKinds: DataKind[];
  semanticValidation: "not_available";
  migrationAnalysis: "not_available";
  notes: string[];
}

export interface DatapackVersionProfileOptions {
  minecraftVersion?: string;
  runtimeConfidence?: DatapackProfileConfidence;
}

interface PackMetadataEvidence {
  packFormat?: number;
  packFormatId?: string;
  packFormatVersion?: DatapackPackFormatVersion;
  supportedFormats?: DatapackSupportedFormats;
}

export async function resolveDatapackVersionProfile(
  root: string,
  options: DatapackVersionProfileOptions = {}
): Promise<DatapackVersionProfile> {
  const packMetadata = await readPackMetadataEvidence(root);
  const versionFromPack = minecraftVersionFromPackMetadata(packMetadata);
  const runtimeVersion = options.minecraftVersion;
  const minecraftVersion = runtimeVersion ?? versionFromPack;
  const knownProfile = minecraftVersion
    ? knownProfileForVersion(minecraftVersion)
    : undefined;
  const metadataKnownProfile =
    knownProfile ?? knownProfileFromPackMetadata(packMetadata);
  const conflict = isConflictingEvidence(packMetadata, knownProfile);

  if (conflict) {
    return createProfile({
      source: "conflict",
      confidence: "unknown",
      minecraftVersion: runtimeVersion,
      packFormat: packMetadata.packFormat,
      packFormatId: packMetadata.packFormatId,
      packFormatVersion: packMetadata.packFormatVersion,
      supportedFormats: packMetadata.supportedFormats,
      packFormatStatus: "conflict",
      knownProfile: metadataKnownProfile,
      note: `pack.mcmeta data format is incompatible with runtime ${runtimeVersion}`
    });
  }

  if (hasPackMetadataEvidence(packMetadata) && runtimeVersion) {
    return createProfile({
      source: "pack_mcmeta_and_runtime",
      confidence: strongestConfidence(options.runtimeConfidence, "medium"),
      minecraftVersion,
      packFormat: packMetadata.packFormat ?? knownProfile?.packFormat,
      packFormatId: packMetadata.packFormatId ?? knownProfile?.packFormatId,
      packFormatVersion:
        packMetadata.packFormatVersion ?? knownProfile?.packFormatVersion,
      supportedFormats: packMetadata.supportedFormats,
      packFormatStatus: packMetadataIsKnown(packMetadata) || knownProfile
        ? "known"
        : "unknown",
      knownProfile: metadataKnownProfile
    });
  }

  if (hasPackMetadataEvidence(packMetadata)) {
    return createProfile({
      source: "pack_mcmeta",
      confidence: versionFromPack ? "medium" : "low",
      minecraftVersion,
      packFormat: packMetadata.packFormat,
      packFormatId: packMetadata.packFormatId,
      packFormatVersion: packMetadata.packFormatVersion,
      supportedFormats: packMetadata.supportedFormats,
      packFormatStatus: versionFromPack ? "known" : "unknown",
      knownProfile: metadataKnownProfile
    });
  }

  if (runtimeVersion) {
    return createProfile({
      source: "runtime",
      confidence: options.runtimeConfidence ?? "medium",
      minecraftVersion: runtimeVersion,
      packFormat: knownProfile?.packFormat,
      packFormatId: knownProfile?.packFormatId,
      packFormatVersion: knownProfile?.packFormatVersion,
      packFormatStatus: knownProfile ? "known" : "unknown",
      knownProfile
    });
  }

  return createProfile({
    source: "unknown",
    confidence: "unknown",
    packFormatStatus: "unknown",
    knownProfile: undefined
  });
}

function createProfile(input: {
  source: DatapackVersionProfileSource;
  confidence: DatapackProfileConfidence;
  minecraftVersion?: string;
  packFormat?: number;
  packFormatId?: string;
  packFormatVersion?: DatapackPackFormatVersion;
  supportedFormats?: DatapackSupportedFormats;
  packFormatStatus: DatapackPackFormatStatus;
  knownProfile?: KnownVersionProfile;
  note?: string;
}): DatapackVersionProfile {
  const notes = [
    "profile describes version evidence and broad data kind support only",
    "versioned JSON schema validation is not implemented yet",
    "version-to-version datapack migration analysis is not implemented yet",
    ...(input.note ? [input.note] : [])
  ];

  return {
    source: input.source,
    confidence: input.confidence,
    supportLevel: supportLevel(input.minecraftVersion, input.knownProfile),
    packFormatStatus: input.packFormatStatus,
    minecraftVersion: input.minecraftVersion,
    packFormat: input.packFormat ?? input.knownProfile?.packFormat,
    packFormatId: input.packFormatId ?? input.knownProfile?.packFormatId,
    packFormatVersion:
      input.packFormatVersion ?? input.knownProfile?.packFormatVersion,
    supportedFormats: input.supportedFormats,
    compatibleMinecraftVersions: compatibleMinecraftVersions(input.supportedFormats),
    knownDataKinds: input.knownProfile?.knownDataKinds ?? [],
    semanticValidation: "not_available",
    migrationAnalysis: "not_available",
    notes
  };
}

async function readPackMetadataEvidence(root: string): Promise<PackMetadataEvidence> {
  const roots = await discoverRoots(root);
  const formats = new Map<string, DatapackPackFormatVersion>();
  const ranges = new Map<string, DatapackSupportedFormats>();

  for (const contentRoot of roots) {
    const metadata = await readPackMetadata(join(contentRoot.absolutePath, "pack.mcmeta"));
    if (metadata.packFormatVersion !== undefined) {
      formats.set(metadata.packFormatVersion.id, metadata.packFormatVersion);
    }
    if (metadata.supportedFormats !== undefined) {
      ranges.set(serializeRange(metadata.supportedFormats), metadata.supportedFormats);
    }
  }

  const packFormatVersion =
    formats.size === 1 ? [...formats.values()][0] : undefined;

  return {
    packFormat: packFormatToNumber(packFormatVersion),
    packFormatId: packFormatVersion?.id,
    packFormatVersion,
    supportedFormats: ranges.size === 1 ? [...ranges.values()][0] : undefined
  };
}

async function readPackMetadata(path: string): Promise<PackMetadataEvidence> {
  try {
    const payload = JSON.parse(await readFile(path, "utf8")) as {
      pack?: {
        pack_format?: unknown;
        supported_formats?: unknown;
        min_format?: unknown;
        max_format?: unknown;
      };
    };
    const pack = payload.pack;
    const supportedFormats = parseMinMaxFormats({
      minFormat: pack?.min_format,
      maxFormat: pack?.max_format
    }) ?? parseSupportedFormats(pack?.supported_formats);
    const packFormatVersion =
      parsePackFormatValue(pack?.pack_format) ?? supportedFormats?.minFormat;

    return {
      packFormat: packFormatToNumber(packFormatVersion),
      packFormatId: packFormatVersion?.id,
      packFormatVersion,
      supportedFormats
    };
  } catch {
    return {};
  }
}

function knownProfileForVersion(
  minecraftVersion: string
): KnownVersionProfile | undefined {
  return KNOWN_VERSION_PROFILES.find(
    (profile) => profile.minecraftVersion === minecraftVersion
  );
}

function knownProfileFromPackMetadata(
  metadata: PackMetadataEvidence
): KnownVersionProfile | undefined {
  if (metadata.packFormatVersion) {
    return [...KNOWN_VERSION_PROFILES]
      .reverse()
      .find((profile) =>
        samePackFormat(profile.packFormatVersion, metadata.packFormatVersion!)
      );
  }
  if (metadata.supportedFormats) {
    return [...KNOWN_VERSION_PROFILES]
      .reverse()
      .find((profile) =>
        formatInRange(profile.packFormatVersion, metadata.supportedFormats!)
      );
  }
  return undefined;
}

function minecraftVersionFromPackMetadata(
  metadata: PackMetadataEvidence
): string | undefined {
  return knownProfileFromPackMetadata(metadata)?.minecraftVersion;
}

function isConflictingEvidence(
  metadata: PackMetadataEvidence,
  knownProfile: KnownVersionProfile | undefined
): boolean {
  if (!knownProfile || !hasPackMetadataEvidence(metadata)) {
    return false;
  }
  if (metadata.supportedFormats) {
    return !formatInRange(knownProfile.packFormatVersion, metadata.supportedFormats);
  }
  return Boolean(
    metadata.packFormatVersion &&
      !samePackFormat(knownProfile.packFormatVersion, metadata.packFormatVersion)
  );
}

function hasPackMetadataEvidence(metadata: PackMetadataEvidence): boolean {
  return Boolean(metadata.packFormatVersion || metadata.supportedFormats);
}

function packMetadataIsKnown(metadata: PackMetadataEvidence): boolean {
  return knownProfileFromPackMetadata(metadata) !== undefined;
}

function compatibleMinecraftVersions(
  supportedFormats: DatapackSupportedFormats | undefined
): string[] {
  if (!supportedFormats) {
    return [];
  }
  return KNOWN_VERSION_PROFILES
    .filter((profile) => formatInRange(profile.packFormatVersion, supportedFormats))
    .map((profile) => profile.minecraftVersion);
}

function serializeRange(range: DatapackSupportedFormats): string {
  return `${range.minFormat.id}:${range.maxFormat.id}`;
}

function supportLevel(
  minecraftVersion: string | undefined,
  knownProfile: KnownVersionProfile | undefined
): DatapackVersionSupportLevel {
  if (!minecraftVersion) {
    return "unresolved";
  }
  return knownProfile ? "known_profile" : "unknown_version";
}

function strongestConfidence(
  left: DatapackProfileConfidence | undefined,
  right: DatapackProfileConfidence
): DatapackProfileConfidence {
  return scoreConfidence(left ?? "unknown") >= scoreConfidence(right)
    ? (left ?? "unknown")
    : right;
}

function scoreConfidence(confidence: DatapackProfileConfidence): number {
  switch (confidence) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}
