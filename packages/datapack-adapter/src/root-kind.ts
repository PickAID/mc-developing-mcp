import type { DatapackRootKind } from "./types.js";

export function classifyDatapackRootKind(input: {
  hasPackMcmeta: boolean;
  hasData: boolean;
  hasAssets: boolean;
}): DatapackRootKind {
  if (input.hasData && input.hasAssets) {
    return "mixed_pack_root";
  }
  if (input.hasAssets) {
    return input.hasPackMcmeta
      ? "resource_pack_root"
      : "workspace_assets_root";
  }
  if (input.hasData) {
    return input.hasPackMcmeta ? "datapack_root" : "workspace_data_root";
  }

  return input.hasPackMcmeta ? "mixed_pack_root" : "workspace_data_root";
}
