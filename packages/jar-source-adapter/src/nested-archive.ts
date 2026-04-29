import { readFile } from "node:fs/promises";

import type {
  ArchiveContentDomain,
  ArchiveContentSearchMatch,
  ArchiveContentSkippedEntry
} from "./archive-content.js";
import {
  normalizeArchivePath,
  readZipCentralDirectory,
  readZipEntryContent,
  type ZipEntry
} from "./java-source-archive.js";
import {
  readModArchiveMetadataFromBuffer,
  type ModArchiveMetadata
} from "./mod-archives.js";

const DEFAULT_MAX_NESTED_ARCHIVES = 16;
const DEFAULT_MAX_NESTED_ARCHIVE_BYTES = 32 * 1024 * 1024;

export interface NestedArchiveContentSearchMatch
  extends ArchiveContentSearchMatch {
  sourceArchive: string;
  embeddedArchivePath: string;
  embeddedArchiveMetadata?: ModArchiveMetadata;
}

export interface NestedArchiveClassOwnerMatch {
  sourceArchive: string;
  embeddedArchivePath: string;
  embeddedArchiveMetadata?: ModArchiveMetadata;
  requestedClassName: string;
  binaryName: string;
  relativePath: string;
  sizeBytes: number;
  matchKind: "exact" | "nested";
}

export interface SearchNestedArchiveContentResult {
  matches: NestedArchiveContentSearchMatch[];
  skipped: Array<ArchiveContentSkippedEntry & {
    sourceArchive: string;
    embeddedArchivePath?: string;
  }>;
  searchedNestedArchives: number;
  truncated: boolean;
}

export interface FindNestedArchiveClassOwnersResult {
  matches: NestedArchiveClassOwnerMatch[];
  searchedNestedArchives: number;
  truncated: boolean;
}

export async function searchNestedArchiveContent(input: {
  sourceArchive: string;
  domains: ArchiveContentDomain[];
  query: string;
  maxMatches: number;
  maxBytesPerFile?: number;
}): Promise<SearchNestedArchiveContentResult> {
  const nested = await readNestedArchives(input.sourceArchive);
  const matches: NestedArchiveContentSearchMatch[] = [];
  const skipped: SearchNestedArchiveContentResult["skipped"] = [
    ...nested.skipped
  ];
  let searchedNestedArchives = 0;
  let truncated = nested.truncated;

  for (const archive of nested.archives) {
    if (matches.length >= input.maxMatches) {
      truncated = true;
      break;
    }
    searchedNestedArchives += 1;
    const remainingMatches = input.maxMatches - matches.length;
    const result = searchNestedArchiveBuffer({
      archive,
      domains: input.domains,
      query: input.query,
      maxMatches: remainingMatches,
      maxBytesPerFile: input.maxBytesPerFile
    });

    matches.push(...result.matches);
    skipped.push(...result.skipped);
    truncated = truncated || result.truncated;
  }

  return { matches, skipped, searchedNestedArchives, truncated };
}

export async function findNestedArchiveClassOwners(input: {
  sourceArchive: string;
  classNames: string[];
  maxMatches: number;
  includeNested?: boolean;
}): Promise<FindNestedArchiveClassOwnersResult> {
  const requestedClasses = normalizeRequestedClasses(input.classNames);
  const nested = await readNestedArchives(input.sourceArchive);
  const matches: NestedArchiveClassOwnerMatch[] = [];
  let searchedNestedArchives = 0;
  let truncated = nested.truncated;

  for (const archive of nested.archives) {
    if (matches.length >= input.maxMatches) {
      truncated = true;
      break;
    }
    searchedNestedArchives += 1;
    for (const entry of collectClassEntries(readZipCentralDirectory(archive.content))) {
      for (const requestedClassName of requestedClasses) {
        const matchKind = getClassMatchKind(
          entry.binaryName,
          requestedClassName,
          input.includeNested ?? false
        );
        if (!matchKind) {
          continue;
        }
        if (matches.length >= input.maxMatches) {
          truncated = true;
          break;
        }
        matches.push({
          sourceArchive: input.sourceArchive,
          embeddedArchivePath: archive.embeddedArchivePath,
          embeddedArchiveMetadata: archive.embeddedArchiveMetadata,
          requestedClassName,
          binaryName: entry.binaryName,
          relativePath: entry.relativePath,
          sizeBytes: entry.sizeBytes,
          matchKind
        });
      }
      if (matches.length >= input.maxMatches) {
        break;
      }
    }
  }

  return { matches, searchedNestedArchives, truncated };
}

