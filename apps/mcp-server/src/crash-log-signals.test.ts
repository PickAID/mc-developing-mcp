import { describe, expect, it } from "vitest";

import { parseCrashSignals } from "./crash-log-signals.js";

describe("parseCrashSignals", () => {
  it("extracts Mixin apply target classes for archive owner lookup", () => {
    const signals = parseCrashSignals(
      [
        "Mixin apply failed demo.mixins.json:CompatMixin -> com.example.compat.TargetApi: org.spongepowered.asm.mixin.injection.throwables.InvalidInjectionException",
        ""
      ].join("\n")
    );

    expect(signals).toMatchObject({
      exceptionClasses: [
        "org.spongepowered.asm.mixin.injection.throwables.InvalidInjectionException"
      ],
      classReferences: ["com.example.compat.TargetApi"],
      actionableClassReferences: ["com.example.compat.TargetApi"]
    });
  });
});
