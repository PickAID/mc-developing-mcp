import { describe, expect, it } from "vitest";

import { classifyKind } from "./kinds.js";

describe("classifyKind", () => {
  it("classifies broader datapack data roots used across modern versions", () => {
    expect(classifyKind("data", "item_modifiers")).toBe("item_modifiers");
    expect(classifyKind("data", "registry")).toBe("registry");
    expect(classifyKind("data", "structures")).toBe("structures");
    expect(classifyKind("data", "wolf_variant.json")).toBe("registry");
  });

  it("classifies anonymous advanced visual resource assets", () => {
    expect(
      classifyKind(
        "assets",
        "optifine",
        "assets/demo/optifine/ctm/block/gear.properties"
      )
    ).toBe("connected_texture_metadata");
    expect(
      classifyKind("assets", "textures", "assets/demo/textures/entity/chest/gear.png")
    ).toBe("block_entity_renderer_asset");
    expect(
      classifyKind("assets", "models", "assets/demo/models/block/gear.gltf")
    ).toBe("custom_model_format");
  });
});
