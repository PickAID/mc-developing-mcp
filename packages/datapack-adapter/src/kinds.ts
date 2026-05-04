import type { AssetKind, DataKind, DatapackDomain, DatapackKind } from "./types.js";

const DATA_KINDS = new Set<DataKind>([
  "functions",
  "recipes",
  "tags",
  "loot_tables",
  "advancements",
  "predicates",
  "damage_type",
  "item_modifiers",
  "registry",
  "structures",
  "worldgen"
]);

const ASSET_KINDS = new Set<AssetKind>([
  "atlases",
  "blockstates",
  "block_entity_renderer_asset",
  "connected_texture_metadata",
  "custom_model_format",
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

export function classifyKind(
  domain: DatapackDomain,
  segment: string | undefined,
  relativePath?: string
): DatapackKind {
  if (domain === "data") {
    if (segment !== undefined && DATA_KINDS.has(segment as DataKind)) {
      return segment as DataKind;
    }
    return segment !== undefined && segment.endsWith(".json")
      ? "registry"
      : "other";
  }

  if (relativePath !== undefined) {
    const visualKind = classifyVisualAssetKind(relativePath);
    if (visualKind !== undefined) {
      return visualKind;
    }
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
  if (isConnectedTextureRootSegment(segment)) {
    return "connected_texture_metadata";
  }
  return segment === "gpu_warnlist.json" || segment === "regional_compliancies.json"
    ? "pack_metadata"
    : segment;
}

function classifyVisualAssetKind(relativePath: string): AssetKind | undefined {
  if (isConnectedTextureMetadataPath(relativePath)) {
    return "connected_texture_metadata";
  }
  if (/^assets\/[^/]+\/models\/.+\.(?:obj|gltf|glb)$/i.test(relativePath)) {
    return "custom_model_format";
  }
  if (isBlockEntityRendererAssetPath(relativePath)) {
    return "block_entity_renderer_asset";
  }
  return undefined;
}

function isConnectedTextureRootSegment(segment: string | undefined): boolean {
  return segment === "ctm" || segment === "connected_textures" || segment === "optifine";
}

function isConnectedTextureMetadataPath(relativePath: string): boolean {
  return /^assets\/[^/]+\/(?:ctm|connected_textures|optifine\/ctm)\/.+\.(?:json|properties|mcmeta)$/i.test(
    relativePath
  );
}

function isBlockEntityRendererAssetPath(relativePath: string): boolean {
  return /^assets\/[^/]+\/textures\/(?:block_entity|entity\/(?:block_entity|banner|bed|chest|signs|shulker))\/.+\.png$/i.test(
    relativePath
  );
}
