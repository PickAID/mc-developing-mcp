import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";

export interface ExternalModMetadataCacheLayout {
  root: string;
  mavenMetadataDir: string;
}

export interface MavenMetadataCacheEntry {
  kind: "maven-metadata";
  sourceUrl: string;
  value: string;
  updatedAt: string;
}

export interface MavenMetadataCache {
  read(url: URL): Promise<MavenMetadataCacheEntry | undefined>;
  write(url: URL, value: string): Promise<void>;
}

export function resolveExternalModMetadataCacheLayout(
  runtimeRoot: string
): ExternalModMetadataCacheLayout {
  const root = join(normalize(runtimeRoot), "external-mod-resolver");

  return {
    root,
    mavenMetadataDir: join(root, "metadata", "maven")
  };
}

export function createMemoryMavenMetadataCache(): MavenMetadataCache {
  const records = new Map<string, MavenMetadataCacheEntry>();

  return {
    async read(url) {
      return records.get(url.toString());
    },
    async write(url, value) {
      records.set(url.toString(), {
        kind: "maven-metadata",
        sourceUrl: url.toString(),
        value,
        updatedAt: new Date().toISOString()
      });
    }
  };
}

export function createFileMavenMetadataCache(
  runtimeRoot: string
): MavenMetadataCache {
  const layout = resolveExternalModMetadataCacheLayout(runtimeRoot);

  return {
    async read(url) {
      try {
        const raw = await readFile(resolveMetadataPath(layout, url), "utf-8");
        return readCacheEntry(JSON.parse(raw));
      } catch (error) {
        if (isFileNotFound(error)) {
          return undefined;
        }

        throw error;
      }
    },
    async write(url, value) {
      await mkdir(layout.mavenMetadataDir, { recursive: true });
      const entry: MavenMetadataCacheEntry = {
        kind: "maven-metadata",
        sourceUrl: url.toString(),
        value,
        updatedAt: new Date().toISOString()
      };

      await writeFile(
        resolveMetadataPath(layout, url),
        `${JSON.stringify(entry, null, 2)}\n`
      );
    }
  };
}

function resolveMetadataPath(
  layout: ExternalModMetadataCacheLayout,
  url: URL
): string {
  return join(layout.mavenMetadataDir, `${encodeURIComponent(url.toString())}.json`);
}

function readCacheEntry(value: unknown): MavenMetadataCacheEntry {
  if (!isRecord(value)) {
    throw new Error("external mod metadata cache entry must be an object.");
  }

  const kind = stringField(value, "kind");
  if (kind !== "maven-metadata") {
    throw new Error(`unsupported external mod metadata cache kind ${kind}.`);
  }

  return {
    kind,
    sourceUrl: stringField(value, "sourceUrl"),
    value: stringField(value, "value"),
    updatedAt: stringField(value, "updatedAt")
  };
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`metadata cache field ${field} must be a non-empty string.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
