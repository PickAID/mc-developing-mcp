import { readFile } from "node:fs/promises";

import type {
  ArchiveContentDomain,
  ArchiveContentEntry,
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
import { DEFAULT_MAX_NESTED_ARCHIVE_BYTES } from "./nested-archive-limits.js";

export interface ListNestedArchiveContentResult {
  sourceArchive: string;
  embeddedArchivePath: string;
  embeddedArchiveMetadata?: ModArchiveMetadata;
  entries: ArchiveContentEntry[];
  skipped?: ArchiveContentSkippedEntry;
  truncated: boolean;
}

export async function listNestedArchiveContent(input: {
  sourceArchive: string;
  embeddedArchivePath: string;
  domains: ArchiveContentDomain[];
  limit?: number;
  maxNestedArchiveBytes?: number;
}): Promise<ListNestedArchiveContentResult> {
  const outer = await readFile(input.sourceArchive);
  const embeddedArchivePath = normalizeArchivePath(input.embeddedArchivePath);
  if (!embeddedArchivePath) {
    return skippedResult(input, input.embeddedArchivePath, "not-found");
  }

  const nestedEntry = readZipCentralDirectory(outer).find((entry) => {
    return normalizeArchivePath(entry.name) === embeddedArchivePath;
  });
  if (!nestedEntry) {
    return skippedResult(input, embeddedArchivePath, "not-found");
  }
  if (
    nestedEntry.uncompressedSize >
    (input.maxNestedArchiveBytes ?? DEFAULT_MAX_NESTED_ARCHIVE_BYTES)
  ) {
    return skippedResult(
      { ...input, embeddedArchivePath },
      embeddedArchivePath,
      "too-large"
    );
  }

  const nested = readZipEntryContent(outer, nestedEntry);
  const embeddedArchiveMetadata = readNestedMetadata(nested);
  const nestedDirectory = readNestedDirectory(nested);
  if (!nestedDirectory) {
    return skippedResult(
      { ...input, embeddedArchivePath },
      embeddedArchivePath,
      "not-found",
      embeddedArchiveMetadata
    );
  }

  const limit = normalizeLimit(input.limit);
  const entries = collectContentEntries(nestedDirectory, input.domains);

  return {
    sourceArchive: input.sourceArchive,
    embeddedArchivePath,
    embeddedArchiveMetadata,
    entries: entries.slice(0, limit),
    truncated: entries.length > limit
  };
}

function readNestedMetadata(archive: Buffer): ModArchiveMetadata | undefined {
  try {
    return readModArchiveMetadataFromBuffer(archive);
  } catch {
    return undefined;
  }
}

function readNestedDirectory(archive: Buffer): ZipEntry[] | undefined {
  try {
    return readZipCentralDirectory(archive);
  } catch {
    return undefined;
  }
}

function collectContentEntries(
  entries: ZipEntry[],
  domains: ArchiveContentDomain[]
): ArchiveContentEntry[] {
  const requestedDomains = new Set(domains);

  return entries
    .flatMap((zipEntry) => {
      if (zipEntry.name.endsWith("/")) {
        return [];
      }

      const relativePath = normalizeArchivePath(zipEntry.name);
      const domain = relativePath
        ? classifyArchiveContentDomain(relativePath)
        : undefined;
      if (!relativePath || !domain || !requestedDomains.has(domain)) {
        return [];
      }

      return [{
        relativePath,
        domain,
        sizeBytes: zipEntry.uncompressedSize
      }];
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
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

function skippedResult(
  input: {
    sourceArchive: string;
    embeddedArchivePath: string;
  },
  relativePath: string,
  reason: ArchiveContentSkippedEntry["reason"],
  embeddedArchiveMetadata?: ModArchiveMetadata
): ListNestedArchiveContentResult {
  return {
    sourceArchive: input.sourceArchive,
    embeddedArchivePath: input.embeddedArchivePath,
    embeddedArchiveMetadata,
    entries: [],
    skipped: { relativePath, reason },
    truncated: false
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Math.floor(limit));
}
