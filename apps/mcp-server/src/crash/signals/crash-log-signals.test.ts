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
      actionableClassReferences: ["com.example.compat.TargetApi"],
      mixinTargetClassReferences: ["com.example.compat.TargetApi"]
    });
  });

  it("extracts loader dependency mod ids from Fabric and NeoForge crash text", () => {
    const signals = parseCrashSignals(
      [
        "- Mod 'Demo Addon' (demo_addon) 1.0.0 requires version 0.92.2 or later of fabric-api, which is missing!",
        "Missing or unsupported mandatory dependencies:",
        "Mod ID: 'geckolib', Requested by: 'spell_mod', Expected range: '[4.4,)', Actual version: '[MISSING]'",
        ""
      ].join("\n")
    );

    expect(signals.loaderModReferences).toEqual([
      {
        modId: "fabric-api",
        requestedBy: "demo_addon",
        expectedRange: "0.92.2 or later",
        actualVersion: "missing",
        kind: "missing_dependency"
      },
      {
        modId: "geckolib",
        requestedBy: "spell_mod",
        expectedRange: "[4.4,)",
        actualVersion: "[MISSING]",
        kind: "missing_dependency"
      }
    ]);
  });

  it("extracts Forge crash section and tainted mod ids for local jar lookup", () => {
    const signals = parseCrashSignals(
      [
        "// Embeddium instance tainted by mods: [oculus, acceleratedrendering]",
        "-- MOD acceleratedrendering --",
        "Failure message: Accelerated Rendering is missing a feature it requires to run",
        ""
      ].join("\n")
    );

    expect(signals.loaderModIds).toEqual(["acceleratedrendering", "oculus"]);
  });

  it("extracts FTB Quests load errors for schema evolution evidence", () => {
    const signals = parseCrashSignals(
      [
        "[Server thread/ERROR] [ftbquests/]: Failed to load FTB Quests file config/ftbquests/quests/addon_bridge/custom.snbt",
        "java.lang.IllegalArgumentException: Unknown task type hotai:flight_task",
        ""
      ].join("\n")
    );

    expect(signals.ftbQuestsErrors).toEqual([
      {
        kind: "load_error",
        path: "config/ftbquests/quests/addon_bridge/custom.snbt",
        message: "Unknown task type hotai:flight_task"
      }
    ]);
  });
});
