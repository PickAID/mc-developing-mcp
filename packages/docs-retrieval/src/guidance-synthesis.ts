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

  records.push(...synthesizeKnownSections(input));

  return records;
}

function buildRecord(input: {
  input: GuidanceSynthesisInput;
  entrySuffix: string;
  title: string;
  summary: string;
  terms: string[];
  kind?: DocsPackageRecord["kind"];
  scriptScopes?: string[];
  eventNames?: string[];
  codeSymbols?: string[];
}): DocsPackageRecord {
  const entryId = `${input.input.packageId}-${input.entrySuffix}`;

  return {
    entryId,
    packageId: input.input.packageId,
    kind: input.kind ?? "concept",
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
    scriptScopes: input.scriptScopes ?? [],
    addonNames: [],
    eventNames: input.eventNames ?? [],
    codeSymbols: input.codeSymbols ?? []
  };
}

function synthesizeKnownSections(input: GuidanceSynthesisInput): DocsPackageRecord[] {
  return KNOWN_SECTIONS.flatMap((section) =>
    objectArrayField(input.content[section.field]).map((entry, index) => {
      const id =
        stringField(entry.id) ??
        stringField(entry.scope) ??
        stringField(entry.query) ??
        stringField(entry.bridge) ??
        String(index + 1);
      const title = sectionTitle(entry);
      const summary = sectionSummary(entry);

      return buildRecord({
        input,
        entrySuffix: `${section.field}-${slug(id)}`,
        title,
        summary,
        terms: [
          section.field,
          title,
          ...section.terms(entry),
          ...collectGuidanceTerms(entry)
        ],
        kind: section.kind,
        scriptScopes: section.scriptScopes(entry),
        eventNames: stringArrayField(entry.examples),
        codeSymbols: stringArrayField(entry.examples)
      });
    })
  );
}

function collectGuidanceTerms(value: unknown): string[] {
  const terms: string[] = [];
  collectTerms(value, terms, 0);
  return uniqueStrings(expandSearchTerms(terms)).slice(0, 768);
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

function compactStrings(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => value !== undefined);
}

function objectArrayField(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function sectionTitle(entry: Record<string, unknown>): string {
  return (
    stringField(entry.title) ??
    stringField(entry.scope) ??
    stringField(entry.query) ??
    stringField(entry.bridge) ??
    stringField(entry.id) ??
    "Guidance Section"
  );
}

function sectionSummary(entry: Record<string, unknown>): string {
  return uniqueStrings(compactStrings([
    stringField(entry.guidance),
    stringField(entry.purpose),
    stringField(entry.use),
    stringField(entry.useWhen),
    stringField(entry.selectionRule),
    stringField(entry.externalReferenceRule),
    ...stringArrayField(entry.rules),
    ...stringArrayField(entry.chain),
    ...stringArrayField(entry.follow),
    ...stringArrayField(entry.requireEvidenceForNineSlice),
    ...stringArrayField(entry.reportAsConflict),
    ...stringArrayField(entry.entryEvidence),
    ...stringArrayField(entry.assetRelations),
    ...stringArrayField(entry.mustNotAssume)
  ])).join(" ");
}

function scopeTerms(entry: Record<string, unknown>): string[] {
  const scope = stringField(entry.scope);
  return scope ? [scope] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9._:-]+/g, "-")
      .replaceAll(/^-+|-+$/g, "") || "section"
  );
}

function uniqueStrings(values: string[]): string[] {
  return [
    ...new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0)
    )
  ];
}

function expandSearchTerms(values: string[]): string[] {
  const terms: string[] = [];

  for (const value of values) {
    terms.push(value);
    terms.push(...tokenTerms(value));
  }

  return terms;
}

function tokenTerms(value: string): string[] {
  const tokens = value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3)
    .filter((token) => !STOP_WORDS.has(token));
  const terms = tokens.flatMap((token) =>
    token.endsWith("s") && token.length > 4 ? [token, token.slice(0, -1)] : [token]
  );

  for (let index = 0; index < tokens.length - 1; index += 1) {
    terms.push(`${tokens[index]} ${tokens[index + 1]}`);
  }

  return terms;
}

const STOP_WORDS = new Set([
  "and",
  "are",
  "can",
  "data",
  "for",
  "from",
  "into",
  "load",
  "not",
  "only",
  "the",
  "this",
  "when",
  "with",
  "without"
]);

const KNOWN_SECTIONS: Array<{
  field: string;
  kind: DocsPackageRecord["kind"];
  terms: (entry: Record<string, unknown>) => string[];
  scriptScopes: (entry: Record<string, unknown>) => string[];
}> = [
  {
    field: "principles",
    kind: "concept",
    terms: () => [],
    scriptScopes: () => []
  },
  {
    field: "scopeRules",
    kind: "resource-layout",
    terms: scopeTerms,
    scriptScopes: scopeTerms
  },
  {
    field: "eventBridgeRules",
    kind: "event-catalog",
    terms: (entry) =>
      [
        stringField(entry.bridge),
        stringField(entry.useWhen),
        stringField(entry.selectionRule)
      ].filter((value): value is string => Boolean(value)),
    scriptScopes: () => []
  },
  {
    field: "lookupHints",
    kind: "concept",
    terms: (entry) =>
      [stringField(entry.query), stringField(entry.use)].filter(
        (value): value is string => Boolean(value)
      ),
    scriptScopes: () => []
  },
  {
    field: "implementationChains",
    kind: "api-proof",
    terms: (entry) => stringArrayField(entry.chain),
    scriptScopes: () => []
  },
  {
    field: "relationshipDiscoveryRules",
    kind: "api-proof",
    terms: (entry) => [
      ...stringArrayField(entry.start),
      ...stringArrayField(entry.follow)
    ],
    scriptScopes: () => []
  },
  {
    field: "visualTargets",
    kind: "api-proof",
    terms: (entry) => [
      ...stringArrayField(entry.entryEvidence),
      ...stringArrayField(entry.assetRelations),
      ...stringArrayField(entry.mustNotAssume)
    ],
    scriptScopes: () => []
  }
];
