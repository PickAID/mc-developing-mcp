import { describe, expect, it } from "vitest";

import { join, normalize, sep } from "node:path";

import { resolveManagedRuntimeLayout } from "./layout.js";

describe("resolveManagedRuntimeLayout", () => {
  it("resolves managed runtime subdirectories under the given root", () => {
    const runtimeRoot = join("tmp", "mcpskill-runtime");
    const expectedRoot = normalize(runtimeRoot);

    expect(resolveManagedRuntimeLayout(runtimeRoot)).toEqual({
      root: expectedRoot,
      downloads: join(expectedRoot, "downloads"),
      installs: join(expectedRoot, "installs"),
      locks: join(expectedRoot, "locks")
    });
  });

  it("normalizes the root and derives subpaths from the normalized root", () => {
    const base = join("tmp", "mcpskill-runtime");
    const runtimeRoot = `${base}${sep}..${sep}mcpskill-runtime${sep}${sep}`;
    const expectedRoot = normalize(runtimeRoot);

    expect(resolveManagedRuntimeLayout(runtimeRoot)).toEqual({
      root: expectedRoot,
      downloads: join(expectedRoot, "downloads"),
      installs: join(expectedRoot, "installs"),
      locks: join(expectedRoot, "locks")
    });
  });
});
