import { readFile } from "node:fs/promises";

import type { ArchiveContentCache } from "./archive-content-cache.js";
import {
  normalizeArchivePath,
  readZipCentralDirectory,
  type ZipEntry
} from "./java-source-archive.js";
import { findNestedArchiveClassOwners } from "./nested-archive.js";
import type { ModArchiveMetadata } from "./mod-archives.js";

export type ArchiveClassOwnerMatchKind = "exact" | "nested";

export interface ArchiveClassOwnerMatch {
  sourceArchive: string;
  requestedClassName: string;
  binaryName: string;
  relativePath: string;
  sizeBytes: number;
  matchKind: ArchiveClassOwnerMatchKind;
  embeddedArchivePath?: string;
  embeddedArchiveMetadata?: ModArchiveMetadata;
}

export interface FindArchiveSetClassOwnersResult {
  matches: ArchiveClassOwnerMatch[];
  searchedArchives: number;
  truncated: boolean;
  cache?: ArchiveClassOwnerCacheMetadata;
}

export interface ArchiveClassOwnerCacheMetadata {
  centralDirectoryHits: number;
  centralDirectoryMisses: number;
}

export interface ExtractJavaClassReferencesOptions {
  ignoredPackagePrefixes?: string[];
  limit?: number;
}

const DEFAULT_MAX_CLASS_REFERENCES = 16;

export function extractJavaClassReferences(
  text: string | undefined,
  options: ExtractJavaClassReferencesOptions = {}
): string[] {
  if (!text) {
    return [];
  }

  const references: string[] = [];
  const ignoredPackagePrefixes = options.ignoredPackagePrefixes ?? [];
  const limit = normalizeLimit(options.limit, DEFAULT_MAX_CLASS_REFERENCES);
  const dottedPattern = /\b(?:[a-z_][\w$]*\.){2,}[A-Z_$][\w$]*(?:\$[A-Za-z_$][\w$]*)*/g;
  const pathPattern = /\b(?:[a-z_][\w$]*\/){2,}[A-Z_$][\w$]*(?:\$[A-Za-z_$][\w$]*)*\.class\b/g;

  for (const match of text.matchAll(dottedPattern)) {
    addClassReference(references, match[0], ignoredPackagePrefixes, limit);
  }
  for (const match of text.matchAll(pathPattern)) {
    addClassReference(references, match[0], ignoredPackagePrefixes, limit);
  }

  return references;
}

export async function findArchiveSetClassOwners(input: {
  sourceArchives: string[];
  classNames: string[];
  maxArchives?: number;
  maxMatches?: number;
  includeNested?: boolean;
  cache?: ArchiveContentCache;
}): Promise<FindArchiveSetClassOwnersResult> {
  const requestedClasses = normalizeRequestedClasses(input.classNames);
  const maxArchives = normalizeLimit(input.maxArchives, Number.POSITIVE_INFINITY);
  const maxMatches = normalizeLimit(input.maxMatches, Number.POSITIVE_INFINITY);
  const matches: ArchiveClassOwnerMatch[] = [];
  const cacheMetadata: ArchiveClassOwnerCacheMetadata = {
    centralDirectoryHits: 0,
    centralDirectoryMisses: 0
  };
  let searchedArchives = 0;
  let truncated = input.sourceArchives.length > maxArchives;

  if (requestedClasses.length === 0 || maxArchives === 0 || maxMatches === 0) {
    return {
      matches,
      searchedArchives,
      truncated: truncated || input.sourceArchives.length > 0,
      cache: cacheMetadata
    };
  }

  for (const sourceArchive of input.sourceArchives.slice(0, maxArchives)) {
    searchedArchives += 1;

    const directory = await readArchiveDirectory(sourceArchive, input.cache);
    if (directory.cacheHit) {
      cacheMetadata.centralDirectoryHits += 1;
    } else {
      cacheMetadata.centralDirectoryMisses += 1;
    }

    for (const entry of collectClassEntries(directory.entries)) {
      for (const requestedClassName of requestedClasses) {
        const matchKind = getClassMatchKind(
          entry.binaryName,
          requestedClassName,
          input.includeNested ?? false
        );
        if (!matchKind) {
          continue;
        }
        if (matches.length >= maxMatches) {
          truncated = true;
          break;
        }
        matches.push({
          sourceArchive,
          requestedClassName,
          binaryName: entry.binaryName,
          relativePath: entry.relativePath,
          sizeBytes: entry.sizeBytes,
          matchKind
        });
      }
      if (matches.length >= maxMatches) {
        break;
      }
    }
    if (matches.length >= maxMatches) {
      break;
    }
    if (matches.length < maxMatches) {
      const nested = await findNestedArchiveClassOwners({
        sourceArchive,
        classNames: requestedClasses,
        maxMatches: maxMatches - matches.length,
        includeNested: input.includeNested
      });

      matches.push(...nested.matches);
      truncated = truncated || nested.truncated;
    }
  }

  return {
    matches,
    searchedArchives,
    truncated,
    cache: cacheMetadata
  };
}

function addClassReference(
  references: string[],
  rawReference: string,
  ignoredPackagePrefixes: string[],
  limit: number
): void {
  if (references.length >= limit) {
    return;
  }

  const className = normalizeClassReference(rawReference);
  if (!className || references.includes(className)) {
    return;
  }
  if (ignoredPackagePrefixes.some((prefix) => className.startsWith(prefix))) {
    return;
  }

  references.push(className);
}

function normalizeRequestedClasses(classNames: string[]): string[] {
  const normalized: string[] = [];

  for (const className of classNames) {
    const reference = normalizeClassReference(className);
    if (reference && !normalized.includes(reference)) {
      normalized.push(reference);
    }
  }

  return normalized;
}

function normalizeClassReference(rawReference: string): string | undefined {
  const withoutDecorators = rawReference
    .replace(/^[\s"'`]+|[\s"'`,;:)]+$/g, "")
    .replace(/\.class$/i, "");
  const dotted = withoutDecorators.replaceAll("/", ".");

  if (!dotted.includes(".") || dotted.startsWith(".") || dotted.endsWith(".")) {
    return undefined;
  }

  const simpleName = dotted.split(".").at(-1) ?? "";
  return /^[A-Z_$]/.test(simpleName) ? dotted : undefined;
}

async function readArchiveDirectory(
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

interface CollectedClassEntry {
  binaryName: string;
  relativePath: string;
  sizeBytes: number;
}

function collectClassEntries(entries: ZipEntry[]): CollectedClassEntry[] {
  return entries.flatMap((entry) => {
    if (entry.name.endsWith("/") || !entry.name.endsWith(".class")) {
      return [];
    }

    const relativePath = normalizeArchivePath(entry.name);
    if (!relativePath) {
      return [];
    }

    return [
      {
        binaryName: relativePath.replace(/\.class$/i, "").replaceAll("/", "."),
        relativePath,
        sizeBytes: entry.uncompressedSize
      }
    ];
  });
}

function getClassMatchKind(
  binaryName: string,
  requestedClassName: string,
  includeNested: boolean
): ArchiveClassOwnerMatchKind | undefined {
  if (binaryName === requestedClassName) {
    return "exact";
  }
  if (includeNested && binaryName.startsWith(`${requestedClassName}$`)) {
    return "nested";
  }

  return undefined;
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  return Math.max(0, Math.floor(limit ?? fallback));
}
