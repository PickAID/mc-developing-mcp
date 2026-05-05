const HIGH_VALUE_SINGLE_SYMBOLS = new Set(["ItemStack"]);

export function extractProbeJsRequestedSymbol(
  requestText?: string
): string | undefined {
  const text = requestText ?? "";
  const candidates: Array<{ symbol: string; score: number }> = [];

  for (const match of text.matchAll(
    /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\b/g
  )) {
    const symbol = match[0];
    if (isJavaOrKubeJsDottedSymbol(symbol)) {
      candidates.push({
        symbol,
        score: 100 + symbol.split(".").length * 10 + symbol.length
      });
    }
  }

  for (const match of text.matchAll(/\b[A-Za-z_$][\w$]*\b/g)) {
    const symbol = match[0];
    if (HIGH_VALUE_SINGLE_SYMBOLS.has(symbol)) {
      candidates.push({
        symbol,
        score: 10 + symbol.length
      });
    }
  }

  return candidates.sort((left, right) => right.score - left.score)[0]?.symbol;
}

function isJavaOrKubeJsDottedSymbol(symbol: string): boolean {
  return symbol.split(".").some((part) => /[A-Z$]/.test(part));
}
