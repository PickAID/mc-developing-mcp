import type { AssetKind, DataKind, DatapackDomain, DatapackKind } from "./types.js";

const DATA_KINDS = new Set<DataKind>([
  "functions",
  "recipes",
  "tags",
  "loot_tables",
  "advancements",
  "predicates",
  "damage_type",
  "worldgen"
]);

const ASSET_KINDS = new Set<AssetKind>([
  "atlases",
  "blockstates",
  "equipment",
  "font",
  "items",
  "lang",
  "models",
  "pack_metadata",
  "particles",
  "post_effect",
  "shaders",
  "sounds",
  "texts",
  "textures",
  "waypoint_style"
]);

export function classifyKind(domain: DatapackDomain, segment: string | undefined): DatapackKind {
  if (domain === "data") {
    return segment !== undefined && DATA_KINDS.has(segment as DataKind)
      ? (segment as DataKind)
      : "other";
  }

  const normalizedSegment = normalizeAssetSegment(segment);

  return normalizedSegment !== undefined &&
    ASSET_KINDS.has(normalizedSegment as AssetKind)
    ? (normalizedSegment as AssetKind)
    : "other";
}

function normalizeAssetSegment(segment: string | undefined): string | undefined {
  if (segment === "sounds.json") {
    return "sounds";
  }
  return segment === "gpu_warnlist.json" || segment === "regional_compliancies.json"
    ? "pack_metadata"
    : segment;
}
