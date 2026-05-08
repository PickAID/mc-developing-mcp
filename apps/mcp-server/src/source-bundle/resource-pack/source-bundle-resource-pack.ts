import {
  analyzeResourcePackVersionMigration,
  resolveResourcePackVersionProfile,
  type AssetKind,
  type ResourcePackProfileConfidence,
  type ResourcePackVersionMigrationAnalysis,
  type ResourcePackVersionProfile
} from "minecraft-developing-mcp-datapack-adapter";

export interface ResourcePackMigrationRequest {
  fromMinecraftVersion: string;
  toMinecraftVersion: string;
}

export interface McpServerResourcePackEvidence {
  resourcePackVersionProfile: CompactResourcePackVersionProfile;
  resourcePackMigrationAnalysis?: CompactResourcePackMigrationAnalysis;
}

interface CompactResourcePackVersionProfile {
  tokenPolicy: "compact_resource_profile";
  source: ResourcePackVersionProfile["source"];
  confidence: ResourcePackVersionProfile["confidence"];
  supportLevel: ResourcePackVersionProfile["supportLevel"];
  packFormatStatus: ResourcePackVersionProfile["packFormatStatus"];
  packFormat?: number;
  packFormatId?: string;
  packFormatVersion?: ResourcePackVersionProfile["packFormatVersion"];
  minecraftVersion?: string;
  compatibleMinecraftVersions: string[];
  knownAssetKinds: AssetKind[];
  assetKinds: AssetKind[];
  semanticValidation: "not_available";
  migrationAnalysis: "not_available";
  notes: string[];
}

type CompactResourcePackMigrationAnalysis =
  ResourcePackVersionMigrationAnalysis & {
    tokenPolicy: "compact_resource_migration";
  };

export async function resolveMcpServerResourcePackEvidence(input: {
  workspaceRoot: string;
  assetKinds: AssetKind[];
  minecraftVersion?: string;
  runtimeConfidence?: ResourcePackProfileConfidence;
  migrationRequest?: ResourcePackMigrationRequest;
}): Promise<McpServerResourcePackEvidence> {
  const profile = await resolveResourcePackVersionProfile(input.workspaceRoot, {
    assetKinds: input.assetKinds,
    minecraftVersion: input.minecraftVersion,
    runtimeConfidence: input.runtimeConfidence
  });

  return {
    resourcePackVersionProfile: toCompactResourcePackVersionProfile(profile),
    resourcePackMigrationAnalysis: toCompactResourcePackMigrationAnalysis(
      input.migrationRequest,
      input.assetKinds
    )
  };
}

function toCompactResourcePackVersionProfile(
  profile: ResourcePackVersionProfile
): CompactResourcePackVersionProfile {
  return {
    tokenPolicy: "compact_resource_profile" as const,
    source: profile.source,
    confidence: profile.confidence,
    supportLevel: profile.supportLevel,
    packFormatStatus: profile.packFormatStatus,
    packFormat: profile.packFormat,
    packFormatId: profile.packFormatId,
    packFormatVersion: profile.packFormatVersion,
    minecraftVersion: profile.minecraftVersion,
    compatibleMinecraftVersions: profile.compatibleMinecraftVersions,
    knownAssetKinds: profile.knownAssetKinds,
    assetKinds: profile.assetKinds,
    semanticValidation: profile.semanticValidation,
    migrationAnalysis: profile.migrationAnalysis,
    notes: profile.notes
  };
}

function toCompactResourcePackMigrationAnalysis(
  input: ResourcePackMigrationRequest | undefined,
  observedAssetKinds: AssetKind[]
): CompactResourcePackMigrationAnalysis | undefined {
  if (!input) {
    return undefined;
  }

  const analysis = analyzeResourcePackVersionMigration({
    ...input,
    observedAssetKinds
  });
  return {
    tokenPolicy: "compact_resource_migration" as const,
    status: analysis.status,
    direction: analysis.direction,
    compatibility: analysis.compatibility,
    from: analysis.from,
    to: analysis.to,
    packFormatChange: analysis.packFormatChange,
    requiredActions: analysis.requiredActions,
    riskHints: analysis.riskHints,
    notes: analysis.notes
  } satisfies CompactResourcePackMigrationAnalysis;
}
