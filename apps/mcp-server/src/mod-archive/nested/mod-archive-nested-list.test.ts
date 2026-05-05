import { describe, expect, it } from "vitest";

import { extractNestedArchiveListPath } from "./mod-archive-nested-list.js";

describe("extractNestedArchiveListPath", () => {
  it("requires an explicit JarJar bang marker", () => {
    expect(
      extractNestedArchiveListPath("List data entries in mods/content-mod.jar.")
    ).toBeUndefined();
  });

  it("extracts a nested archive path from explicit JarJar list requests", () => {
    expect(
      extractNestedArchiveListPath(
        "List data entries in META-INF/jarjar/nested-content.jar! from mods/outer-mod.jar."
      )
    ).toBe("META-INF/jarjar/nested-content.jar");
  });
});