async function readNestedArchives(sourceArchive: string): Promise<{
  archives: NestedArchive[];
  skipped: SearchNestedArchiveContentResult["skipped"];
  truncated: boolean;
}> {
  const outer = await readFile(sourceArchive);
  const entries = readZipCentralDirectory(outer);
  const nestedEntries = entries.filter((entry) => {
    const path = normalizeArchivePath(entry.name);
    return path?.endsWith(".jar") === true;
  });
  const archives: NestedArchive[] = [];
  const skipped: SearchNestedArchiveContentResult["skipped"] = [];
  let truncated = nestedEntries.length > DEFAULT_MAX_NESTED_ARCHIVES;

  for (const entry of nestedEntries.slice(0, DEFAULT_MAX_NESTED_ARCHIVES)) {
    const embeddedArchivePath = normalizeArchivePath(entry.name);
    if (!embeddedArchivePath) {
      continue;
    }
    if (entry.uncompressedSize > DEFAULT_MAX_NESTED_ARCHIVE_BYTES) {
      skipped.push({
        sourceArchive,
        embeddedArchivePath,
        relativePath: embeddedArchivePath,
        reason: "too-large"
      });
      continue;
    }

    const content = readZipEntryContent(outer, entry);
    archives.push({
      sourceArchive,
      embeddedArchivePath,
      embeddedArchiveMetadata: readModArchiveMetadataFromBuffer(content),
      content
    });
  }

  return { archives, skipped, truncated };
}

function searchNestedArchiveBuffer(input: {
  archive: NestedArchive;
  domains: ArchiveContentDomain[];
  query: string;
  maxMatches: number;
  maxBytesPerFile?: number;
}): Omit<SearchNestedArchiveContentResult, "searchedNestedArchives"> {
  const matches: NestedArchiveContentSearchMatch[] = [];
  const skipped: SearchNestedArchiveContentResult["skipped"] = [];
  let truncated = false;

  for (const entry of collectContentEntries(
    readZipCentralDirectory(input.archive.content),
    input.domains
  )) {
    if (matches.length >= input.maxMatches) {
      truncated = true;
      break;
    }
    if (entry.contentEntry.domain === "class") {
      const match = findClassPathMatch(entry.contentEntry, input.query);
      if (match) {
        matches.push(toNestedContentMatch(input.archive, match));
      }
      continue;
    }
    if (entry.contentEntry.sizeBytes > (input.maxBytesPerFile ?? 65_536)) {
      skipped.push(toNestedSkipped(input.archive, entry.contentEntry.relativePath, "too-large"));
      continue;
    }

    const content = readZipEntryContent(input.archive.content, entry.zipEntry);
    if (content.includes(0)) {
      skipped.push(toNestedSkipped(input.archive, entry.contentEntry.relativePath, "binary"));
      continue;
    }
    for (const match of findTextMatches(
      entry.contentEntry,
      content.toString("utf-8"),
      input.query
    )) {
      if (matches.length >= input.maxMatches) {
        truncated = true;
        break;
      }
      matches.push(toNestedContentMatch(input.archive, match));
    }
  }

  return { matches, skipped, truncated };
}

function collectContentEntries(
  entries: ZipEntry[],
  domains: ArchiveContentDomain[]
): NestedContentEntry[] {
  const requestedDomains = new Set(domains);
  return entries.flatMap((zipEntry) => {
    const relativePath = normalizeArchivePath(zipEntry.name);
    const domain = relativePath ? classifyArchiveContentDomain(relativePath) : undefined;
    if (!relativePath || !domain || !requestedDomains.has(domain)) {
      return [];
    }

    return [{
      zipEntry,
      contentEntry: {
        relativePath,
        domain,
        sizeBytes: zipEntry.uncompressedSize
      }
    }];
  });
}

