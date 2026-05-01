import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { discoverRoots } from "./discovery.js";
import {
  packFormatToNumber,
  parsePackFormatValue,
  type DatapackPackFormatVersion
} from "./pack-format.js";
import type { AssetKind } from "./types.js";

export type ResourcePackVersionProfileSource =
  | "pack_mcmeta"
  | "assets_runtime"
  | "pack_mcmeta_and_assets_runtime"
  | "conflict"
  | "unknown";

export type ResourcePackVersionSupportLevel =
  | "format_catalog_not_available"
  | "unresolved";

export type ResourcePackFormatStatus =
  | "metadata_only"
  | "missing_metadata"
  | "conflict"
  | "unknown";

export type ResourcePackProfileConfidence =
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
  assetKinds: AssetKind[];
  semanticValidation: "not_available";
  migrationAnalysis: "not_available";
  notes: string[];
}

export interface ResourcePackVersionProfileOptions {
  assetKinds?: AssetKind[];
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

  if (evidence.conflict) {
    return createProfile({
      source: "conflict",
      confidence: "unknown",
      supportLevel: "unresolved",
      packFormatStatus: "conflict",
      assetKinds
    });
  }

  if (evidence.packFormatVersion && evidence.hasAssets) {
    return createProfile({
      source: "pack_mcmeta_and_assets_runtime",
      confidence: "medium",
      supportLevel: "format_catalog_not_available",
      packFormatStatus: "metadata_only",
      packFormatVersion: evidence.packFormatVersion,
      assetKinds
    });
  }

  if (evidence.packFormatVersion) {
    return createProfile({
      source: "pack_mcmeta",
      confidence: "low",
      supportLevel: "format_catalog_not_available",
      packFormatStatus: "metadata_only",
      packFormatVersion: evidence.packFormatVersion,
      assetKinds
    });
  }

  if (evidence.hasAssets || assetKinds.length > 0) {
    return createProfile({
      source: "assets_runtime",
      confidence: "low",
      supportLevel: "unresolved",
      packFormatStatus: evidence.hasMetadata ? "unknown" : "missing_metadata",
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
  packFormatVersion?: DatapackPackFormatVersion;
  assetKinds: AssetKind[];
}): ResourcePackVersionProfile {
  return {
    source: input.source,
    confidence: input.confidence,
    supportLevel: input.supportLevel,
    packFormatStatus: input.packFormatStatus,
    packFormat: packFormatToNumber(input.packFormatVersion),
    packFormatId: input.packFormatVersion?.id,
    packFormatVersion: input.packFormatVersion,
    assetKinds: input.assetKinds,
    semanticValidation: "not_available",
    migrationAnalysis: "not_available",
    notes: [
      "profile describes resource-pack metadata and observed asset kinds only",
      "official resource pack format catalog is not implemented yet",
      "versioned asset validation is not implemented yet"
    ]
  };
}
