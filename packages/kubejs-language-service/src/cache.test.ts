import { describe, expect, it } from "vitest";

import { createKubeJsLanguageServiceCache } from "./cache.js";

describe("createKubeJsLanguageServiceCache", () => {
  it("reuses projects by key and creates new projects for changed keys", () => {
    const cache = createKubeJsLanguageServiceCache({ maxEntries: 2 });
    const first = fakeProject("first");

    expect(cache.getOrCreate("workspace|server|hash-a", () => first)).toBe(first);
    expect(cache.getOrCreate("workspace|server|hash-a", () => fakeProject("unused"))).toBe(
      first
    );

    const second = fakeProject("second");

    expect(cache.getOrCreate("workspace|server|hash-b", () => second)).toBe(second);
    expect(first.disposeCalls).toBe(0);
  });

  it("disposes least recently used projects when the cap is exceeded", () => {
    const cache = createKubeJsLanguageServiceCache({ maxEntries: 2 });
    const first = fakeProject("first");
    const second = fakeProject("second");
    const third = fakeProject("third");

    cache.getOrCreate("first", () => first);
    cache.getOrCreate("second", () => second);
    cache.getOrCreate("first", () => fakeProject("unused"));
    cache.getOrCreate("third", () => third);

    expect(first.disposeCalls).toBe(0);
    expect(second.disposeCalls).toBe(1);
    expect(third.disposeCalls).toBe(0);
    expect(cache.size()).toBe(2);
  });

  it("clears all projects", () => {
    const cache = createKubeJsLanguageServiceCache({ maxEntries: 4 });
    const first = fakeProject("first");
    const second = fakeProject("second");

    cache.getOrCreate("first", () => first);
    cache.getOrCreate("second", () => second);
    cache.clear();

    expect(first.disposeCalls).toBe(1);
    expect(second.disposeCalls).toBe(1);
    expect(cache.size()).toBe(0);
  });
});

function fakeProject(id: string): { id: string; disposeCalls: number; dispose(): void } {
  return {
    id,
    disposeCalls: 0,
    dispose() {
      this.disposeCalls += 1;
    }
  };
}