function collectClassEntries(entries: ZipEntry[]): ClassEntry[] {
  return entries.flatMap((entry) => {
    const relativePath = normalizeArchivePath(entry.name);
    if (!relativePath?.endsWith(".class")) {
      return [];
    }

    return [{
      binaryName: relativePath.replace(/\.class$/i, "").replaceAll("/", "."),
      relativePath,
      sizeBytes: entry.uncompressedSize
    }];
  });
}

function classifyArchiveContentDomain(
  relativePath: string
): ArchiveContentDomain | undefined {
  if (relativePath.endsWith(".java")) {
    return "java";
  }
  if (relativePath.endsWith(".class")) {
    return "class";
  }
  if (relativePath.startsWith("data/")) {
    return "data";
  }
  return relativePath.startsWith("assets/") ? "assets" : undefined;
}

function findTextMatches(
  entry: NestedContentEntry["contentEntry"],
  content: string,
  query: string
): ArchiveContentSearchMatch[] {
  return content.split(/\r?\n/).flatMap((line, index) => {
    const column = line.indexOf(query);
    return column < 0
      ? []
      : [{ entry, line: index + 1, column: column + 1, preview: line.trim() }];
  });
}

function findClassPathMatch(
  entry: NestedContentEntry["contentEntry"],
  query: string
): ArchiveContentSearchMatch | undefined {
  const binaryName = entry.relativePath.replace(/\.class$/i, "").replaceAll("/", ".");
  const simpleName = binaryName.split(".").at(-1) ?? "";
  const normalizedQuery = query.toLowerCase();
  if (![entry.relativePath, binaryName, simpleName].some((value) =>
    value.toLowerCase().includes(normalizedQuery)
  )) {
    return undefined;
  }

  return { entry, line: 1, column: 1, preview: entry.relativePath };
}

function toNestedContentMatch(
  archive: NestedArchive,
  match: ArchiveContentSearchMatch
): NestedArchiveContentSearchMatch {
  return {
    ...match,
    sourceArchive: archive.sourceArchive,
    embeddedArchivePath: archive.embeddedArchivePath,
    embeddedArchiveMetadata: archive.embeddedArchiveMetadata
  };
}

function toNestedSkipped(
  archive: NestedArchive,
  relativePath: string,
  reason: ArchiveContentSkippedEntry["reason"]
): SearchNestedArchiveContentResult["skipped"][number] {
  return {
    sourceArchive: archive.sourceArchive,
    embeddedArchivePath: archive.embeddedArchivePath,
    relativePath,
    reason
  };
}

function normalizeRequestedClasses(classNames: string[]): string[] {
  return classNames.map(normalizeClassReference).filter((value): value is string =>
    value !== undefined
  );
}

function normalizeClassReference(rawReference: string): string | undefined {
  const dotted = rawReference
    .replace(/^[\s"'`]+|[\s"'`,;:)]+$/g, "")
    .replace(/\.class$/i, "")
    .replaceAll("/", ".");
  const simpleName = dotted.split(".").at(-1) ?? "";
  return dotted.includes(".") && /^[A-Z_$]/.test(simpleName) ? dotted : undefined;
}

function getClassMatchKind(
  binaryName: string,
  requestedClassName: string,
  includeNested: boolean
): "exact" | "nested" | undefined {
  if (binaryName === requestedClassName) {
    return "exact";
  }
  return includeNested && binaryName.startsWith(`${requestedClassName}$`)
    ? "nested"
    : undefined;
}

interface NestedArchive {
  sourceArchive: string;
  embeddedArchivePath: string;
  embeddedArchiveMetadata?: ModArchiveMetadata;
  content: Buffer;
}

interface NestedContentEntry {
  zipEntry: ZipEntry;
  contentEntry: ArchiveContentSearchMatch["entry"];
}

interface ClassEntry {
  binaryName: string;
  relativePath: string;
  sizeBytes: number;
}
