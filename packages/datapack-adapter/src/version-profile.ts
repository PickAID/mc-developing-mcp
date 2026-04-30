import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { discoverRoots } from "./discovery.js";
import type { DataKind } from "./types.js";

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
  knownDataKinds: DataKind[];
  semanticValidation: "not_available";
  migrationAnalysis: "not_available";
  notes: string[];
}

export interface DatapackVersionProfileOptions {
  minecraftVersion?: string;
  runtimeConfidence?: DatapackProfileConfidence;
}

interface KnownVersionProfile {
  minecraftVersion: string;
  packFormat: number;
  knownDataKinds: DataKind[];
}

const KNOWN_VERSION_PROFILES: KnownVersionProfile[] = [
  createKnownProfile("1.20.1", 15),
  createKnownProfile("1.20.6", 26),
  createKnownProfile("1.21.1", 34)
];

export async function resolveDatapackVersionProfile(
  root: string,
  options: DatapackVersionProfileOptions = {}
): Promise<DatapackVersionProfile> {
  const packFormat = await readSinglePackFormat(root);
  const versionFromPack = packFormat
    ? minecraftVersionFromPackFormat(packFormat)
    : undefined;
  const runtimeVersion = options.minecraftVersion;
  const minecraftVersion = runtimeVersion ?? versionFromPack;
  const knownProfile = minecraftVersion
    ? knownProfileForVersion(minecraftVersion)
    : undefined;
  const conflict = Boolean(
    runtimeVersion && versionFromPack && runtimeVersion !== versionFromPack
  );

  if (conflict) {
    return createProfile({
      source: "conflict",
      confidence: "unknown",
      minecraftVersion: runtimeVersion,
      packFormat,
      packFormatStatus: "conflict",
      knownProfile,
      note: `pack.mcmeta maps to ${versionFromPack}, runtime maps to ${runtimeVersion}`
    });
  }

  if (packFormat && versionFromPack && runtimeVersion) {
    return createProfile({
      source: "pack_mcmeta_and_runtime",
      confidence: strongestConfidence(options.runtimeConfidence, "medium"),
      minecraftVersion,
      packFormat,
      packFormatStatus: "known",
      knownProfile
    });
  }

  if (packFormat) {
    return createProfile({
      source: "pack_mcmeta",
      confidence: versionFromPack ? "medium" : "low",
      minecraftVersion,
      packFormat,
      packFormatStatus: versionFromPack ? "known" : "unknown",
      knownProfile
    });
  }

  if (runtimeVersion) {
    return createProfile({
      source: "runtime",
      confidence: options.runtimeConfidence ?? "medium",
      minecraftVersion: runtimeVersion,
      packFormat: knownProfile?.packFormat,
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
    knownDataKinds: input.knownProfile?.knownDataKinds ?? [],
    semanticValidation: "not_available",
    migrationAnalysis: "not_available",
    notes
  };
}

async function readSinglePackFormat(root: string): Promise<number | undefined> {
  const roots = await discoverRoots(root);
  const formats = new Set<number>();

  for (const contentRoot of roots) {
    const packFormat = await readPackFormat(join(contentRoot.absolutePath, "pack.mcmeta"));
    if (packFormat !== undefined) {
      formats.add(packFormat);
    }
  }

  return formats.size === 1 ? [...formats][0] : undefined;
}

async function readPackFormat(path: string): Promise<number | undefined> {
  try {
    const payload = JSON.parse(await readFile(path, "utf8")) as {
      pack?: { pack_format?: unknown };
    };
    return typeof payload.pack?.pack_format === "number"
      ? payload.pack.pack_format
      : undefined;
  } catch {
    return undefined;
  }
}

function knownProfileForVersion(
  minecraftVersion: string
): KnownVersionProfile | undefined {
  return KNOWN_VERSION_PROFILES.find(
    (profile) => profile.minecraftVersion === minecraftVersion
  );
}

function minecraftVersionFromPackFormat(packFormat: number): string | undefined {
  return KNOWN_VERSION_PROFILES.find(
    (profile) => profile.packFormat === packFormat
  )?.minecraftVersion;
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

function createKnownProfile(
  minecraftVersion: string,
  packFormat: number
): KnownVersionProfile {
  return {
    minecraftVersion,
    packFormat,
    knownDataKinds: [
      "advancements",
      "damage_type",
      "functions",
      "item_modifiers",
      "loot_tables",
      "predicates",
      "recipes",
      "registry",
      "structures",
      "tags",
      "worldgen"
    ]
  };
}
