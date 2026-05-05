import { basename } from "node:path";

import {
  discoverModArchives,
  type ArchiveContentCache,
  type ModArchiveCandidate,
  type ModArchiveMetadata,
  type ModArchiveSource
} from "@mcpskill/jar-source-adapter";

import type { McpServerExternalModResolutionRequest } from "../resolution/external-mod-resolution-request.js";
import {
  createLocalModArchiveInspectionCacheStats,
  inspectLocalModArchive,
  type LocalModArchiveInspectionCacheStats,
  type LocalModArchiveInspectionWarning
} from "./external-mod-local-archive-inspection.js";
import {
  collectMetadataOwners,
  findLoaderDependencyRequester,
  formatRequesterReference,
  type LocalArchiveInspectionRecord,
  type McpServerLocalModArchiveRequester
} from "./external-mod-local-archive-requester.js";

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
  loaderDependencyRequester?: McpServerLocalModArchiveRequester;
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
  const inspections = await inspectLocalArchives({
    archives: discovered.archives,
    warnings,
    cache: input.cache,
    cacheStats
  });
  const loaderDependencyRequester = request.loaderDependency?.requestedBy
    ? findLoaderDependencyRequester(
        request,
        inspections.flatMap(collectMetadataOwners)
      )
    : undefined;

  for (const record of inspections) {
    candidates.push(
      ...(await inspectArchiveForLocalCandidates(
        request,
        record,
        loaderDependencyRequester
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
  embeddedArchivePath?: string,
  loaderDependencyRequester?: McpServerLocalModArchiveRequester
): Promise<McpServerLocalModArchiveCandidate | undefined> {
  const candidateRequester = isLoaderDependencyMetadataMatch(request, metadata)
    ? loaderDependencyRequester
    : undefined;
  const score = scoreLocalMatch(
    request,
    archive,
    metadata,
    embeddedArchivePath,
    candidateRequester
  );

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
    ...(candidateRequester
      ? { loaderDependencyRequester: candidateRequester }
      : {}),
    requiresConfirmation: false,
    cachePolicy: "metadata_only"
  };
}

async function inspectLocalArchives(input: {
  archives: ModArchiveCandidate[];
  warnings: McpServerLocalModArchiveWarning[];
  cache: ArchiveContentCache | undefined;
  cacheStats: LocalModArchiveInspectionCacheStats | undefined;
}): Promise<LocalArchiveInspectionRecord[]> {
  const records: LocalArchiveInspectionRecord[] = [];

  for (const archive of input.archives) {
    const inspection = await inspectLocalModArchive({
      archive,
      cache: input.cache,
      cacheStats: input.cacheStats
    });

    input.warnings.push(...inspection.warnings);
    records.push({ archive, inspection });
  }

  return records;
}

async function inspectArchiveForLocalCandidates(
  request: LocalModArchiveRequest,
  record: LocalArchiveInspectionRecord,
  loaderDependencyRequester: McpServerLocalModArchiveRequester | undefined
): Promise<McpServerLocalModArchiveCandidate[]> {
  const nestedCandidates = await Promise.all(
    record.inspection.nestedArchives.map((nested) =>
      nested.embeddedArchiveMetadata
        ? buildLocalCandidate(
            request,
            record.archive,
            nested.embeddedArchiveMetadata,
            nested.embeddedArchivePath,
            loaderDependencyRequester
          )
        : undefined
    )
  );

  return [
    record.inspection.archiveMetadata
      ? await buildLocalCandidate(
          request,
          record.archive,
          record.inspection.archiveMetadata,
          undefined,
          loaderDependencyRequester
        )
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
  embeddedArchivePath?: string,
  loaderDependencyRequester?: McpServerLocalModArchiveRequester
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
    reasons: buildMatchReasons(
      request,
      archive,
      metadata,
      query,
      embeddedArchivePath,
      loaderDependencyRequester
    )
  };
}

function buildMatchReasons(
  request: LocalModArchiveRequest,
  archive: ModArchiveCandidate,
  metadata: ModArchiveMetadata,
  query: string,
  embeddedArchivePath?: string,
  loaderDependencyRequester?: McpServerLocalModArchiveRequester
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
  if (
    request.loaderDependency &&
    isLoaderDependencyMetadataMatch(request, metadata)
  ) {
    reasons.push(formatLoaderDependencyReason(request.loaderDependency));
    if (loaderDependencyRequester) {
      reasons.push(
        `crash dependency requester ${loaderDependencyRequester.modId} ${loaderDependencyRequester.versionNumber} from ${formatRequesterReference(loaderDependencyRequester)}`
      );
    }
  }

  return reasons;
}

function formatLoaderDependencyReason(
  dependency: NonNullable<LocalModArchiveRequest["loaderDependency"]>
): string {
  const requestedBy = dependency.requestedBy ?? "unknown mod";
  const expected = dependency.expectedRange ?? "unknown range";
  const actual = dependency.actualVersion ?? "unknown version";

  return `crash dependency requested by ${requestedBy} expected ${expected} but log reported ${actual}`;
}

function isLoaderDependencyMetadataMatch(
  request: LocalModArchiveRequest,
  metadata: ModArchiveMetadata
): boolean {
  return Boolean(
    request.loaderDependency &&
      normalizeText(request.loaderDependency.modId) === normalizeText(metadata.modId)
  );
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
