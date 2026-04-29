import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import {
  normalizeArchivePath,
  readZipCentralDirectory,
  readZipEntryContent
} from "./java-source-archive.js";

export type ModArchiveSource =
  | "mods-directory"
  | "run-mods-directory"
  | "workspace-libs";

export interface ModArchiveCandidate {
  archivePath: string;
  relativePath: string;
  source: ModArchiveSource;
}

export type ModArchiveLoader = "fabric" | "quilt" | "forge" | "neoforge";

export interface ModArchiveMetadata {
  loader: ModArchiveLoader;
  modId: string;
  name?: string;
  version?: string;
  metadataPath: string;
}

export interface DiscoverModArchivesResult {
  archives: ModArchiveCandidate[];
  truncated: boolean;
}

const METADATA_PATHS = [
  "fabric.mod.json",
  "quilt.mod.json",
  "META-INF/neoforge.mods.toml",
  "META-INF/mods.toml"
];

export async function discoverModArchives(input: {
  workspaceRoot: string;
  maxArchives?: number;
}): Promise<DiscoverModArchivesResult> {
  const workspaceRoot = resolve(input.workspaceRoot);
  const maxArchives = normalizeLimit(input.maxArchives);
  const candidates: ModArchiveCandidate[] = [];

  for (const root of buildModArchiveRoots(workspaceRoot)) {
    for (const archivePath of await listJarFiles(root.absolutePath)) {
      candidates.push({
        archivePath,
        relativePath: relative(workspaceRoot, archivePath).replaceAll("\\", "/"),
        source: root.source
      });
    }
  }

  const archives = dedupeArchives(candidates).sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );

  return {
    archives: archives.slice(0, maxArchives),
    truncated: archives.length > maxArchives
  };
}

export async function readModArchiveMetadata(
  sourceArchive: string
): Promise<ModArchiveMetadata | undefined> {
  return readModArchiveMetadataFromBuffer(await readFile(sourceArchive));
}

export function readModArchiveMetadataFromBuffer(
  archive: Buffer
): ModArchiveMetadata | undefined {
  const entries = readZipCentralDirectory(archive);

  for (const metadataPath of METADATA_PATHS) {
    const entry = entries.find(
      (candidate) => normalizeArchivePath(candidate.name) === metadataPath
    );
    if (!entry) {
      continue;
    }

    const content = readZipEntryContent(archive, entry).toString("utf-8");
    const metadata = parseMetadataFile(metadataPath, content);
    if (metadata) {
      return metadata;
    }
  }

  return undefined;
}

function buildModArchiveRoots(workspaceRoot: string): Array<{
  absolutePath: string;
  source: ModArchiveSource;
}> {
  return [
    {
      absolutePath: join(workspaceRoot, "mods"),
      source: "mods-directory" satisfies ModArchiveSource
    },
    {
      absolutePath: join(workspaceRoot, "run", "mods"),
      source: "run-mods-directory" satisfies ModArchiveSource
    },
    {
      absolutePath: join(workspaceRoot, "run", "client", "mods"),
      source: "run-mods-directory" satisfies ModArchiveSource
    },
    {
      absolutePath: join(workspaceRoot, "libs"),
      source: "workspace-libs" satisfies ModArchiveSource
    },
    {
      absolutePath: join(workspaceRoot, "build", "libs"),
      source: "workspace-libs" satisfies ModArchiveSource
    }
  ];
}

async function listJarFiles(root: string): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isSkippablePathError(error)) {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && isRuntimeJarName(entry.name))
    .map((entry) => join(root, entry.name));
}

function isRuntimeJarName(name: string): boolean {
  return (
    name.endsWith(".jar") &&
    !/(?:^|[-_.])(sources|javadoc)\.jar$/i.test(name)
  );
}

function dedupeArchives(archives: ModArchiveCandidate[]): ModArchiveCandidate[] {
  const seen = new Set<string>();
  const deduped: ModArchiveCandidate[] = [];

  for (const archive of archives) {
    if (seen.has(archive.archivePath)) {
      continue;
    }
    seen.add(archive.archivePath);
    deduped.push(archive);
  }

  return deduped;
}

function isSkippablePathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Math.floor(limit));
}

function parseMetadataFile(
  metadataPath: string,
  content: string
): ModArchiveMetadata | undefined {
  if (metadataPath === "fabric.mod.json") {
    return parseFabricMetadata(metadataPath, content);
  }
  if (metadataPath === "quilt.mod.json") {
    return parseQuiltMetadata(metadataPath, content);
  }

  return parseTomlMetadata(metadataPath, content);
}

function parseFabricMetadata(
  metadataPath: string,
  content: string
): ModArchiveMetadata | undefined {
  const value = parseJsonRecord(content);
  const modId = stringField(value, "id");
  if (!modId) {
    return undefined;
  }

  return {
    loader: "fabric",
    modId,
    name: stringField(value, "name"),
    version: stringField(value, "version"),
    metadataPath
  };
}

function parseQuiltMetadata(
  metadataPath: string,
  content: string
): ModArchiveMetadata | undefined {
  const value = parseJsonRecord(content);
  const loader = recordField(value, "quilt_loader");
  const modId = stringField(loader, "id");
  if (!modId) {
    return undefined;
  }

  return {
    loader: "quilt",
    modId,
    name: stringField(recordField(loader, "metadata"), "name"),
    version: stringField(loader, "version"),
    metadataPath
  };
}

function parseTomlMetadata(
  metadataPath: string,
  content: string
): ModArchiveMetadata | undefined {
  const modId = readTomlString(content, "modId");
  if (!modId) {
    return undefined;
  }

  return {
    loader: metadataPath.includes("neoforge") ? "neoforge" : "forge",
    modId,
    name: readTomlString(content, "displayName"),
    version: readTomlString(content, "version"),
    metadataPath
  };
}

function readTomlString(content: string, key: string): string | undefined {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, "m");
  const raw = content.match(pattern)?.[1]?.trim();
  if (!raw) {
    return undefined;
  }

  return raw.replace(/^["']|["']$/g, "");
}

function parseJsonRecord(content: string): Record<string, unknown> {
  try {
    const value = JSON.parse(content);
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function recordField(
  record: Record<string, unknown>,
  field: string
): Record<string, unknown> {
  const value = record[field];
  return isRecord(value) ? value : {};
}

function stringField(
  record: Record<string, unknown>,
  field: string
): string | undefined {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
