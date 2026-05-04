import type { AssetKind } from "./types.js";
import {
  KNOWN_RESOURCE_PACK_PROFILES,
  type KnownResourcePackProfile
} from "./resource-pack-profile-catalog.js";

export type ResourcePackMigrationStatus =
  | "ready"
  | "unknown_source_version"
  | "unknown_target_version";

export type ResourcePackMigrationDirection =
  | "upgrade"
  | "downgrade"
  | "same_version"
  | "unknown";

export type ResourcePackMigrationCompatibility =
  | "same_pack_format"
  | "pack_format_changed"
  | "unknown";

export type ResourcePackMigrationActionKind = "update_pack_format";
export type ResourcePackMigrationRiskSeverity = "low" | "medium" | "high";

export interface ResourcePackMigrationAction {
  kind: ResourcePackMigrationActionKind;
  summary: string;
}

export interface ResourcePackMigrationRiskHint {
  kind: AssetKind;
  severity: ResourcePackMigrationRiskSeverity;
  summary: string;
}

export interface ResourcePackMigrationVersionEvidence {
  minecraftVersion: string;
  packFormat: number;
  packFormatId: string;
  knownAssetKinds: AssetKind[];
}

export interface ResourcePackFormatChange {
  fromPackFormatId: string;
  toPackFormatId: string;
  numericDelta: number;
}

export interface ResourcePackVersionMigrationAnalysis {
  status: ResourcePackMigrationStatus;
  direction: ResourcePackMigrationDirection;
  compatibility: ResourcePackMigrationCompatibility;
  from?: ResourcePackMigrationVersionEvidence;
  to?: ResourcePackMigrationVersionEvidence;
  packFormatChange?: ResourcePackFormatChange;
  requiredActions: ResourcePackMigrationAction[];
  riskHints: ResourcePackMigrationRiskHint[];
  notes: string[];
}

const RISK_HINTS: Record<
  AssetKind,
  Omit<ResourcePackMigrationRiskHint, "kind">
> = {
  atlases: {
    severity: "medium",
    summary: "Review atlas JSON and referenced sprites against the target version."
  },
  blockstates: {
    severity: "medium",
    summary: "Review blockstate model references against the target version."
  },
  block_entity_renderer_asset: {
    severity: "medium",
    summary: "Review block-entity renderer assets against the target version."
  },
  connected_texture_metadata: {
    severity: "medium",
    summary: "Review connected-texture descriptors against the target version."
  },
  custom_model_format: {
    severity: "medium",
    summary: "Review custom model format assets against the target version."
  },
  equipment: {
    severity: "medium",
    summary: "Review equipment asset definitions against the target version."
  },
  font: {
    severity: "medium",
    summary: "Review font provider JSON against the target version."
  },
  items: {
    severity: "medium",
    summary: "Review item model definitions against the target version."
  },
  lang: {
    severity: "low",
    summary: "Review language keys for renamed or removed ids in the target version."
  },
  models: {
    severity: "medium",
    summary: "Review model parents, overrides, and texture references against the target version."
  },
  pack_metadata: {
    severity: "low",
    summary: "Review pack.mcmeta fields and pack format for the target version."
  },
  particles: {
    severity: "medium",
    summary: "Review particle texture references against the target version."
  },
  post_effect: {
    severity: "high",
    summary: "Review post effect and shader JSON against the target version."
  },
  shaders: {
    severity: "high",
    summary: "Review shader programs and pipeline assets against the target version."
  },
  sounds: {
    severity: "low",
    summary: "Review sound event references and sounds.json entries against the target version."
  },
  texts: {
    severity: "low",
    summary: "Review text assets for renamed or removed ids in the target version."
  },
  textures: {
    severity: "low",
    summary: "Review texture paths referenced by models, atlases, particles, and UI assets."
  },
  waypoint_style: {
    severity: "medium",
    summary: "Review waypoint style assets against the target version."
  },
  other: {
    severity: "low",
    summary: "Review uncategorized resource-pack assets manually."
  }
};

