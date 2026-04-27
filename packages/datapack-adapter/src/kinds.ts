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
  "lang",
  "models",
  "textures",
  "sounds",
  "blockstates"
]);

export function classifyKind(domain: DatapackDomain, segment: string | undefined): DatapackKind {
  if (domain === "data") {
    return segment !== undefined && DATA_KINDS.has(segment as DataKind)
      ? (segment as DataKind)
      : "other";
  }

  return segment !== undefined && ASSET_KINDS.has(segment as AssetKind)
    ? (segment as AssetKind)
    : "other";
}
