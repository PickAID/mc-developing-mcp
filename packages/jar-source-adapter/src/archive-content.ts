import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  normalizeArchivePath,
  readZipCentralDirectory,
  readZipEntryContent,
  type ZipEntry
} from "./java-source-archive.js";
import type { ArchiveContentCache } from "./archive-content-cache.js";

export { createArchiveContentCache } from "./archive-content-cache.js";
export type { ArchiveContentCache } from "./archive-content-cache.js";

export type ArchiveContentDomain =
  | "java"
  | "data"
  | "assets"
  | "class"
  | "metadata";

export type ArchiveContentSkipReason = "not-found" | "too-large" | "binary";

export interface ArchiveContentEntry {
  relativePath: string;
  domain: ArchiveContentDomain;
  sizeBytes: number;
}

export interface ArchiveContentSkippedEntry {
  relativePath: string;
  reason: ArchiveContentSkipReason;
}

export interface ExtractArchiveContentResult {
  fileCount: number;
  byDomain: Record<ArchiveContentDomain, number>;
}

export interface ListArchiveContentResult {
  entries: ArchiveContentEntry[];
  truncated: boolean;
  cache?: ArchiveContentCacheMetadata;
}

export interface ReadArchiveContentFileResult {
  entry?: ArchiveContentEntry;
  content?: string;
  skipped?: ArchiveContentSkippedEntry;
  cache?: ArchiveContentCacheMetadata;
}

export interface ArchiveContentSearchMatch {
  entry: ArchiveContentEntry;
  line: number;
  column: number;
  preview: string;
}

export interface SearchArchiveContentResult {
  matches: ArchiveContentSearchMatch[];
  skipped: ArchiveContentSkippedEntry[];
  truncated: boolean;
  cache?: ArchiveContentCacheMetadata;
}

export interface ArchiveContentCacheMetadata {
  centralDirectoryHit?: boolean;
  textFileHit?: boolean;
}

export async function extractArchiveContent(input: {
  sourceArchive: string;
  targetRoot: string;
  domains: ArchiveContentDomain[];
}): Promise<ExtractArchiveContentResult> {
  const archive = await readFile(input.sourceArchive);
  const entries = readZipCentralDirectory(archive);
  const requestedDomains = new Set(input.domains);
  const byDomain: Record<ArchiveContentDomain, number> = {
    java: 0,
    data: 0,
    assets: 0,
    class: 0,
    metadata: 0
  };

  for (const entry of entries) {
    if (entry.name.endsWith("/")) {
      continue;
    }

    const relativePath = normalizeArchivePath(entry.name);
    if (!relativePath) {
      continue;
    }

    const domain = classifyArchiveContentDomain(relativePath);
    if (!domain || !requestedDomains.has(domain)) {
      continue;
    }

    const targetPath = join(input.targetRoot, relativePath);

    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, readZipEntryContent(archive, entry));
    byDomain[domain] += 1;
  }

  return {
    fileCount: Object.values(byDomain).reduce((total, count) => total + count, 0),
    byDomain
  };
}

export async function listArchiveContent(input: {
  sourceArchive: string;
  domains: ArchiveContentDomain[];
  limit?: number;
  cache?: ArchiveContentCache;
}): Promise<ListArchiveContentResult> {
  const directory = await readArchiveCentralDirectory(
    input.sourceArchive,
    input.cache
  );
  const entries = collectArchiveContentEntries(directory.entries, input.domains);
  const limit = normalizeLimit(input.limit);

  return {
    entries: entries.slice(0, limit).map((entry) => entry.contentEntry),
    truncated: entries.length > limit,
    cache: {
      centralDirectoryHit: directory.cacheHit
    }
  };
}

