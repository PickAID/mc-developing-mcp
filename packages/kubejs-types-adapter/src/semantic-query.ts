import type { KubeJsSemanticResourceEntry } from "./types.js";

export function normalizeSemanticResourceQueries(queries?: string[]): string[] {
  if (!queries) {
    return [];
  }

  const normalized = queries
    .flatMap((query) => query.split(/\s+/))
    .map((query) => query.trim())
    .filter((query) => query.length >= 3);

  return [...new Set(normalized)];
}

export function semanticEntryMatchesQueries(
  entry: KubeJsSemanticResourceEntry,
  queries: string[]
): boolean {
  if (queries.length === 0) {
    return true;
  }

  const searchableText = entrySearchableText(entry);
  const normalizedText = normalizeLoose(searchableText);
  const compactText = normalizeCompact(searchableText);

  return queries.some((query) => {
    const normalizedQuery = normalizeLoose(query);
    const compactQuery = normalizeCompact(query);

    return (
      normalizedText.includes(normalizedQuery) ||
      compactText.includes(compactQuery)
    );
  });
}

function entrySearchableText(entry: KubeJsSemanticResourceEntry): string {
  return [
    entry.sourceKind,
    entry.name,
    entry.value,
    entry.sourceFormat,
    ...Object.values(entry.metadata ?? {})
      .filter((value) => value !== undefined)
      .map(String)
  ].join(" ");
}

function normalizeLoose(value: string): string {
  return value.toLowerCase();
}

function normalizeCompact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
