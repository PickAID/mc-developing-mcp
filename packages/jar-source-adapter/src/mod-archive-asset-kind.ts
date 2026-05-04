export type ModArchiveAssetKind =
  | "gui_texture"
  | "gui_sprite"
  | "atlas"
  | "blockstates"
  | "block_entity_renderer_asset"
  | "connected_texture_metadata"
  | "custom_model_format"
  | "equipment"
  | "font"
  | "items"
  | "lang"
  | "models"
  | "particles"
  | "post_effect"
  | "shaders"
  | "sounds"
  | "texts"
  | "textures"
  | "waypoint_style";

export interface ModArchiveAssetSummary {
  assetEntryCount: number;
  uiAssetCount: number;
  byKind: Partial<Record<ModArchiveAssetKind, number>>;
}

const ASSET_KINDS = new Set<ModArchiveAssetKind>([
  "gui_texture",
  "gui_sprite",
  "atlas",
  "blockstates",
  "block_entity_renderer_asset",
  "connected_texture_metadata",
  "custom_model_format",
  "equipment",
  "font",
  "items",
  "lang",
  "models",
  "particles",
  "post_effect",
  "shaders",
  "sounds",
  "texts",
  "textures",
  "waypoint_style"
]);
const UI_ASSET_KINDS = new Set<ModArchiveAssetKind>([
  "gui_texture",
  "gui_sprite",
  "atlas",
  "font",
  "lang"
]);

export function classifyModArchiveAssetKind(
  relativePath: string
): ModArchiveAssetKind | undefined {
  if (isConnectedTextureMetadataPath(relativePath)) {
    return "connected_texture_metadata";
  }
  if (isCustomModelFormatPath(relativePath)) {
    return "custom_model_format";
  }
  if (isBlockEntityRendererAssetPath(relativePath)) {
    return "block_entity_renderer_asset";
  }
  if (/^assets\/[^/]+\/textures\/gui\/sprites\/.+\.png$/i.test(relativePath)) {
    return "gui_sprite";
  }
  if (/^assets\/[^/]+\/textures\/gui\/.+\.png$/i.test(relativePath)) {
    return "gui_texture";
  }
  if (/^assets\/[^/]+\/atlases\/.+\.json$/i.test(relativePath)) {
    return "atlas";
  }
  if (/^assets\/[^/]+\/font\/.+\.json$/i.test(relativePath)) {
    return "font";
  }
  if (/^assets\/[^/]+\/lang\/.+\.json$/i.test(relativePath)) {
    return "lang";
  }

  return parseModArchiveAssetKind(relativePath.split("/")[2]);
}

function isConnectedTextureMetadataPath(relativePath: string): boolean {
  return /^assets\/[^/]+\/(?:ctm|connected_textures|optifine\/ctm)\/.+\.(?:json|properties|mcmeta)$/i.test(
    relativePath
  );
}

function isCustomModelFormatPath(relativePath: string): boolean {
  return /^assets\/[^/]+\/models\/.+\.(?:obj|gltf|glb)$/i.test(relativePath);
}

function isBlockEntityRendererAssetPath(relativePath: string): boolean {
  return /^assets\/[^/]+\/textures\/(?:block_entity|entity\/(?:block_entity|banner|bed|chest|signs|shulker))\/.+\.png$/i.test(
    relativePath
  );
}

export function parseModArchiveAssetKind(
  value: unknown
): ModArchiveAssetKind | undefined {
  return typeof value === "string" && ASSET_KINDS.has(value as ModArchiveAssetKind)
    ? (value as ModArchiveAssetKind)
    : undefined;
}

export function createEmptyModArchiveAssetSummary(): ModArchiveAssetSummary {
  return {
    assetEntryCount: 0,
    uiAssetCount: 0,
    byKind: {}
  };
}

export function isUiModArchiveAssetKind(assetKind: ModArchiveAssetKind): boolean {
  return UI_ASSET_KINDS.has(assetKind);
}
