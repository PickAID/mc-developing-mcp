import type { DataKind } from "./types.js";
import { KNOWN_VERSION_PROFILES, type KnownVersionProfile } from "./version-profile-catalog.js";

export type DatapackMigrationStatus =
  | "ready"
  | "unknown_source_version"
  | "unknown_target_version";

export type DatapackMigrationDirection =
  | "upgrade"
  | "downgrade"
  | "same_version"
  | "unknown";

export type DatapackMigrationCompatibility =
  | "same_pack_format"
  | "pack_format_changed"
  | "unknown";

export type DatapackMigrationActionKind = "update_pack_format";
export type DatapackMigrationRiskSeverity = "low" | "medium" | "high";

export interface DatapackMigrationAction {
  kind: DatapackMigrationActionKind;
  summary: string;
}

export interface DatapackMigrationRiskHint {
  kind: DataKind;
  severity: DatapackMigrationRiskSeverity;
  summary: string;
}

export interface DatapackMigrationVersionEvidence {
  minecraftVersion: string;
  packFormat: number;
  packFormatId: string;
  knownDataKinds: DataKind[];
}

export interface DatapackPackFormatChange {
  fromPackFormatId: string;
  toPackFormatId: string;
  numericDelta: number;
}

export interface DatapackVersionMigrationAnalysis {
  status: DatapackMigrationStatus;
  direction: DatapackMigrationDirection;
  compatibility: DatapackMigrationCompatibility;
  from?: DatapackMigrationVersionEvidence;
  to?: DatapackMigrationVersionEvidence;
  packFormatChange?: DatapackPackFormatChange;
  requiredActions: DatapackMigrationAction[];
  riskHints: DatapackMigrationRiskHint[];
  notes: string[];
}

const RISK_HINTS: Record<
  DataKind,
  Omit<DatapackMigrationRiskHint, "kind">
> = {
  advancements: {
    severity: "medium",
    summary: "Review advancement criteria, rewards, and predicate references against the target version."
  },
  damage_type: {
    severity: "high",
    summary: "Review custom damage type registry JSON against the target version."
  },
  functions: {
    severity: "low",
    summary: "Review function commands for renamed or removed commands in the target version."
  },
  item_modifiers: {
    severity: "medium",
    summary: "Review item modifier functions and predicates against the target version."
  },
  loot_tables: {
    severity: "medium",
    summary: "Review loot table conditions, functions, and item references against the target version."
  },
  predicates: {
    severity: "medium",
    summary: "Review predicate JSON and referenced conditions against the target version."
  },
  recipes: {
    severity: "medium",
    summary: "Review recipe JSON and ingredient/item references against the target version."
  },
  registry: {
    severity: "high",
    summary: "Review custom registry JSON against the target version."
  },
  structures: {
    severity: "low",
    summary: "Confirm structure files and references remain valid in the target version."
  },
  tags: {
    severity: "low",
    summary: "Review tag references for renamed or removed ids in the target version."
  },
  worldgen: {
    severity: "high",
    summary: "Review worldgen JSON against the target version; registry and bootstrap rules are high-churn."
  },
  other: {
    severity: "low",
    summary: "Review uncategorized datapack files manually."
  }
};

export function analyzeDatapackVersionMigration(input: {
  fromMinecraftVersion: string;
  toMinecraftVersion: string;
  observedDataKinds?: DataKind[];
}): DatapackVersionMigrationAnalysis {
  const fromProfile = findKnownProfile(input.fromMinecraftVersion);
  const toProfile = findKnownProfile(input.toMinecraftVersion);

  if (!fromProfile) {
    return createUnknownAnalysis({
      status: "unknown_source_version",
      note: `Source Minecraft version ${input.fromMinecraftVersion} is not in the local datapack profile catalog.`
    });
  }

  if (!toProfile) {
    return createUnknownAnalysis({
      status: "unknown_target_version",
      from: toEvidence(fromProfile),
      note: `Target Minecraft version ${input.toMinecraftVersion} is not in the local datapack profile catalog.`
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
      : createRiskHints(input.observedDataKinds ?? []),
    notes: [
      "This is a pack-format migration summary, not full JSON schema rewriting."
    ]
  };
}

function findKnownProfile(
  minecraftVersion: string
): KnownVersionProfile | undefined {
  return KNOWN_VERSION_PROFILES.find(
    (profile) => profile.minecraftVersion === minecraftVersion
  );
}

function toEvidence(
  profile: KnownVersionProfile
): DatapackMigrationVersionEvidence {
  return {
    minecraftVersion: profile.minecraftVersion,
    packFormat: profile.packFormat,
    packFormatId: profile.packFormatId,
    knownDataKinds: profile.knownDataKinds
  };
}

function createUnknownAnalysis(input: {
  status: Exclude<DatapackMigrationStatus, "ready">;
  from?: DatapackMigrationVersionEvidence;
  note: string;
}): DatapackVersionMigrationAnalysis {
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
  fromProfile: KnownVersionProfile,
  toProfile: KnownVersionProfile
): DatapackMigrationDirection {
  const fromIndex = KNOWN_VERSION_PROFILES.indexOf(fromProfile);
  const toIndex = KNOWN_VERSION_PROFILES.indexOf(toProfile);

  if (fromIndex === toIndex) {
    return "same_version";
  }

  return fromIndex < toIndex ? "upgrade" : "downgrade";
}

function calculateNumericPackFormatDelta(
  fromProfile: KnownVersionProfile,
  toProfile: KnownVersionProfile
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

function createRiskHints(kinds: DataKind[]): DatapackMigrationRiskHint[] {
  const uniqueKinds = [...new Set(kinds)];
  return uniqueKinds.map(createRiskHint);
}

function createRiskHint(kind: DataKind): DatapackMigrationRiskHint {
  return { kind, ...RISK_HINTS[kind] };
}
