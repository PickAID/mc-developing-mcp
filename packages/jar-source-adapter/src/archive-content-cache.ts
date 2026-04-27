import { readFile, stat } from "node:fs/promises";

import { readZipCentralDirectory, type ZipEntry } from "./java-source-archive.js";

export interface ArchiveContentCacheOptions {
  maxCentralDirectories?: number;
  maxTextFiles?: number;
}

export interface ArchiveContentCache {
  readCentralDirectory(sourceArchive: string): Promise<CachedValue<ZipEntry[]>>;
  getTextFile<T>(input: {
    sourceArchive: string;
    relativePath: string;
    maxBytes: number;
    load: () => Promise<T>;
  }): Promise<CachedValue<T>>;
  clear(): void;
  size(): ArchiveContentCacheSize;
}

export interface ArchiveContentCacheSize {
  centralDirectories: number;
  textFiles: number;
}

export interface CachedValue<T> {
  value: T;
  cacheHit: boolean;
}

export function createArchiveContentCache(
  options: ArchiveContentCacheOptions = {}
): ArchiveContentCache {
  const maxCentralDirectories = normalizeLimit(options.maxCentralDirectories, 32);
  const maxTextFiles = normalizeLimit(options.maxTextFiles, 128);
  const centralDirectories = new Map<string, ZipEntry[]>();
  const textFiles = new Map<string, unknown>();

  return {
    async readCentralDirectory(sourceArchive) {
      const key = await buildArchiveFingerprint(sourceArchive);
      const cached = getCached(centralDirectories, key);
      if (cached) {
        return { value: cached, cacheHit: true };
      }

      const entries = readZipCentralDirectory(await readFile(sourceArchive));
      centralDirectories.set(key, entries);
      evictOverflow(centralDirectories, maxCentralDirectories);

      return { value: entries, cacheHit: false };
    },
    async getTextFile<T>(input: {
      sourceArchive: string;
      relativePath: string;
      maxBytes: number;
      load: () => Promise<T>;
    }) {
      const key = [
        await buildArchiveFingerprint(input.sourceArchive),
        input.relativePath,
        input.maxBytes
      ].join("|");
      const cached = getCached(textFiles, key);
      if (cached !== undefined) {
        return { value: cached as T, cacheHit: true };
      }

      const value = await input.load();
      textFiles.set(key, value);
      evictOverflow(textFiles, maxTextFiles);

      return { value, cacheHit: false };
    },
    clear() {
      centralDirectories.clear();
      textFiles.clear();
    },
    size() {
      return {
        centralDirectories: centralDirectories.size,
        textFiles: textFiles.size
      };
    }
  };
}

async function buildArchiveFingerprint(sourceArchive: string): Promise<string> {
  const details = await stat(sourceArchive);
  return [
    sourceArchive,
    details.size,
    Math.floor(details.mtimeMs)
  ].join("|");
}

function getCached<T>(cache: Map<string, T>, key: string): T | undefined {
  if (!cache.has(key)) {
    return undefined;
  }

  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value as T);
  return value;
}

function evictOverflow<T>(cache: Map<string, T>, maxEntries: number): void {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) {
      return;
    }
    cache.delete(oldestKey);
  }
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  return Math.max(1, Math.floor(limit ?? fallback));
}
