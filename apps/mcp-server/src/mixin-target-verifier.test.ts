import { describe, expect, it } from "vitest";

import { verifyMixinTarget } from "./mixin-target-verifier.js";

describe("verifyMixinTarget", () => {
  it("accepts an exact target match", () => {
    expect(
      verifyMixinTarget({
        requestedTarget: "net.minecraft.world.item.ItemStack",
        availableClasses: [
          "net.minecraft.world.item.ItemStack",
          "net.minecraft.world.item.Items"
        ]
      })
    ).toEqual({
      status: "valid",
      requestedTarget: "net.minecraft.world.item.ItemStack",
      candidates: ["net.minecraft.world.item.ItemStack"],
      nextReads: []
    });
  });

  it("returns same-package candidates when the exact target is missing", () => {
    expect(
      verifyMixinTarget({
        requestedTarget: "net.minecraft.world.item.ItemStack",
        availableClasses: ["net.minecraft.world.item.Items"]
      })
    ).toEqual({
      status: "missing_target",
      requestedTarget: "net.minecraft.world.item.ItemStack",
      candidates: ["net.minecraft.world.item.Items"],
      nextReads: []
    });
  });

  it("marks multiple close candidates as ambiguous", () => {
    expect(
      verifyMixinTarget({
        requestedTarget: "com.example.client.RenderTarget",
        availableClasses: [
          "com.example.client.RenderTargetBridge",
          "com.example.client.RenderTargetHooks"
        ]
      })
    ).toEqual({
      status: "ambiguous_target",
      requestedTarget: "com.example.client.RenderTarget",
      candidates: [
        "com.example.client.RenderTargetBridge",
        "com.example.client.RenderTargetHooks"
      ],
      nextReads: []
    });
  });

  it("reports unavailable source when no class evidence is present", () => {
    expect(
      verifyMixinTarget({
        requestedTarget: "com.example.Missing",
        availableClasses: []
      })
    ).toEqual({
      status: "source_unavailable",
      requestedTarget: "com.example.Missing",
      candidates: [],
      nextReads: []
    });
  });
});
