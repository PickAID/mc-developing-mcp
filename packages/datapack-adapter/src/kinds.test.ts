import { describe, expect, it } from "vitest";

import { classifyKind } from "./kinds.js";

describe("classifyKind", () => {
  it("classifies broader datapack data roots used across modern versions", () => {
    expect(classifyKind("data", "item_modifiers")).toBe("item_modifiers");
    expect(classifyKind("data", "structures")).toBe("structures");
    expect(classifyKind("data", "wolf_variant.json")).toBe("registry");
  });
});
