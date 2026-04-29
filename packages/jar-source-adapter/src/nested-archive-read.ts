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

export interface ReadNestedArchiveContentFileEntry {
  requestedPath: string;
  entry?: ArchiveContentEntry;
  content?: string;
  skipped?: ArchiveContentSkippedEntry;
}

export interface ReadNestedArchiveContentFilesResult {
  sourceArchive: string;
  embeddedArchivePath: string;
  embeddedArchiveMetadata?: ModArchiveMetadata;
  files: ReadNestedArchiveContentFileEntry[];
  skipped?: ArchiveContentSkippedEntry;
}

export async function readNestedArchiveContentFile(input: {
  sourceArchive: string;
  embeddedArchivePath: string;
  relativePath: string;
  maxBytes?: number;
  maxNestedArchiveBytes?: number;
}): Promise<ReadNestedArchiveContentFileResult> {
  const result = await readNestedArchiveContentFiles({
    ...input,
    relativePaths: [input.relativePath]
  });
  const file = result.files[0];

  return {
    sourceArchive: result.sourceArchive,
    embeddedArchivePath: result.embeddedArchivePath,
    embeddedArchiveMetadata: result.embeddedArchiveMetadata,
    entry: file?.entry,
    content: file?.content,
    skipped: pickSingleFileSkip(result, file)
  };
}

export async function readNestedArchiveContentFiles(input: {
  sourceArchive: string;
  embeddedArchivePath: string;
  relativePaths: string[];
  maxBytes?: number;
  maxNestedArchiveBytes?: number;
}): Promise<ReadNestedArchiveContentFilesResult> {
  const outer = await readFile(input.sourceArchive);
  const embeddedArchivePath = normalizeArchivePath(input.embeddedArchivePath);
  if (!embeddedArchivePath) {
    return skippedFilesResult(input, input.embeddedArchivePath, "not-found");
  }

  const nestedEntry = readZipCentralDirectory(outer).find((entry) => {
    return normalizeArchivePath(entry.name) === embeddedArchivePath;
  });
  if (!nestedEntry) {
    return skippedFilesResult(
      { ...input, embeddedArchivePath },
      embeddedArchivePath,
      "not-found"
    );
  }
  if (
    nestedEntry.uncompressedSize >
    (input.maxNestedArchiveBytes ?? DEFAULT_MAX_NESTED_ARCHIVE_BYTES)
  ) {
    return skippedFilesResult(
      { ...input, embeddedArchivePath },
      embeddedArchivePath,
      "too-large"
    );
  }

  const nested = readZipEntryContent(outer, nestedEntry);
  const embeddedArchiveMetadata = readNestedMetadata(nested);
  const nestedDirectory = readNestedDirectory(nested);
  if (!nestedDirectory) {
    return skippedFilesResult(
      { ...input, embeddedArchivePath },
      embeddedArchivePath,
      "not-found",
      embeddedArchiveMetadata
    );
  }

  const entriesByPath = new Map(
    nestedDirectory.flatMap((entry) => {
      const path = normalizeArchivePath(entry.name);
      return path ? [[path, entry] as const] : [];
    })
  );
  const files = input.relativePaths.map((requestedPath) => {
    return readNestedContentEntry({
      requestedPath,
      nested,
      entriesByPath,
      maxBytes: input.maxBytes
    });
  });

  return {
    sourceArchive: input.sourceArchive,
    embeddedArchivePath,
    embeddedArchiveMetadata,
    files
  };
}

function readNestedContentEntry(input: {
  requestedPath: string;
  nested: Buffer;
  entriesByPath: Map<string, ZipEntry>;
  maxBytes?: number;
}): ReadNestedArchiveContentFileEntry {
  const relativePath = normalizeArchivePath(input.requestedPath);
  if (!relativePath) {
    return {
      requestedPath: input.requestedPath,
      skipped: { relativePath: input.requestedPath, reason: "not-found" }
    };
  }

  const contentEntry = input.entriesByPath.get(relativePath);
  if (!contentEntry) {
    return skippedFile(input.requestedPath, relativePath, "not-found");
  }

  const entry = toContentEntry(relativePath, contentEntry.uncompressedSize);
  if (!entry || entry.domain === "class") {
    return skippedFile(input.requestedPath, relativePath, "binary");
  }
  if (entry.sizeBytes > (input.maxBytes ?? 65_536)) {
    return skippedFile(input.requestedPath, relativePath, "too-large");
  }

  const content = readZipEntryContent(input.nested, contentEntry);
  if (content.includes(0)) {
    return skippedFile(input.requestedPath, relativePath, "binary");
  }

  return {
    requestedPath: relativePath,
    entry,
    content: content.toString("utf-8")
  };
}

function skippedFile(
  requestedPath: string,
  relativePath: string,
  reason: ArchiveContentSkippedEntry["reason"]
): ReadNestedArchiveContentFileEntry {
  return {
    requestedPath,
    skipped: { relativePath, reason }
  };
}

function pickSingleFileSkip(
  result: ReadNestedArchiveContentFilesResult,
  file: ReadNestedArchiveContentFileEntry | undefined
): ArchiveContentSkippedEntry | undefined {
  if (result.skipped?.reason === "too-large") {
    return result.skipped;
  }

  return file?.skipped ?? result.skipped;
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

function skippedFilesResult(
  input: {
    sourceArchive: string;
    embeddedArchivePath: string;
    relativePaths: string[];
  },
  relativePath: string,
  reason: ArchiveContentSkippedEntry["reason"],
  embeddedArchiveMetadata?: ModArchiveMetadata
): ReadNestedArchiveContentFilesResult {
  return {
    sourceArchive: input.sourceArchive,
    embeddedArchivePath: input.embeddedArchivePath,
    embeddedArchiveMetadata,
    files: input.relativePaths.map((requestedPath) => {
      return {
        requestedPath,
        skipped: { relativePath: requestedPath, reason }
      };
    }),
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
