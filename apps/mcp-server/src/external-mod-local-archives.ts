import { basename } from "node:path";

import {
  discoverModArchives,
  type ArchiveContentCache,
  type ModArchiveCandidate,
  type ModArchiveMetadata,
  type ModArchiveSource
} from "@mcpskill/jar-source-adapter";

import type { McpServerExternalModResolutionRequest } from "./external-mod-resolution-request.js";
import {
  createLocalModArchiveInspectionCacheStats,
  inspectLocalModArchive,
  type LocalModArchiveInspectionCacheStats,
  type LocalModArchiveInspectionWarning
} from "./external-mod-local-archive-inspection.js";

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
  cache?: LocalModArchiveInspectionCacheStats;
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

export type McpServerLocalModArchiveWarning = LocalModArchiveInspectionWarning;

interface LocalMatchScore {
  confidence: McpServerLocalModArchiveCandidate["confidence"];
  reasons: string[];
}

const MAX_LOCAL_ARCHIVES = 512;

export async function resolveLocalModArchiveEvidence(input: {
  request: McpServerExternalModResolutionRequest;
  workspaceRoot?: string;
  cache?: ArchiveContentCache;
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
  const cacheStats = input.cache
    ? createLocalModArchiveInspectionCacheStats()
    : undefined;

  for (const archive of discovered.archives) {
    candidates.push(
      ...(await inspectArchiveForLocalCandidates(
        request,
        archive,
        warnings,
        input.cache,
        cacheStats
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
    remoteLookupSkipped: true,
    cache: cacheStats
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
  warnings: McpServerLocalModArchiveWarning[],
  cache: ArchiveContentCache | undefined,
  cacheStats: LocalModArchiveInspectionCacheStats | undefined
): Promise<McpServerLocalModArchiveCandidate[]> {
  const inspection = await inspectLocalModArchive({
    archive,
    cache,
    cacheStats
  });
  const nestedCandidates = await Promise.all(
    inspection.nestedArchives.map((nested) =>
      nested.embeddedArchiveMetadata
        ? buildLocalCandidate(
            request,
            archive,
            nested.embeddedArchiveMetadata,
            nested.embeddedArchivePath
          )
        : undefined
    )
  );

  warnings.push(...inspection.warnings);

  return [
    inspection.archiveMetadata
      ? await buildLocalCandidate(request, archive, inspection.archiveMetadata)
      : undefined,
    ...nestedCandidates
  ].filter((candidate): candidate is McpServerLocalModArchiveCandidate =>
    Boolean(candidate)
  );
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
