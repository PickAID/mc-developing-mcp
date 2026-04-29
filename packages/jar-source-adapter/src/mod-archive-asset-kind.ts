export type ModArchiveAssetKind =
  | "gui_texture"
  | "gui_sprite"
  | "atlas"
  | "font"
  | "lang";

export interface ModArchiveAssetSummary {
  uiAssetCount: number;
  byKind: Partial<Record<ModArchiveAssetKind, number>>;
}

const ASSET_KINDS = new Set<ModArchiveAssetKind>([
  "gui_texture",
  "gui_sprite",
  "atlas",
  "font",
  "lang"
]);

export function classifyModArchiveAssetKind(
  relativePath: string
): ModArchiveAssetKind | undefined {
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
  return /^assets\/[^/]+\/lang\/.+\.json$/i.test(relativePath)
    ? "lang"
    : undefined;
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
    uiAssetCount: 0,
    byKind: {}
  };
}
