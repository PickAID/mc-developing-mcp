import { describe, expect, it } from "vitest";

import { classifyModArchiveAssetKind } from "./mod-archive-asset-kind.js";

describe("classifyModArchiveAssetKind", () => {
  it("classifies anonymous advanced visual asset evidence", () => {
    expect(
      classifyModArchiveAssetKind("assets/demo/optifine/ctm/block/gear.properties")
    ).toBe("connected_texture_metadata");
    expect(
      classifyModArchiveAssetKind("assets/demo/textures/entity/chest/gear.png")
    ).toBe("block_entity_renderer_asset");
    expect(classifyModArchiveAssetKind("assets/demo/models/block/gear.glb")).toBe(
      "custom_model_format"
    );
    expect(
      classifyModArchiveAssetKind("assets/demo/gui/sprites/button.nineslice.json")
    ).toBe("nine_slice_metadata");
    expect(
      classifyModArchiveAssetKind("assets/demo/textures/gui/button.9.png")
    ).toBe("nine_slice_metadata");
  });
});
