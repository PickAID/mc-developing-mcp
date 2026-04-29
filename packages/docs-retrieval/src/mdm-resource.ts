import { readFile } from "node:fs/promises";

import type { DocsPackageRecord } from "./records.js";

export async function readMdmDocsResourceRecords(
  artifactPath: string
): Promise<DocsPackageRecord[]> {
  return toMdmDocsResourceRecords(
    JSON.parse(await readFile(artifactPath, "utf-8"))
  );
}

export function toMdmDocsResourceRecords(value: unknown): DocsPackageRecord[] {
  const artifact = readArtifact(value);
  const records: DocsPackageRecord[] = [];

  for (const payload of Object.values(artifact.payload)) {
    const content = readJsonPayload(payload.content, payload.repoPath);

    for (const entry of content.entries) {
      records.push({
        entryId: entry.id,
        packageId: artifact.packageId,
        kind: entry.kind ?? "concept",
        title: entry.title,
        path: `${payload.repoPath}#${entry.id}`,
        headings: entry.headings ?? [],
        summary: entry.summary,
        searchTerms: entry.searchTerms ?? [
          entry.id,
          entry.title,
          entry.summary
        ],
        scriptScopes: entry.scriptScopes ?? [],
        addonNames: entry.addonNames ?? [],
        eventNames: entry.eventNames ?? [],
        codeSymbols: entry.codeSymbols ?? []
      });
    }
  }

  return records;
}

function readArtifact(value: unknown): MdmDocsArtifact {
  const record = objectField(value, "mdm docs artifact");
  const packageRecord = objectField(record.package, "mdm docs package");
  const artifactType = stringField(packageRecord, "artifactType");

  if (artifactType !== "docs") {
    return {
      packageId: stringField(packageRecord, "id"),
      payload: {}
    };
  }

  return {
    packageId: stringField(packageRecord, "id"),
    payload: Object.fromEntries(
      Object.entries(objectField(record.payload, "mdm docs payload")).map(
        ([key, payload]) => [key, readPayload(payload)]
      )
    )
  };
}

function readPayload(value: unknown): MdmDocsPayload {
  const record = objectField(value, "mdm docs payload item");

  return {
    repoPath: stringField(record, "repoPath"),
    content: stringField(record, "content")
  };
}

function readJsonPayload(content: string, repoPath: string): MdmDocsContent {
  const record = objectField(JSON.parse(content), `mdm docs content ${repoPath}`);
  const entries = arrayField(record, "entries").map(readEntry);

  return { entries };
}

function readEntry(value: unknown): MdmDocsEntry {
  const record = objectField(value, "mdm docs entry");

  return {
    id: stringField(record, "id"),
    title: stringField(record, "title"),
    summary: stringField(record, "summary"),
    kind: optionalKind(record.kind),
    headings: optionalStringArray(record.headings),
    searchTerms: optionalStringArray(record.searchTerms),
    scriptScopes: optionalStringArray(record.scriptScopes),
    addonNames: optionalStringArray(record.addonNames),
    eventNames: optionalStringArray(record.eventNames),
    codeSymbols: optionalStringArray(record.codeSymbols)
  };
}

function optionalKind(value: unknown): DocsPackageRecord["kind"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return stringField({ kind: value }, "kind") as DocsPackageRecord["kind"];
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return arrayField({ value }, "value").map((entry) =>
    stringField({ entry }, "entry")
  );
}

function objectField(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function arrayField(
  record: Record<string, unknown>,
  field: string
): unknown[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new Error(`mdm docs field ${field} must be an array.`);
  }

  return value;
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`mdm docs field ${field} must be a non-empty string.`);
  }

  return value;
}

interface MdmDocsArtifact {
  packageId: string;
  payload: Record<string, MdmDocsPayload>;
}

interface MdmDocsPayload {
  repoPath: string;
  content: string;
}

interface MdmDocsContent {
  entries: MdmDocsEntry[];
}

interface MdmDocsEntry {
  id: string;
  title: string;
  summary: string;
  kind?: DocsPackageRecord["kind"];
  headings?: string[];
  searchTerms?: string[];
  scriptScopes?: string[];
  addonNames?: string[];
  eventNames?: string[];
  codeSymbols?: string[];
}