export async function readArchiveContentFile(input: {
  sourceArchive: string;
  relativePath: string;
  maxBytes?: number;
  cache?: ArchiveContentCache;
}): Promise<ReadArchiveContentFileResult> {
  const directory = await readArchiveCentralDirectory(
    input.sourceArchive,
    input.cache
  );
  const relativePath = normalizeArchivePath(input.relativePath);
  if (!relativePath) {
    return {
      skipped: { relativePath: input.relativePath, reason: "not-found" },
      cache: { centralDirectoryHit: directory.cacheHit }
    };
  }

  const archiveEntry = collectArchiveContentEntries(directory.entries).find(
    (entry) => entry.contentEntry.relativePath === relativePath
  );
  if (!archiveEntry) {
    return {
      skipped: { relativePath, reason: "not-found" },
      cache: { centralDirectoryHit: directory.cacheHit }
    };
  }
  if (archiveEntry.contentEntry.domain === "class") {
    return {
      skipped: {
        relativePath: archiveEntry.contentEntry.relativePath,
        reason: "binary"
      },
      cache: { centralDirectoryHit: directory.cacheHit }
    };
  }

  const readResult = input.cache
    ? await input.cache.getTextFile({
        sourceArchive: input.sourceArchive,
        relativePath,
        maxBytes: input.maxBytes ?? 65_536,
        load: () => readTextArchiveEntry(input.sourceArchive, archiveEntry, input.maxBytes)
      })
    : {
        value: await readTextArchiveEntry(
          input.sourceArchive,
          archiveEntry,
          input.maxBytes
        ),
        cacheHit: false
      };

  return {
    ...readResult.value,
    cache: {
      centralDirectoryHit: directory.cacheHit,
      textFileHit: readResult.cacheHit
    }
  };
}

async function readTextArchiveEntry(
  sourceArchive: string,
  archiveEntry: ArchiveContentCollectedEntry,
  maxBytes?: number
): Promise<Omit<ReadArchiveContentFileResult, "cache">> {
  const skipped = shouldSkipArchiveEntry(
    archiveEntry.contentEntry,
    maxBytes ?? 65_536
  );
  if (skipped) {
    return { skipped };
  }

  const archive = await readFile(sourceArchive);
  const content = readZipEntryContent(archive, archiveEntry.zipEntry);
  if (isBinaryContent(content)) {
    return {
      skipped: {
        relativePath: archiveEntry.contentEntry.relativePath,
        reason: "binary"
      }
    };
  }
  return {
    entry: archiveEntry.contentEntry,
    content: content.toString("utf-8")
  };
}

export async function searchArchiveContent(input: {
  sourceArchive: string;
  domains: ArchiveContentDomain[];
  query: string;
  limit?: number;
  maxBytesPerFile?: number;
  cache?: ArchiveContentCache;
}): Promise<SearchArchiveContentResult> {
  const directory = await readArchiveCentralDirectory(
    input.sourceArchive,
    input.cache
  );
  const entries = collectArchiveContentEntries(directory.entries, input.domains);
  const limit = normalizeLimit(input.limit);
  const matches: ArchiveContentSearchMatch[] = [];
  const skipped: ArchiveContentSkippedEntry[] = [];
  let archive: Buffer | undefined;
  let truncated = false;

  for (const archiveEntry of entries) {
    if (archiveEntry.contentEntry.domain === "class") {
      const match = findClassPathMatch(archiveEntry.contentEntry, input.query);
      if (match) {
        if (matches.length >= limit) {
          truncated = true;
          break;
        }
        matches.push(match);
      }
      continue;
    }

    const budgetSkip = shouldSkipArchiveEntry(
      archiveEntry.contentEntry,
      input.maxBytesPerFile ?? 65_536
    );
    if (budgetSkip) {
      skipped.push(budgetSkip);
      continue;
    }

    archive ??= await readFile(input.sourceArchive);
    const content = readZipEntryContent(archive, archiveEntry.zipEntry);
    if (isBinaryContent(content)) {
      skipped.push({
        relativePath: archiveEntry.contentEntry.relativePath,
        reason: "binary"
      });
      continue;
    }

    for (const match of findTextMatches(
      archiveEntry.contentEntry,
      content.toString("utf-8"),
      input.query
    )) {
      if (matches.length >= limit) {
        truncated = true;
        break;
      }
      matches.push(match);
    }
  }

  return {
    matches,
    skipped,
    truncated,
    cache: {
      centralDirectoryHit: directory.cacheHit
    }
  };
}

