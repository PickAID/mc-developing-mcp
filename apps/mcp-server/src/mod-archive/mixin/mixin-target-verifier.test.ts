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

  it("does not report missing targets from truncated class evidence", () => {
    expect(
      verifyMixinTarget({
        requestedTarget: "net.example.compat.TargetApi",
        availableClasses: ["net.example.compat.TargetApiImpl"],
        availableClassesTruncated: true
      })
    ).toEqual({
      status: "source_unavailable",
      requestedTarget: "net.example.compat.TargetApi",
      candidates: ["net.example.compat.TargetApiImpl"],
      nextReads: []
    });
  });

  it("does not report missing member owners from truncated class evidence", () => {
    const result = verifyMixinTarget({
      requestedTarget: "net.example.compat.TargetApi",
      availableClasses: ["net.example.compat.OtherApi"],
      availableClassesTruncated: true,
      requestedMembers: [{
        owner: "net.example.compat.TargetApi",
        memberName: "call",
        memberKind: "method"
      }],
      availableMembers: [{
        ownerQualifiedName: "net.example.compat.OtherApi",
        memberName: "call",
        memberKind: "method",
        path: "net/example/compat/OtherApi.java"
      }]
    });

    expect(result.memberProofs?.[0]).toMatchObject({
      status: "source_unavailable",
      requestedOwner: "net.example.compat.TargetApi"
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

  it("caps candidate output for broad package matches", () => {
    const result = verifyMixinTarget({
      requestedTarget: "com.example.client.RenderTarget",
      availableClasses: Array.from(
        { length: 20 },
        (_, index) => `com.example.client.RenderTargetCandidate${index}`
      )
    });

    expect(result.status).toBe("ambiguous_target");
    expect(result.candidates).toHaveLength(12);
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

  it("adds valid method proof from source-index member evidence", () => {
    expect(
      verifyMixinTarget({
        requestedTarget: "com.example.compat.TargetApi",
        availableClasses: ["com.example.compat.TargetApi"],
        requestedMembers: [{
          owner: "com.example.compat.TargetApi",
          memberName: "call",
          memberKind: "method"
        }],
        availableMembers: [{
          ownerQualifiedName: "com.example.compat.TargetApi",
          memberName: "call",
          memberKind: "method",
          path: "com/example/compat/TargetApi.java",
          startLine: 3,
          endLine: 5,
          signature: "call()",
          returnType: "void"
        }]
      })
    ).toMatchObject({
      status: "valid",
      memberProofs: [
        {
          status: "valid",
          requestedOwner: "com.example.compat.TargetApi",
          requestedMember: "call",
          memberKind: "method",
          nextReads: ["source.read com/example/compat/TargetApi.java:3-5"],
          matches: [
            {
              path: "com/example/compat/TargetApi.java",
              signature: "call()"
            }
          ]
        }
      ]
    });
  });

  it("distinguishes missing members from wrong member kinds", () => {
    const wrongKind = verifyMixinTarget({
      requestedTarget: "com.example.compat.TargetApi",
      availableClasses: ["com.example.compat.TargetApi"],
      requestedMembers: [{
        owner: "com.example.compat.TargetApi",
        memberName: "enabled",
        memberKind: "method"
      }],
      availableMembers: [{
        ownerQualifiedName: "com.example.compat.TargetApi",
        memberName: "enabled",
        memberKind: "field",
        path: "com/example/compat/TargetApi.java"
      }]
    });

    expect(wrongKind.memberProofs?.[0]).toMatchObject({
      status: "wrong_member_kind",
      candidates: [{ memberKind: "field" }]
    });

    const missing = verifyMixinTarget({
      requestedTarget: "com.example.compat.TargetApi",
      availableClasses: ["com.example.compat.TargetApi"],
      requestedMembers: [{
        owner: "com.example.compat.TargetApi",
        memberName: "missing",
        memberKind: "field"
      }],
      availableMembers: [{
        ownerQualifiedName: "com.example.compat.TargetApi",
        memberName: "enabled",
        memberKind: "field",
        path: "com/example/compat/TargetApi.java"
      }]
    });

    expect(missing.memberProofs?.[0]).toMatchObject({
      status: "missing_member",
      requestedMember: "missing"
    });
  });

  it("matches constructor requests against Java source constructor names", () => {
    const result = verifyMixinTarget({
      requestedTarget: "com.example.compat.TargetApi",
      availableClasses: ["com.example.compat.TargetApi"],
      requestedMembers: [{
        owner: "com.example.compat.TargetApi",
        memberName: "<init>",
        memberKind: "constructor"
      }],
      availableMembers: [{
        ownerQualifiedName: "com.example.compat.TargetApi",
        memberName: "TargetApi",
        memberKind: "constructor",
        path: "com/example/compat/TargetApi.java",
        startLine: 2,
        endLine: 2
      }]
    });

    expect(result.memberProofs?.[0]).toMatchObject({
      status: "valid",
      requestedMember: "<init>",
      matches: [{ memberName: "TargetApi" }]
    });
  });

});
