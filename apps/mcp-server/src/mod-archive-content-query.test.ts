import { describe, expect, it } from "vitest";

import {
  MOD_ARCHIVE_SEARCH_DOMAINS,
  extractListDomains,
  extractModArchiveQueries
} from "./mod-archive-content-query.js";

describe("mod archive content query helpers", () => {
  it("prioritizes explicit archive metadata paths before loose words", () => {
    expect(
      extractModArchiveQueries(
        "The game crashes during Mixin apply. Crash log resource paths: demo.mixins.json"
      )
    ).toEqual(["demo.mixins.json", "during", "Mixin", "apply"]);
  });

  it("returns all search domains for broad list requests", () => {
    expect(extractListDomains("List mod archive entries.")).toEqual(
      MOD_ARCHIVE_SEARCH_DOMAINS
    );
  });
});