export function analyzeResourcePackVersionMigration(input: {
  fromMinecraftVersion: string;
  toMinecraftVersion: string;
  observedAssetKinds?: AssetKind[];
}): ResourcePackVersionMigrationAnalysis {
  const fromProfile = findKnownProfile(input.fromMinecraftVersion);
  const toProfile = findKnownProfile(input.toMinecraftVersion);

  if (!fromProfile) {
    return createUnknownAnalysis({
      status: "unknown_source_version",
      note: `Source Minecraft version ${input.fromMinecraftVersion} is not in the local resource-pack profile catalog.`
    });
  }

  if (!toProfile) {
    return createUnknownAnalysis({
      status: "unknown_target_version",
      from: toEvidence(fromProfile),
      note: `Target Minecraft version ${input.toMinecraftVersion} is not in the local resource-pack profile catalog.`
    });
  }

  const samePackFormat = fromProfile.packFormatId === toProfile.packFormatId;
  const packFormatChange = {
    fromPackFormatId: fromProfile.packFormatId,
    toPackFormatId: toProfile.packFormatId,
    numericDelta: calculateNumericPackFormatDelta(fromProfile, toProfile)
  };

  return {
    status: "ready",
    direction: resolveDirection(fromProfile, toProfile),
    compatibility: samePackFormat ? "same_pack_format" : "pack_format_changed",
    from: toEvidence(fromProfile),
    to: toEvidence(toProfile),
    packFormatChange,
    requiredActions: samePackFormat
      ? []
      : [
          {
            kind: "update_pack_format",
            summary: `Update pack.mcmeta pack.pack_format from ${fromProfile.packFormatId} to ${toProfile.packFormatId}.`
          }
        ],
    riskHints: samePackFormat
      ? []
      : createRiskHints(input.observedAssetKinds ?? []),
    notes: [
      "This is a resource-pack format migration summary, not full asset schema rewriting."
    ]
  };
}

function findKnownProfile(
  minecraftVersion: string
): KnownResourcePackProfile | undefined {
  return KNOWN_RESOURCE_PACK_PROFILES.find(
    (profile) => profile.minecraftVersion === minecraftVersion
  );
}

function toEvidence(
  profile: KnownResourcePackProfile
): ResourcePackMigrationVersionEvidence {
  return {
    minecraftVersion: profile.minecraftVersion,
    packFormat: profile.packFormat,
    packFormatId: profile.packFormatId,
    knownAssetKinds: profile.knownAssetKinds
  };
}

function createUnknownAnalysis(input: {
  status: Exclude<ResourcePackMigrationStatus, "ready">;
  from?: ResourcePackMigrationVersionEvidence;
  note: string;
}): ResourcePackVersionMigrationAnalysis {
  return {
    status: input.status,
    direction: "unknown",
    compatibility: "unknown",
    from: input.from,
    requiredActions: [],
    riskHints: [],
    notes: [input.note]
  };
}

function resolveDirection(
  fromProfile: KnownResourcePackProfile,
  toProfile: KnownResourcePackProfile
): ResourcePackMigrationDirection {
  const fromIndex = KNOWN_RESOURCE_PACK_PROFILES.indexOf(fromProfile);
  const toIndex = KNOWN_RESOURCE_PACK_PROFILES.indexOf(toProfile);

  if (fromIndex === toIndex) {
    return "same_version";
  }

  return fromIndex < toIndex ? "upgrade" : "downgrade";
}

function calculateNumericPackFormatDelta(
  fromProfile: KnownResourcePackProfile,
  toProfile: KnownResourcePackProfile
): number {
  const precision = Math.max(
    decimalPlaces(fromProfile.packFormatId),
    decimalPlaces(toProfile.packFormatId)
  );
  const multiplier = 10 ** precision;
  return (
    Math.round(toProfile.packFormat * multiplier) -
    Math.round(fromProfile.packFormat * multiplier)
  ) / multiplier;
}

function decimalPlaces(value: string): number {
  return value.includes(".") ? value.split(".")[1]?.length ?? 0 : 0;
}

function createRiskHints(kinds: AssetKind[]): ResourcePackMigrationRiskHint[] {
  const uniqueKinds = [...new Set(kinds)];
  return uniqueKinds.map((kind) => ({ kind, ...RISK_HINTS[kind] }));
}
