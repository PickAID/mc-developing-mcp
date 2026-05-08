import { describe, expect, it } from "vitest";

import { verifyMixinTarget } from "./mixin-target-verifier.js";

describe("verifyMixinTarget descriptor proofs", () => {
  it("uses JVM descriptor types to narrow overloaded method candidates", () => {
    const result = verifyMixinTarget({
      requestedTarget: "com.example.compat.TargetApi",
      availableClasses: ["com.example.compat.TargetApi"],
      requestedMembers: [{
        owner: "com.example.compat.TargetApi",
        memberName: "call",
        memberKind: "method",
        descriptor: "(Lnet/minecraft/world/item/ItemStack;I)V"
      }],
      availableMembers: [
        {
          ownerQualifiedName: "com.example.compat.TargetApi",
          memberName: "call",
          memberKind: "method",
          path: "com/example/compat/TargetApi.java",
          signature: "call()",
          returnType: "void"
        },
        {
          ownerQualifiedName: "com.example.compat.TargetApi",
          memberName: "call",
          memberKind: "method",
          path: "com/example/compat/TargetApi.java",
          signature: "call(ItemStack, int)",
          returnType: "void"
        }
      ]
    });

    expect(result.memberProofs?.[0]).toMatchObject({
      status: "valid",
      descriptorProofLevel: "parameter_types",
      matches: [{ signature: "call(ItemStack, int)" }]
    });
  });

  it("does not match same-arity primitive overloads with different types", () => {
    const result = verifyMixinTarget({
      requestedTarget: "com.example.compat.TargetApi",
      availableClasses: ["com.example.compat.TargetApi"],
      requestedMembers: [{
        owner: "com.example.compat.TargetApi",
        memberName: "call",
        memberKind: "method",
        descriptor: "(I)V"
      }],
      availableMembers: [{
        ownerQualifiedName: "com.example.compat.TargetApi",
        memberName: "call",
        memberKind: "method",
        path: "com/example/compat/TargetApi.java",
        signature: "call(boolean)"
      }]
    });

    expect(result.memberProofs?.[0]).toMatchObject({
      status: "missing_member",
      candidates: [{ signature: "call(boolean)" }]
    });
  });

  it("keeps descriptor-free overloaded member proof ambiguous", () => {
    const result = verifyMixinTarget({
      requestedTarget: "com.example.compat.TargetApi",
      availableClasses: ["com.example.compat.TargetApi"],
      requestedMembers: [{
        owner: "com.example.compat.TargetApi",
        memberName: "call",
        memberKind: "method"
      }],
      availableMembers: [
        {
          ownerQualifiedName: "com.example.compat.TargetApi",
          memberName: "call",
          memberKind: "method",
          path: "com/example/compat/TargetApi.java",
          signature: "call()"
        },
        {
          ownerQualifiedName: "com.example.compat.TargetApi",
          memberName: "call",
          memberKind: "method",
          path: "com/example/compat/TargetApi.java",
          signature: "call(ItemStack, int)"
        }
      ]
    });

    expect(result.memberProofs?.[0]).toMatchObject({
      status: "ambiguous_member",
      matches: [
        { signature: "call()" },
        { signature: "call(ItemStack, int)" }
      ]
    });
  });

  it("reports missing member when descriptor arity excludes same-kind overloads", () => {
    const result = verifyMixinTarget({
      requestedTarget: "com.example.compat.TargetApi",
      availableClasses: ["com.example.compat.TargetApi"],
      requestedMembers: [{
        owner: "com.example.compat.TargetApi",
        memberName: "call",
        memberKind: "method",
        descriptor: "(I)V"
      }],
      availableMembers: [{
        ownerQualifiedName: "com.example.compat.TargetApi",
        memberName: "call",
        memberKind: "method",
        path: "com/example/compat/TargetApi.java",
        signature: "call(ItemStack, int)"
      }]
    });

    expect(result.memberProofs?.[0]).toMatchObject({
      status: "missing_member",
      candidates: [{ signature: "call(ItemStack, int)" }]
    });
  });

  it("uses JVM descriptor primitive types to select equal-arity overloads", () => {
    const result = verifyMixinTarget({
      requestedTarget: "com.example.compat.TargetApi",
      availableClasses: ["com.example.compat.TargetApi"],
      requestedMembers: [{
        owner: "com.example.compat.TargetApi",
        memberName: "call",
        memberKind: "method",
        descriptor: "(I)V"
      }],
      availableMembers: [
        {
          ownerQualifiedName: "com.example.compat.TargetApi",
          memberName: "call",
          memberKind: "method",
          path: "com/example/compat/TargetApi.java",
          signature: "call(int)"
        },
        {
          ownerQualifiedName: "com.example.compat.TargetApi",
          memberName: "call",
          memberKind: "method",
          path: "com/example/compat/TargetApi.java",
          signature: "call(boolean)"
        }
      ]
    });

    expect(result.memberProofs?.[0]).toMatchObject({
      status: "valid",
      matches: [{ signature: "call(int)" }]
    });
  });

  it("matches array and qualified class descriptor parameter types", () => {
    const result = verifyMixinTarget({
      requestedTarget: "com.example.compat.TargetApi",
      availableClasses: ["com.example.compat.TargetApi"],
      requestedMembers: [{
        owner: "com.example.compat.TargetApi",
        memberName: "call",
        memberKind: "method",
        descriptor: "([Lnet/minecraft/world/item/ItemStack;[I)V"
      }],
      availableMembers: [{
        ownerQualifiedName: "com.example.compat.TargetApi",
        memberName: "call",
        memberKind: "method",
        path: "com/example/compat/TargetApi.java",
        signature: "call(net.minecraft.world.item.ItemStack[], int[])"
      }]
    });

    expect(result.memberProofs?.[0]).toMatchObject({
      status: "valid",
      matches: [{
        signature: "call(net.minecraft.world.item.ItemStack[], int[])"
      }]
    });
  });

  it("uses descriptor types for constructors", () => {
    const result = verifyMixinTarget({
      requestedTarget: "com.example.compat.TargetApi",
      availableClasses: ["com.example.compat.TargetApi"],
      requestedMembers: [{
        owner: "com.example.compat.TargetApi",
        memberName: "<init>",
        memberKind: "constructor",
        descriptor: "(Ljava/lang/String;I)V"
      }],
      availableMembers: [
        {
          ownerQualifiedName: "com.example.compat.TargetApi",
          memberName: "TargetApi",
          memberKind: "constructor",
          path: "com/example/compat/TargetApi.java",
          signature: "TargetApi(int, int)"
        },
        {
          ownerQualifiedName: "com.example.compat.TargetApi",
          memberName: "TargetApi",
          memberKind: "constructor",
          path: "com/example/compat/TargetApi.java",
          signature: "TargetApi(String, int)"
        }
      ]
    });

    expect(result.memberProofs?.[0]).toMatchObject({
      status: "valid",
      matches: [{ signature: "TargetApi(String, int)" }]
    });
  });

  it("keeps ambiguous proof when any overload lacks parseable signature evidence", () => {
    const result = verifyMixinTarget({
      requestedTarget: "com.example.compat.TargetApi",
      availableClasses: ["com.example.compat.TargetApi"],
      requestedMembers: [{
        owner: "com.example.compat.TargetApi",
        memberName: "call",
        memberKind: "method",
        descriptor: "(I)V"
      }],
      availableMembers: [
        {
          ownerQualifiedName: "com.example.compat.TargetApi",
          memberName: "call",
          memberKind: "method",
          path: "com/example/compat/TargetApi.java",
          signature: "call(int)"
        },
        {
          ownerQualifiedName: "com.example.compat.TargetApi",
          memberName: "call",
          memberKind: "method",
          path: "com/example/compat/TargetApi.java"
        }
      ]
    });

    expect(result.memberProofs?.[0]).toMatchObject({
      status: "ambiguous_member",
      descriptorProofLevel: "not_proven",
      matches: [
        { signature: "call(int)" },
        { memberName: "call" }
      ]
    });
  });
});
