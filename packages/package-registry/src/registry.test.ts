import { describe, expect, it } from "vitest";

import { buildPackageRegistry, findPackageById } from "./registry.js";

describe("buildPackageRegistry", () => {
  it("indexes package records by package id while preserving declaration order", () => {
    const alpha = { packageId: "alpha", title: "Alpha" };
    const beta = { packageId: "beta", title: "Beta" };

    const registry = buildPackageRegistry([alpha, beta]);

    expect(registry.packageIds).toEqual(["alpha", "beta"]);
    expect(registry.packages).toEqual([alpha, beta]);
    expect(findPackageById(registry, "beta")).toEqual(beta);
  });

  it("rejects duplicate package ids", () => {
    expect(() =>
      buildPackageRegistry([
        { packageId: "duplicate", title: "First" },
        { packageId: "duplicate", title: "Second" }
      ])
    ).toThrowError("duplicate packageId: duplicate");
  });
});
