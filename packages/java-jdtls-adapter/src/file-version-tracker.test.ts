import { describe, expect, it } from "vitest";

import { createJavaFileVersionTracker } from "./file-version-tracker.js";

describe("createJavaFileVersionTracker", () => {
  it("assigns version 1 on open, increments on change, and clears on close", () => {
    const tracker = createJavaFileVersionTracker();
    const filePath = "/workspace/src/main/java/demo/Example.java";

    expect(tracker.open(filePath)).toBe(1);
    expect(tracker.current(filePath)).toBe(1);
    expect(tracker.change(filePath)).toBe(2);
    expect(tracker.change(filePath)).toBe(3);

    tracker.close(filePath);

    expect(tracker.current(filePath)).toBeUndefined();
    expect(tracker.open(filePath)).toBe(1);
  });

  it("starts a missing file at version 1 when a change arrives before open", () => {
    const tracker = createJavaFileVersionTracker();

    expect(tracker.change("/workspace/src/main/java/demo/LateOpen.java")).toBe(1);
  });
});