async function readArchiveCentralDirectory(
  sourceArchive: string,
  cache?: ArchiveContentCache
): Promise<{ entries: ZipEntry[]; cacheHit: boolean }> {
  if (cache) {
    const cached = await cache.readCentralDirectory(sourceArchive);
    return {
      entries: cached.value,
      cacheHit: cached.cacheHit
    };
  }

  return {
    entries: readZipCentralDirectory(await readFile(sourceArchive)),
    cacheHit: false
  };
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
  if (relativePath.startsWith("assets/")) {
    return "assets";
  }
  if (isArchiveMetadataPath(relativePath)) {
    return "metadata";
  }

  return undefined;
}

function isArchiveMetadataPath(relativePath: string): boolean {
  return (
    /^(?:fabric|quilt)\.mod\.json$/i.test(relativePath) ||
    /^[^/]+\.mixins?\.json$/i.test(relativePath) ||
    relativePath === "pack.mcmeta" ||
    /^META-INF\/(?:mods|neoforge\.mods)\.toml$/i.test(relativePath)
  );
}

function findClassPathMatch(
  entry: ArchiveContentEntry,
  query: string
): ArchiveContentSearchMatch | undefined {
  const relativePath = entry.relativePath;
  const binaryName = relativePath
    .replace(/\.class$/i, "")
    .replaceAll("/", ".");
  const simpleName = binaryName.split(".").at(-1) ?? "";
  const normalizedQuery = query.toLowerCase();
  const haystacks = [relativePath, binaryName, simpleName];

  if (!haystacks.some((value) => value.toLowerCase().includes(normalizedQuery))) {
    return undefined;
  }

  return {
    entry,
    line: 1,
    column: Math.max(1, relativePath.toLowerCase().indexOf(normalizedQuery) + 1),
    preview: relativePath
  };
}

interface ArchiveContentCollectedEntry {
  zipEntry: ZipEntry;
  contentEntry: ArchiveContentEntry;
}

function collectArchiveContentEntries(
  entries: ZipEntry[],
  domains?: ArchiveContentDomain[]
): ArchiveContentCollectedEntry[] {
  const requestedDomains = domains ? new Set(domains) : undefined;

  return entries
    .flatMap((zipEntry) => {
      if (zipEntry.name.endsWith("/")) {
        return [];
      }
      const relativePath = normalizeArchivePath(zipEntry.name);
      if (!relativePath) {
        return [];
      }
      const domain = classifyArchiveContentDomain(relativePath);
      if (!domain || (requestedDomains && !requestedDomains.has(domain))) {
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
    })
    .sort((left, right) =>
      left.contentEntry.relativePath.localeCompare(right.contentEntry.relativePath)
    );
}

function shouldSkipArchiveEntry(
  entry: ArchiveContentEntry,
  maxBytes: number
): ArchiveContentSkippedEntry | undefined {
  return entry.sizeBytes > maxBytes
    ? { relativePath: entry.relativePath, reason: "too-large" }
    : undefined;
}

function findTextMatches(
  entry: ArchiveContentEntry,
  content: string,
  query: string
): ArchiveContentSearchMatch[] {
  return content.split(/\r?\n/).flatMap((line, index) => {
    const column = line.indexOf(query);
    if (column < 0) {
      return [];
    }

    return [{
      entry,
      line: index + 1,
      column: column + 1,
      preview: line.trim()
    }];
  });
}

function isBinaryContent(content: Buffer): boolean {
  return content.includes(0);
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Math.floor(limit));
}
