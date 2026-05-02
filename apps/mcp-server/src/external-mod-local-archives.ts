import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import {
  discoverModArchives,
  normalizeArchivePath,
  readModArchiveMetadataFromBuffer,
  readZipCentralDirectory,
  readZipEntryContent,
  type ModArchiveCandidate,
  type ModArchiveMetadata,
  type ModArchiveSource,
  type ZipEntry
} from "@mcpskill/jar-source-adapter";

import type { McpServerExternalModResolutionRequest } from "./external-mod-resolution-request.js";

type LocalModArchiveRequest = McpServerExternalModResolutionRequest & {
  platform: "modrinth" | "curseforge";
  query: string;
};

export interface McpServerLocalModArchiveResolutionResult {
  source: "local_archive";
  query: string;
  candidates: McpServerLocalModArchiveCandidate[];
  warnings: McpServerLocalModArchiveWarning[];
  scannedArchives: number;
  truncated: boolean;
  remoteLookupSkipped: true;
}

export interface McpServerLocalModArchiveCandidate {
  source: "local_archive";
  confidence: "high" | "medium";
  confidenceReasons: string[];
  modId: string;
  slug: string;
  title: string;
  versionId: string;
  versionNumber: string;
  loaders: string[];
  minecraftVersions: string[];
  fileName: string;
  archivePath: string;
  relativePath: string;
  embeddedArchivePath?: string;
  archiveSource: ModArchiveSource;
  metadataPath: string;
  requiresConfirmation: false;
  cachePolicy: "metadata_only";
}

export interface McpServerLocalModArchiveWarning {
  code: string;
  message: string;
  relativePath?: string;
}

interface LocalMatchScore {
  confidence: McpServerLocalModArchiveCandidate["confidence"];
  reasons: string[];
}

const MAX_LOCAL_ARCHIVES = 512;
const MAX_LOCAL_NESTED_ARCHIVES = 16;
const MAX_LOCAL_NESTED_ARCHIVE_BYTES = 32 * 1024 * 1024;

export async function resolveLocalModArchiveEvidence(input: {
  request: McpServerExternalModResolutionRequest;
  workspaceRoot?: string;
}): Promise<McpServerLocalModArchiveResolutionResult | undefined> {
  const request = toLocalModArchiveRequest(input.request);

  if (!input.workspaceRoot || !request) {
    return undefined;
  }

  const discovered = await discoverModArchives({
    workspaceRoot: input.workspaceRoot,
    maxArchives: MAX_LOCAL_ARCHIVES
  });
  const warnings: McpServerLocalModArchiveWarning[] = [];
  const candidates: McpServerLocalModArchiveCandidate[] = [];

  for (const archive of discovered.archives) {
    candidates.push(
      ...(await inspectArchiveForLocalCandidates(
        request,
        archive,
        warnings
      ))
    );
  }

  if (candidates.length === 0) {
    return undefined;
  }

  return {
    source: "local_archive",
    query: request.query,
    candidates: candidates.sort(compareLocalCandidates),
    warnings,
    scannedArchives: discovered.archives.length,
    truncated: discovered.truncated,
    remoteLookupSkipped: true
  };
}

async function buildLocalCandidate(
  request: LocalModArchiveRequest,
  archive: ModArchiveCandidate,
  metadata: ModArchiveMetadata,
  embeddedArchivePath?: string
): Promise<McpServerLocalModArchiveCandidate | undefined> {
  const score = scoreLocalMatch(request, archive, metadata, embeddedArchivePath);

  if (!score) {
    return undefined;
  }

  return {
    source: "local_archive",
    confidence: score.confidence,
    confidenceReasons: score.reasons,
    modId: metadata.modId,
    slug: metadata.modId,
    title: metadata.name ?? metadata.modId,
    versionId: metadata.version ?? "unknown",
    versionNumber: metadata.version ?? "unknown",
    loaders: [metadata.loader],
    minecraftVersions: [],
    fileName: basename(embeddedArchivePath ?? archive.archivePath),
    archivePath: archive.archivePath,
    relativePath: archive.relativePath,
    embeddedArchivePath,
    archiveSource: archive.source,
    metadataPath: metadata.metadataPath,
    requiresConfirmation: false,
    cachePolicy: "metadata_only"
  };
}

async function inspectArchiveForLocalCandidates(
  request: LocalModArchiveRequest,
  archive: ModArchiveCandidate,
  warnings: McpServerLocalModArchiveWarning[]
): Promise<McpServerLocalModArchiveCandidate[]> {
  const archiveBuffer = await readArchiveBuffer(archive, warnings);

  if (!archiveBuffer) {
    return [];
  }

  const directory = readDirectory(archive, archiveBuffer, warnings);

  if (!directory) {
    return [];
  }

  return [
    await buildTopLevelCandidate(request, archive, archiveBuffer),
    ...(await buildNestedCandidates(request, archive, archiveBuffer, directory, warnings))
  ].filter((candidate): candidate is McpServerLocalModArchiveCandidate =>
    Boolean(candidate)
  );
}

