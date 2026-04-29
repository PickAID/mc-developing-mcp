import { readFile } from "node:fs/promises";

import type { ArchiveContentCache } from "./archive-content-cache.js";
import type { ArchiveContentDomain } from "./archive-content.js";
import {
  discoverModArchives,
  readModArchiveMetadataFromBuffer,
  type ModArchiveCandidate,
  type ModArchiveMetadata
} from "./mod-archives.js";
import {
  normalizeArchivePath,
  readZipCentralDirectory,
  readZipEntryContent,
  type ZipEntry
} from "./java-source-archive.js";
import { DEFAULT_MAX_NESTED_ARCHIVE_BYTES } from "./nested-archive-limits.js";

export interface ModArchiveInventoryEntry extends ModArchiveCandidate {
  archiveMetadata?: ModArchiveMetadata;
  contentSummary: ModArchiveContentSummary;
  nestedArchives: NestedModArchiveInventoryEntry[];
}

export interface NestedModArchiveInventoryEntry {
  embeddedArchivePath: string;
  embeddedArchiveMetadata?: ModArchiveMetadata;
  contentSummary?: ModArchiveContentSummary;
  sizeBytes: number;
}

export interface ModArchiveContentSummary {
  fileCount: number;
  byDomain: Record<ArchiveContentDomain, number>;
}

export interface ModArchiveInventoryResult {
  archives: ModArchiveInventoryEntry[];
  archiveCount: number;
  truncated: boolean;
  cache?: ModArchiveInventoryCacheMetadata;
}

export interface ModArchiveInventoryCacheMetadata {
  centralDirectoryHits: number;
  centralDirectoryMisses: number;
}

export async function buildModArchiveInventory(input: {
  workspaceRoot: string;
  maxArchives?: number;
  maxNestedArchives?: number;
  cache?: ArchiveContentCache;
}): Promise<ModArchiveInventoryResult> {
  const discovered = await discoverModArchives({
    workspaceRoot: input.workspaceRoot,
    maxArchives: input.maxArchives
  });
  const cacheMetadata: ModArchiveInventoryCacheMetadata = {
    centralDirectoryHits: 0,
    centralDirectoryMisses: 0
  };

  const inspectedArchives = await Promise.all(
    discovered.archives.map((archive) =>
      inspectArchive({
        archive,
        maxNestedArchives: input.maxNestedArchives,
        cache: input.cache,
        cacheMetadata
      })
    )
  );
  const archives = inspectedArchives.map((result) => result.archive);

  return {
    archives,
    archiveCount: archives.length,
    truncated:
      discovered.truncated || inspectedArchives.some((result) => result.truncated),
    cache: input.cache ? cacheMetadata : undefined
  };
}

async function inspectArchive(input: {
  archive: ModArchiveCandidate;
  maxNestedArchives?: number;
  cache?: ArchiveContentCache;
  cacheMetadata: ModArchiveInventoryCacheMetadata;
}): Promise<{ archive: ModArchiveInventoryEntry; truncated: boolean }> {
  const archiveBuffer = await readFile(input.archive.archivePath);
  const directory = await readArchiveDirectory({
    archivePath: input.archive.archivePath,
    archiveBuffer,
    cache: input.cache
  });

  if (directory.cacheHit) {
    input.cacheMetadata.centralDirectoryHits += 1;
  } else {
    input.cacheMetadata.centralDirectoryMisses += 1;
  }

  const nested = readNestedArchives({
    archiveBuffer,
    directory: directory.entries,
    maxNestedArchives: input.maxNestedArchives
  });

  return {
    archive: {
      ...input.archive,
      archiveMetadata: readMetadataSafely(archiveBuffer),
      contentSummary: summarizeContentEntries(directory.entries),
      nestedArchives: nested.entries
    },
    truncated: nested.truncated
  };
}

async function readArchiveDirectory(input: {
  archivePath: string;
  archiveBuffer: Buffer;
  cache?: ArchiveContentCache;
}): Promise<{ entries: ZipEntry[]; cacheHit: boolean }> {
  if (!input.cache) {
    return {
      entries: readZipCentralDirectory(input.archiveBuffer),
      cacheHit: false
    };
  }

  const cached = await input.cache.readCentralDirectory(input.archivePath);
  return {
    entries: cached.value,
    cacheHit: cached.cacheHit
  };
}

function readNestedArchives(input: {
  archiveBuffer: Buffer;
  directory: ZipEntry[];
  maxNestedArchives?: number;
}): { entries: NestedModArchiveInventoryEntry[]; truncated: boolean } {
  const maxNestedArchives = normalizeLimit(input.maxNestedArchives, 16);
  const nestedEntries = input.directory.filter((entry) => {
    return normalizeArchivePath(entry.name)?.endsWith(".jar") === true;
  });

  const entries = nestedEntries.slice(0, maxNestedArchives).flatMap((entry) => {
    const embeddedArchivePath = normalizeArchivePath(entry.name);
    if (
      !embeddedArchivePath ||
      entry.uncompressedSize > DEFAULT_MAX_NESTED_ARCHIVE_BYTES
    ) {
      return [];
    }

    const content = readZipEntryContent(input.archiveBuffer, entry);
    return [{
      embeddedArchivePath,
      embeddedArchiveMetadata: readMetadataSafely(content),
      contentSummary: summarizeBufferContent(content),
      sizeBytes: entry.uncompressedSize
    }];
  });

  return {
    entries,
    truncated: nestedEntries.length > maxNestedArchives
  };
}

function summarizeBufferContent(
  archiveBuffer: Buffer
): ModArchiveContentSummary | undefined {
  try {
    return summarizeContentEntries(readZipCentralDirectory(archiveBuffer));
  } catch {
    return undefined;
  }
}

function summarizeContentEntries(entries: ZipEntry[]): ModArchiveContentSummary {
  const byDomain: Record<ArchiveContentDomain, number> = {
    java: 0,
    data: 0,
    assets: 0,
    class: 0
  };

  for (const entry of entries) {
    if (entry.name.endsWith("/")) {
      continue;
    }

    const relativePath = normalizeArchivePath(entry.name);
    const domain = relativePath
      ? classifyArchiveContentDomain(relativePath)
      : undefined;
    if (domain) {
      byDomain[domain] += 1;
    }
  }

  return {
    fileCount: byDomain.java + byDomain.data + byDomain.assets + byDomain.class,
    byDomain
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
  return relativePath.startsWith("assets/") ? "assets" : undefined;
}

function readMetadataSafely(archive: Buffer): ModArchiveMetadata | undefined {
  try {
    return readModArchiveMetadataFromBuffer(archive);
  } catch {
    return undefined;
  }
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  return Math.max(0, Math.floor(limit ?? fallback));
}
