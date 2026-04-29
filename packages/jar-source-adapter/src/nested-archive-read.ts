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

export interface ReadNestedArchiveContentFileResult {
  sourceArchive: string;
  embeddedArchivePath: string;
  embeddedArchiveMetadata?: ModArchiveMetadata;
  entry?: ArchiveContentEntry;
  content?: string;
  skipped?: ArchiveContentSkippedEntry;
}

export async function readNestedArchiveContentFile(input: {
  sourceArchive: string;
  embeddedArchivePath: string;
  relativePath: string;
  maxBytes?: number;
  maxNestedArchiveBytes?: number;
}): Promise<ReadNestedArchiveContentFileResult> {
  const outer = await readFile(input.sourceArchive);
  const embeddedArchivePath = normalizeArchivePath(input.embeddedArchivePath);
  const relativePath = normalizeArchivePath(input.relativePath);
  if (!embeddedArchivePath || !relativePath) {
    return skippedResult(input, input.relativePath, "not-found");
  }

  const nestedEntry = readZipCentralDirectory(outer).find((entry) => {
    return normalizeArchivePath(entry.name) === embeddedArchivePath;
  });
  if (!nestedEntry) {
    return skippedResult(input, relativePath, "not-found");
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
      input,
      relativePath,
      "not-found",
      embeddedArchiveMetadata
    );
  }

  const contentEntry = nestedDirectory.find((entry) => {
    return normalizeArchivePath(entry.name) === relativePath;
  });
  if (!contentEntry) {
    return skippedResult(
      input,
      relativePath,
      "not-found",
      embeddedArchiveMetadata
    );
  }

  const entry = toContentEntry(relativePath, contentEntry.uncompressedSize);
  if (!entry || entry.domain === "class") {
    return skippedResult(input, relativePath, "binary", embeddedArchiveMetadata);
  }
  if (entry.sizeBytes > (input.maxBytes ?? 65_536)) {
    return skippedResult(
      input,
      relativePath,
      "too-large",
      embeddedArchiveMetadata
    );
  }

  const content = readZipEntryContent(nested, contentEntry);
  if (content.includes(0)) {
    return skippedResult(input, relativePath, "binary", embeddedArchiveMetadata);
  }

  return {
    sourceArchive: input.sourceArchive,
    embeddedArchivePath,
    embeddedArchiveMetadata,
    entry,
    content: content.toString("utf-8")
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

function skippedResult(
  input: {
    sourceArchive: string;
    embeddedArchivePath: string;
  },
  relativePath: string,
  reason: ArchiveContentSkippedEntry["reason"],
  embeddedArchiveMetadata?: ModArchiveMetadata
): ReadNestedArchiveContentFileResult {
  return {
    sourceArchive: input.sourceArchive,
    embeddedArchivePath: input.embeddedArchivePath,
    embeddedArchiveMetadata,
    skipped: { relativePath, reason }
  };
}

function toContentEntry(
  relativePath: string,
  sizeBytes: number
): ArchiveContentEntry | undefined {
  const domain = classifyArchiveContentDomain(relativePath);
  if (!domain) {
    return undefined;
  }

  return { relativePath, domain, sizeBytes };
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
