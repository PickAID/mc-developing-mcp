import { readFile } from "node:fs/promises";

import type { DocsPackageRecord } from "./records.js";
import { synthesizeGuidanceRecords } from "./guidance-synthesis.js";
import { readMdmDocsArtifactMetadata } from "./mdm-artifact-metadata.js";
export {
  readMdmDocsSqliteRecords,
  searchMdmDocsSqliteRecords
} from "./mdm-resource-sqlite.js";
import { readMdmDocsSqliteRecords } from "./mdm-resource-sqlite.js";

export async function readMdmDocsResourceRecords(
  artifactPath: string,
  options: { storageKind?: string } = {}
): Promise<DocsPackageRecord[]> {
  if (options.storageKind === "sqlite_bundle") {
    return readMdmDocsSqliteRecords(artifactPath);
  }

  return toMdmDocsResourceRecords(
    JSON.parse(await readFile(artifactPath, "utf-8"))
  );
}

export function toMdmDocsResourceRecords(value: unknown): DocsPackageRecord[] {
  const artifact = readArtifact(value);
  const records: DocsPackageRecord[] = [];

  for (const payload of Object.values(artifact.payload)) {
    const content = readJsonPayload(payload.content, payload.repoPath);
    if (!content.entries) {
      records.push(
        ...synthesizeGuidanceRecords({
          packageId: artifact.packageId,
          displayName: artifact.displayName,
          repoPath: payload.repoPath,
          content: content.raw,
          packageSearchTerms: artifact.searchTerms
        })
      );
      continue;
    }

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
        codeSymbols: entry.codeSymbols ?? [],
        ...docsEntryMetadata(entry)
      });
    }
  }

  return records;
}

function readArtifact(value: unknown): MdmDocsArtifact {
  const record = objectField(value, "mdm docs artifact");
  const packageRecord = objectField(record.package, "mdm docs package");
  const metadata = readMdmDocsArtifactMetadata(packageRecord);

  if (metadata.artifactType !== "docs") {
    return {
      packageId: metadata.packageId,
      displayName: metadata.displayName,
      searchTerms: [],
      payload: {}
    };
  }

  return {
    packageId: metadata.packageId,
    displayName: metadata.displayName,
    searchTerms: metadata.searchTerms,
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
  const entries = Array.isArray(record.entries)
    ? record.entries.map(readEntry)
    : undefined;

  return { entries, raw: record };
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
    codeSymbols: optionalStringArray(record.codeSymbols),
    metadata: optionalMetadata({
      schemaDefinitionOutlines: record.schemaDefinitionOutlines,
      schemaDefinitions: record.schemaDefinitions,
      schemaSymbol: record.schemaSymbol,
      upstreamPath: record.upstreamPath,
      contentHash: record.contentHash
    })
  };
}

function optionalMetadata(value: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function docsEntryMetadata(
  entry: MdmDocsEntry
): Pick<DocsPackageRecord, "metadata"> | Record<string, never> {
  const metadata = optionalMetadata({
    schemaDefinitionOutlines: entry.schemaDefinitionOutlines,
    schemaDefinitions: entry.schemaDefinitions,
    schemaSymbol: entry.schemaSymbol,
    upstreamPath: entry.upstreamPath,
    contentHash: entry.contentHash,
    ...entry.metadata
  });

  return metadata ? { metadata } : {};
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
  displayName: string;
  searchTerms: string[];
  payload: Record<string, MdmDocsPayload>;
}

interface MdmDocsPayload {
  repoPath: string;
  content: string;
}

interface MdmDocsContent {
  entries?: MdmDocsEntry[];
  raw: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
  schemaDefinitionOutlines?: unknown;
  schemaDefinitions?: unknown;
  schemaSymbol?: unknown;
  upstreamPath?: unknown;
  contentHash?: unknown;
}
