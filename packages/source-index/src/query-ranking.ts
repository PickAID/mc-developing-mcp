export type SourceIndexMatchMode = "fts_chunk" | "like_fallback" | "symbol";

export function normalizeSearchTerms(query: string): string[] {
  return query
    .split(/[^A-Za-z0-9_.$:/-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 8);
}

export function buildMatchReasons(input: {
  mode: SourceIndexMatchMode;
  query: string;
  path?: string;
}): string[] {
  const terms = normalizeSearchTerms(input.query).slice(0, 3);
  return [
    input.mode,
    ...terms.map((term) => `term:${term}`),
    ...(input.path && terms.some((term) => input.path?.includes(term))
      ? ["path_match"]
      : [])
  ];
}

export function buildLikePattern(query: string): string {
  const terms = normalizeSearchTerms(query);
  return `%${(terms[0] ?? query).replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}