async function readArchiveBuffer(
  archive: ModArchiveCandidate,
  warnings: McpServerLocalModArchiveWarning[]
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
  warnings: McpServerLocalModArchiveWarning[]
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

async function buildTopLevelCandidate(
  request: LocalModArchiveRequest,
  archive: ModArchiveCandidate,
  archiveBuffer: Buffer
): Promise<McpServerLocalModArchiveCandidate | undefined> {
  const metadata = readMetadataSafely(archiveBuffer);
  return metadata ? buildLocalCandidate(request, archive, metadata) : undefined;
}

async function buildNestedCandidates(
  request: LocalModArchiveRequest,
  archive: ModArchiveCandidate,
  archiveBuffer: Buffer,
  directory: ZipEntry[],
  warnings: McpServerLocalModArchiveWarning[]
): Promise<McpServerLocalModArchiveCandidate[]> {
  const candidates: McpServerLocalModArchiveCandidate[] = [];

  for (const entry of collectNestedArchiveEntries(directory)) {
    const embeddedArchivePath = normalizeArchivePath(entry.name);
    if (!embeddedArchivePath) {
      continue;
    }
    if (entry.uncompressedSize > MAX_LOCAL_NESTED_ARCHIVE_BYTES) {
      warnings.push(toNestedWarning(archive, embeddedArchivePath, "too-large"));
      continue;
    }

    const metadata = readNestedMetadata(archive, archiveBuffer, entry, warnings);
    const candidate = metadata
      ? await buildLocalCandidate(
          request,
          archive,
          metadata,
          embeddedArchivePath
        )
      : undefined;

    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
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
  warnings: McpServerLocalModArchiveWarning[]
): ModArchiveMetadata | undefined {
  const embeddedArchivePath = normalizeArchivePath(entry.name);

  if (!embeddedArchivePath) {
    return undefined;
  }

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
): McpServerLocalModArchiveWarning {
  return {
    code: "local_nested_archive_skipped",
    message:
      `Skipped nested archive ${archive.relativePath}!${embeddedArchivePath}: ${reason}.`,
    relativePath: `${archive.relativePath}!${embeddedArchivePath}`
  };
}

function scoreLocalMatch(
  request: LocalModArchiveRequest,
  archive: ModArchiveCandidate,
  metadata: ModArchiveMetadata,
  embeddedArchivePath?: string
): LocalMatchScore | undefined {
  if (
    request.loader &&
    normalizeText(metadata.loader) !== normalizeText(request.loader)
  ) {
    return undefined;
  }

  const query = normalizeText(request.query);
  const values = [
    metadata.modId,
    metadata.name,
    archive.relativePath,
    embeddedArchivePath,
    basename(archive.archivePath)
  ].filter((value): value is string => Boolean(value));

  if (!matchesQuery(query, values)) {
    return undefined;
  }

  return {
    confidence: isExactMetadataMatch(query, metadata) ? "high" : "medium",
    reasons: buildMatchReasons(request, archive, metadata, query, embeddedArchivePath)
  };
}

function buildMatchReasons(
  request: LocalModArchiveRequest,
  archive: ModArchiveCandidate,
  metadata: ModArchiveMetadata,
  query: string,
  embeddedArchivePath?: string
): string[] {
  const reasons: string[] = [];

  if (normalizeText(metadata.modId) === query) {
    reasons.push(`matched local mod id ${metadata.modId}`);
  }
  if (metadata.name && normalizeText(metadata.name) === query) {
    reasons.push(`matched local mod name ${metadata.name}`);
  }
  if (reasons.length === 0) {
    reasons.push(
      `matched local archive path ${formatArchiveReference(archive, embeddedArchivePath)}`
    );
  }

  reasons.push(
    request.loader
      ? `loader ${metadata.loader} matched requested loader`
      : `local metadata declares loader ${metadata.loader}`
  );
  if (request.minecraftVersion) {
    reasons.push(
      `local metadata does not declare Minecraft version ${request.minecraftVersion}`
    );
  }

  return reasons;
}

function toLocalModArchiveRequest(
  request: McpServerExternalModResolutionRequest
): LocalModArchiveRequest | undefined {
  const platform = request.platform;
  const query = request.query;

  if (platform !== "modrinth" && platform !== "curseforge") {
    return undefined;
  }
  if (!query) {
    return undefined;
  }

  return {
    ...request,
    platform,
    query
  };
}

export function formatLocalArchiveCandidateReference(
  candidate: Pick<
    McpServerLocalModArchiveCandidate,
    "relativePath" | "embeddedArchivePath"
  >
): string {
  return candidate.embeddedArchivePath
    ? `${candidate.relativePath}!${candidate.embeddedArchivePath}`
    : candidate.relativePath;
}

function formatArchiveReference(
  archive: ModArchiveCandidate,
  embeddedArchivePath?: string
): string {
  return embeddedArchivePath
    ? `${archive.relativePath}!${embeddedArchivePath}`
    : archive.relativePath;
}

function matchesQuery(query: string, values: string[]): boolean {
  const queryTokens = tokenize(query);

  return (
    queryTokens.length > 0 &&
    queryTokens.every((token) =>
      values.some((value) => tokenize(value).includes(token))
    )
  );
}

function isExactMetadataMatch(
  query: string,
  metadata: ModArchiveMetadata
): boolean {
  return [metadata.modId, metadata.name]
    .filter((value): value is string => Boolean(value))
    .some((value) => normalizeText(value) === query);
}

function compareLocalCandidates(
  left: McpServerLocalModArchiveCandidate,
  right: McpServerLocalModArchiveCandidate
): number {
  if (left.confidence !== right.confidence) {
    return left.confidence === "high" ? -1 : 1;
  }

  return left.relativePath.localeCompare(right.relativePath);
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(" ").filter(Boolean);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
