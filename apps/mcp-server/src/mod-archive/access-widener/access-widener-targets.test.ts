import { describe, expect, it } from "vitest";

import { parseAccessWidenerTargets } from "./access-widener-targets.js";

describe("parseAccessWidenerTargets", () => {
  it("parses v1 and v2 headers with class, method, and field targets", () => {
    expect(
      parseAccessWidenerTargets(
        [
          "accessWidener v2 named",
          "# comments are ignored",
          "accessible class net/minecraft/client/MinecraftClient",
          "extendable method net/minecraft/entity/LivingEntity heal (F)V",
          "mutable field net/minecraft/entity/LivingEntity health F",
          "transitive-accessible class net/minecraft/world/World"
        ].join("\n")
      )
    ).toEqual({
      header: {
        namespace: "named",
        version: "v2"
      },
      targets: [
        {
          access: "accessible",
          kind: "class",
          owner: "net/minecraft/client/MinecraftClient",
          transitive: false
        },
        {
          access: "extendable",
          descriptor: "(F)V",
          kind: "method",
          name: "heal",
          owner: "net/minecraft/entity/LivingEntity",
          transitive: false
        },
        {
          access: "mutable",
          descriptor: "F",
          kind: "field",
          name: "health",
          owner: "net/minecraft/entity/LivingEntity",
          transitive: false
        },
        {
          access: "accessible",
          kind: "class",
          owner: "net/minecraft/world/World",
          transitive: true
        }
      ],
      diagnostics: []
    });

    expect(parseAccessWidenerTargets("accessWidener v1 intermediary\n").header).toEqual({
      namespace: "intermediary",
      version: "v1"
    });
  });

  it("returns compact diagnostics for unsupported headers and malformed targets", () => {
    expect(
      parseAccessWidenerTargets(
        [
          "accessWidener v3 named",
          "accessible method net/minecraft/Foo onlyName",
          "unknown class net/minecraft/Bar"
        ].join("\n")
      )
    ).toEqual({
      header: undefined,
      targets: [],
      diagnostics: [
        {
          line: 1,
          message: "Expected accessWidener v1/v2 header"
        },
        {
          line: 2,
          message: "Expected method target: <access> method <owner> <name> <descriptor>"
        },
        {
          line: 3,
          message: "Unsupported access widener modifier"
        }
      ]
    });
  });

  it("rejects modifiers that do not apply to a target kind", () => {
    expect(
      parseAccessWidenerTargets(
        [
          "accessWidener v2 named",
          "mutable class net/minecraft/Foo",
          "mutable method net/minecraft/Foo set (I)V",
          "extendable field net/minecraft/Foo value I"
        ].join("\n")
      )
    ).toEqual({
      header: {
        namespace: "named",
        version: "v2"
      },
      targets: [],
      diagnostics: [
        {
          line: 2,
          message: "Unsupported access widener modifier for target kind"
        },
        {
          line: 3,
          message: "Unsupported access widener modifier for target kind"
        },
        {
          line: 4,
          message: "Unsupported access widener modifier for target kind"
        }
      ]
    });
  });
});
