import type { DocsPackageSelectionResult } from "./selector.js";
import { BUILTIN_DOCS_RECORDS, type DocsPackageRecord } from "./records.js";

export interface DocsSearchHit {
  entryId: string;
  packageId: string;
  kind: DocsPackageRecord["kind"];
  title: string;
  path: string;
  summary: string;
  score: number;
  matchedTerms: string[];
}

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
  const allRecords = [...candidateRecords, ...resourceRecords];
  const hits = allRecords
    .map((record) => buildHit(record, normalizedQuery))
    .filter((hit): hit is DocsSearchHit => hit !== undefined)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      return left.entryId.localeCompare(right.entryId);
    })
    .slice(0, input.limit ?? 5);

  return {
    hits,
    trace: {
      queryText,
      selectedPackageIds,
      candidateEntryIds: candidateRecords.map((record) => record.entryId),
      resourceEntryIds: resourceRecords.map((record) => record.entryId),
      matchedEntryIds: hits.map((hit) => hit.entryId)
    }
  };
}

function buildHit(
  record: DocsPackageRecord,
  normalizedQuery: string
): DocsSearchHit | undefined {
  const matchedTerms = new Set<string>();
  let score = 0;

  for (const signal of buildSignals(record)) {
    if (!normalizedQuery.includes(normalize(signal.term))) {
      continue;
    }

    matchedTerms.add(signal.term.toLowerCase());
    score += signal.weight;
  }

  if (score === 0) {
    return undefined;
  }

  return {
    entryId: record.entryId,
    packageId: record.packageId,
    kind: record.kind,
    title: record.title,
    path: record.path,
    summary: record.summary,
    score,
    matchedTerms: [...matchedTerms]
  };
}

function buildSignals(record: DocsPackageRecord) {
  return [
    ...record.searchTerms.map((term) => ({ term, weight: 8 })),
    ...record.scriptScopes.map((term) => ({ term, weight: 7 })),
    ...record.addonNames.map((term) => ({ term, weight: 7 })),
    ...record.eventNames.map((term) => ({ term, weight: 6 })),
    ...record.codeSymbols.map((term) => ({ term, weight: 5 })),
    ...record.headings.map((term) => ({ term, weight: 4 })),
    { term: record.title, weight: 4 }
  ];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
