import { describe, expect, it } from "vitest";

import { extractProbeJsRequestedSymbol } from "./probejs-symbol-extraction.js";

describe("extractProbeJsRequestedSymbol", () => {
  it.each([
    ["ProbeJS symbol ServerEvents.recipes", "ServerEvents.recipes"],
    ["query type ItemStack", "ItemStack"],
    ["find d.ts for Item.of", "Item.of"],
    ["KubeJS event ServerEvents.recipes", "ServerEvents.recipes"]
  ])("extracts %s", (request, symbol) => {
    expect(extractProbeJsRequestedSymbol(request)).toBe(symbol);
  });

  it("selects the most specific symbol when multiple candidates are present", () => {
    expect(
      extractProbeJsRequestedSymbol(
        "query type ItemStack for KubeJS event ServerEvents.recipes"
      )
    ).toBe("ServerEvents.recipes");
  });

  it("does not infer broad symbols from ordinary natural language", () => {
    expect(
      extractProbeJsRequestedSymbol(
        "ProbeJS can you explain recipes and items in KubeJS server scripts?"
      )
    ).toBeUndefined();
  });
});
