import { readFile } from "node:fs/promises";

import {
  normalizeArchivePath,
  readModArchiveMetadataFromBuffer,
  readZipCentralDirectory,
  readZipEntryContent,
  type ArchiveContentCache,
  type ModArchiveCandidate,
  type ModArchiveMetadata,
  type ZipEntry
} from "@mcpskill/jar-source-adapter";

export interface LocalModArchiveInspection {
  archiveMetadata?: ModArchiveMetadata;
  nestedArchives: NestedLocalModArchiveInspection[];
  warnings: LocalModArchiveInspectionWarning[];
}

export interface NestedLocalModArchiveInspection {
  embeddedArchivePath: string;
  embeddedArchiveMetadata?: ModArchiveMetadata;
}

export interface LocalModArchiveInspectionWarning {
  code: string;
  message: string;
  relativePath?: string;
}

export interface LocalModArchiveInspectionCacheStats {
  archiveInspectionHits: number;
  archiveInspectionMisses: number;
}

const MAX_LOCAL_NESTED_ARCHIVES = 16;
const MAX_LOCAL_NESTED_ARCHIVE_BYTES = 32 * 1024 * 1024;

export function createLocalModArchiveInspectionCacheStats():
  LocalModArchiveInspectionCacheStats {
  return {
    archiveInspectionHits: 0,
    archiveInspectionMisses: 0
  };
}

export async function inspectLocalModArchive(input: {
  archive: ModArchiveCandidate;
  cache?: ArchiveContentCache;
  cacheStats?: LocalModArchiveInspectionCacheStats;
}): Promise<LocalModArchiveInspection> {
  if (!input.cache) {
    return await inspectLocalModArchiveUncached(input.archive);
  }

  const cached = await input.cache.getArchiveInspection({
    sourceArchive: input.archive.archivePath,
    cacheKey: buildInspectionCacheKey(),
    load: () => inspectLocalModArchiveUncached(input.archive)
  });

  if (cached.cacheHit) {
    incrementCacheStat(input.cacheStats, "archiveInspectionHits");
  } else {
    incrementCacheStat(input.cacheStats, "archiveInspectionMisses");
  }

  return cached.value;
}

async function inspectLocalModArchiveUncached(
  archive: ModArchiveCandidate
): Promise<LocalModArchiveInspection> {
  const warnings: LocalModArchiveInspectionWarning[] = [];
  const archiveBuffer = await readArchiveBuffer(archive, warnings);

  if (!archiveBuffer) {
    return emptyInspection(warnings);
  }

  const directory = readDirectory(archive, archiveBuffer, warnings);

  if (!directory) {
    return emptyInspection(warnings);
  }

  return {
    archiveMetadata: readMetadataSafely(archiveBuffer),
    nestedArchives: readNestedArchives(archive, archiveBuffer, directory, warnings),
    warnings
  };
}

async function readArchiveBuffer(
  archive: ModArchiveCandidate,
  warnings: LocalModArchiveInspectionWarning[]
): Promise<Buffer | undefined> {
  try {
    return await readFile(archive.archivePath);
  } catch (error) {
    warnings.push({
      code: "local_archive_unreadable",
      message: `Could not read local archive ${archive.relativePath}: ${toMessage(error)}`,
      relativePath: archive.relativePath
    });
    return undefined;
  }
}

function readDirectory(
  archive: ModArchiveCandidate,
  archiveBuffer: Buffer,
  warnings: LocalModArchiveInspectionWarning[]
): ZipEntry[] | undefined {
  try {
    return readZipCentralDirectory(archiveBuffer);
  } catch (error) {
    warnings.push({
      code: "local_archive_directory_unreadable",
      message:
        `Could not read ZIP directory from ${archive.relativePath}: ${toMessage(error)}`,
      relativePath: archive.relativePath
    });
    return undefined;
  }
}

function readNestedArchives(
  archive: ModArchiveCandidate,
  archiveBuffer: Buffer,
  directory: ZipEntry[],
  warnings: LocalModArchiveInspectionWarning[]
): NestedLocalModArchiveInspection[] {
  return collectNestedArchiveEntries(directory).flatMap((entry) => {
    const embeddedArchivePath = normalizeArchivePath(entry.name);
    if (!embeddedArchivePath) {
      return [];
    }
    if (entry.uncompressedSize > MAX_LOCAL_NESTED_ARCHIVE_BYTES) {
      warnings.push(toNestedWarning(archive, embeddedArchivePath, "too-large"));
      return [];
    }

    return [{
      embeddedArchivePath,
      embeddedArchiveMetadata: readNestedMetadata(
        archive,
        archiveBuffer,
        entry,
        embeddedArchivePath,
        warnings
      )
    }];
  });
}

function collectNestedArchiveEntries(directory: ZipEntry[]): ZipEntry[] {
  return directory
    .filter((entry) => normalizeArchivePath(entry.name)?.endsWith(".jar") === true)
    .slice(0, MAX_LOCAL_NESTED_ARCHIVES);
}

function readNestedMetadata(
  archive: ModArchiveCandidate,
  archiveBuffer: Buffer,
  entry: ZipEntry,
  embeddedArchivePath: string,
  warnings: LocalModArchiveInspectionWarning[]
): ModArchiveMetadata | undefined {
  try {
    return readMetadataSafely(readZipEntryContent(archiveBuffer, entry));
  } catch (error) {
    warnings.push({
      code: "local_nested_archive_unreadable",
      message:
        `Could not read nested archive ${archive.relativePath}!${embeddedArchivePath}: ${toMessage(error)}`,
      relativePath: `${archive.relativePath}!${embeddedArchivePath}`
    });
    return undefined;
  }
}

function readMetadataSafely(archiveBuffer: Buffer): ModArchiveMetadata | undefined {
  try {
    return readModArchiveMetadataFromBuffer(archiveBuffer);
  } catch {
    return undefined;
  }
}

function toNestedWarning(
  archive: ModArchiveCandidate,
  embeddedArchivePath: string,
  reason: string
): LocalModArchiveInspectionWarning {
  return {
    code: "local_nested_archive_skipped",
    message:
      `Skipped nested archive ${archive.relativePath}!${embeddedArchivePath}: ${reason}.`,
    relativePath: `${archive.relativePath}!${embeddedArchivePath}`
  };
}

function emptyInspection(
  warnings: LocalModArchiveInspectionWarning[]
): LocalModArchiveInspection {
  return {
    nestedArchives: [],
    warnings
  };
}

function buildInspectionCacheKey(): string {
  return [
    "external-mod-local-archive-inspection",
    "v1",
    MAX_LOCAL_NESTED_ARCHIVES,
    MAX_LOCAL_NESTED_ARCHIVE_BYTES
  ].join(":");
}

function incrementCacheStat(
  cacheStats: LocalModArchiveInspectionCacheStats | undefined,
  key: keyof LocalModArchiveInspectionCacheStats
): void {
  if (cacheStats) {
    cacheStats[key] += 1;
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
