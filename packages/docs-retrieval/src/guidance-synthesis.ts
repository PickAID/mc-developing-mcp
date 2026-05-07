import type { DocsPackageRecord } from "./records.js";

export interface GuidanceSynthesisInput {
  packageId: string;
  displayName: string;
  repoPath: string;
  content: Record<string, unknown>;
  packageSearchTerms: string[];
}

export function synthesizeGuidanceRecords(
  input: GuidanceSynthesisInput
): DocsPackageRecord[] {
  const records: DocsPackageRecord[] = [];
  const purpose = stringField(input.content.purpose);
  const hardRules = stringArrayField(input.content.hardRules);

  if (purpose) {
    records.push(
      buildRecord({
        input,
        entrySuffix: "purpose",
        title: `${input.displayName} Purpose`,
        summary: purpose,
        terms: [
          ...input.packageSearchTerms,
          ...collectGuidanceTerms(input.content)
        ]
      })
    );
  }

  if (hardRules.length > 0) {
    records.push(
      buildRecord({
        input,
        entrySuffix: "hard-rules",
        title: `${input.displayName} Hard Rules`,
        summary: hardRules.join(" "),
        terms: [...input.packageSearchTerms, ...hardRules]
      })
    );
  }

  return records;
}

function buildRecord(input: {
  input: GuidanceSynthesisInput;
  entrySuffix: string;
  title: string;
  summary: string;
  terms: string[];
}): DocsPackageRecord {
  const entryId = `${input.input.packageId}-${input.entrySuffix}`;

  return {
    entryId,
    packageId: input.input.packageId,
    kind: "concept",
    title: input.title,
    path: `${input.input.repoPath}#${entryId}`,
    headings: [],
    summary: input.summary,
    searchTerms: uniqueStrings([
      input.input.packageId,
      input.title,
      input.summary,
      ...input.terms
    ]),
    scriptScopes: [],
    addonNames: [],
    eventNames: [],
    codeSymbols: []
  };
}

function collectGuidanceTerms(value: unknown): string[] {
  const terms: string[] = [];
  collectTerms(value, terms, 0);
  return uniqueStrings(terms).slice(0, 80);
}

function collectTerms(value: unknown, terms: string[], depth: number): void {
  if (depth > 4) {
    return;
  }
  if (typeof value === "string") {
    terms.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectTerms(entry, terms, depth + 1);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }

  for (const entry of Object.values(value)) {
    collectTerms(entry, terms, depth + 1);
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArrayField(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function uniqueStrings(values: string[]): string[] {
  return [
    ...new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0)
    )
  ];
}
