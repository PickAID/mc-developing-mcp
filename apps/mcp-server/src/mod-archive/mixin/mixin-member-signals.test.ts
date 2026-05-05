import { describe, expect, it } from "vitest";

import { extractMixinMemberReferences } from "./mixin-member-signals.js";

describe("extractMixinMemberReferences", () => {
  it("extracts JVM descriptor style Mixin method and field targets", () => {
    expect(
      extractMixinMemberReferences(
        [
          "target=Lcom/example/compat/TargetApi;call()V",
          "field=Lcom/example/compat/TargetApi;enabled:Z"
        ].join("\n")
      )
    ).toEqual([
      {
        owner: "com.example.compat.TargetApi",
        memberName: "call",
        memberKind: "method",
        descriptor: "()V"
      },
      {
        owner: "com.example.compat.TargetApi",
        memberName: "enabled",
        memberKind: "field",
        descriptor: ":Z"
      }
    ]);
  });

  it("extracts NoSuchMethodError and NoSuchFieldError owners", () => {
    expect(
      extractMixinMemberReferences(
        [
          "java.lang.NoSuchMethodError: 'void com.example.compat.TargetApi.call()'",
          "java.lang.NoSuchFieldError: com.example.compat.TargetApi.enabled"
        ].join("\n")
      )
    ).toMatchObject([
      {
        owner: "com.example.compat.TargetApi",
        memberName: "call",
        memberKind: "method"
      },
      {
        owner: "com.example.compat.TargetApi",
        memberName: "enabled",
        memberKind: "field"
      }
    ]);
  });
});
