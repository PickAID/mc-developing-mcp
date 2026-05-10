import type { DocsPackageSelectionResult } from "./selector.js";
import { BUILTIN_DOCS_RECORDS, type DocsPackageRecord } from "./records.js";

export interface DocsSearchHit {
  entryId: string;
  packageId: string;
  kind: DocsPackageRecord["kind"];
  source: DocsSearchHitSource;
  title: string;
  path: string;
  summary: string;
  score: number;
  matchedTerms: string[];
  matchReasons: string[];
  metadata?: Record<string, unknown>;
}

export type DocsSearchHitSource = "builtin" | "resource" | "sqlite";

export interface SearchSelectedDocsPackagesInput {
  queryText?: string;
  docsSelection: DocsPackageSelectionResult;
  limit?: number;
  resourceRecords?: DocsPackageRecord[];
}

export interface SearchSelectedDocsPackagesResult {
  hits: DocsSearchHit[];
  trace: {
    queryText: string;
    selectedPackageIds: string[];
    candidateEntryIds: string[];
    resourceEntryIds: string[];
    matchedEntryIds: string[];
    rankedEntryIds: string[];
    truncatedEntryIds: string[];
  };
}

export function searchSelectedDocsPackages(
  input: SearchSelectedDocsPackagesInput
): SearchSelectedDocsPackagesResult {
  const queryText = input.queryText?.trim() ?? "";
  const normalizedQuery = normalize(queryText);
  const selectedPackageIds = input.docsSelection.selections.map(
    (selection) => selection.packageId
  );
  const candidateRecords = BUILTIN_DOCS_RECORDS.filter((record) =>
    selectedPackageIds.includes(record.packageId)
  );
  const resourceRecords = input.resourceRecords ?? [];
  const candidateHits = candidateRecords
    .map((record) => buildDocsSearchHit(record, normalizedQuery, "builtin"))
    .filter((hit): hit is DocsSearchHit => hit !== undefined);
  const resourceHits = resourceRecords
    .map((record) => buildDocsSearchHit(record, normalizedQuery, "resource"))
    .filter((hit): hit is DocsSearchHit => hit !== undefined);
  const rankedHits = rankDocsSearchHits([...candidateHits, ...resourceHits]);
  const hits = rankedHits.slice(0, input.limit ?? 5);

  return {
    hits,
    trace: {
      queryText,
      selectedPackageIds,
      candidateEntryIds: candidateRecords.map((record) => record.entryId),
      resourceEntryIds: resourceRecords.map((record) => record.entryId),
      matchedEntryIds: hits.map((hit) => hit.entryId),
      rankedEntryIds: rankedHits.map((hit) => hit.entryId),
      truncatedEntryIds: rankedHits
        .slice(input.limit ?? 5)
        .map((hit) => hit.entryId)
    }
  };
}

export function buildDocsSearchHit(
  record: DocsPackageRecord,
  normalizedQuery: string,
  source: DocsSearchHitSource = "builtin"
): DocsSearchHit | undefined {
  const matchedTerms = new Set<string>();
  const matchReasons = new Set<string>();
  let score = 0;

  for (const signal of buildSignals(record)) {
    if (!normalizedQuery.includes(normalize(signal.term))) {
      continue;
    }

    matchedTerms.add(signal.term.toLowerCase());
    matchReasons.add(`${signal.source}:${signal.term.toLowerCase()}`);
    score += signal.weight;
  }

  if (score === 0) {
    return undefined;
  }

  return {
    entryId: record.entryId,
    packageId: record.packageId,
    kind: record.kind,
    source,
    title: record.title,
    path: record.path,
    summary: record.summary,
    score,
    matchedTerms: [...matchedTerms],
    matchReasons: [...matchReasons],
    ...(record.metadata ? { metadata: record.metadata } : {})
  };
}

export function rankDocsSearchHits(hits: DocsSearchHit[]): DocsSearchHit[] {
  return [...hits].sort(compareDocsSearchHits);
}

function buildSignals(record: DocsPackageRecord) {
  return [
    ...record.searchTerms.map((term) => ({
      term,
      weight: 8,
      source: "search_term"
    })),
    ...record.scriptScopes.map((term) => ({
      term,
      weight: 7,
      source: "script_scope"
    })),
    ...record.addonNames.map((term) => ({
      term,
      weight: 7,
      source: "addon"
    })),
    ...record.eventNames.map((term) => ({
      term,
      weight: 6,
      source: "event"
    })),
    ...record.codeSymbols.map((term) => ({
      term,
      weight: 5,
      source: "symbol"
    })),
    ...record.headings.map((term) => ({
      term,
      weight: 4,
      source: "heading"
    })),
    { term: record.title, weight: 4, source: "title" }
  ];
}

function compareDocsSearchHits(left: DocsSearchHit, right: DocsSearchHit): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  const sourceOrder = sourceRank(left.source) - sourceRank(right.source);
  if (sourceOrder !== 0) {
    return sourceOrder;
  }

  const packageOrder = left.packageId.localeCompare(right.packageId);
  if (packageOrder !== 0) {
    return packageOrder;
  }

  return left.entryId.localeCompare(right.entryId);
}

function sourceRank(source: DocsSearchHitSource): number {
  switch (source) {
    case "sqlite":
      return 0;
    case "resource":
      return 1;
    case "builtin":
      return 2;
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
