import { basename } from "node:path";

import {
  discoverModArchives,
  readModArchiveMetadata,
  type ModArchiveCandidate,
  type ModArchiveMetadata,
  type ModArchiveSource
} from "@mcpskill/jar-source-adapter";

import type { ResolvableExternalModRequest } from "./external-mod-resolution-request.js";

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

export async function resolveLocalModArchiveEvidence(input: {
  request: ResolvableExternalModRequest;
  workspaceRoot?: string;
}): Promise<McpServerLocalModArchiveResolutionResult | undefined> {
  if (!input.workspaceRoot || input.request.platform === "maven") {
    return undefined;
  }

  const discovered = await discoverModArchives({
    workspaceRoot: input.workspaceRoot,
    maxArchives: MAX_LOCAL_ARCHIVES
  });
  const warnings: McpServerLocalModArchiveWarning[] = [];
  const candidates: McpServerLocalModArchiveCandidate[] = [];

  for (const archive of discovered.archives) {
    const candidate = await buildLocalCandidate(input.request, archive, warnings);

    if (candidate) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    return undefined;
  }

  return {
    source: "local_archive",
    query: input.request.query,
    candidates: candidates.sort(compareLocalCandidates),
    warnings,
    scannedArchives: discovered.archives.length,
    truncated: discovered.truncated,
    remoteLookupSkipped: true
  };
}

async function buildLocalCandidate(
  request: ResolvableExternalModRequest & {
    platform: "modrinth" | "curseforge";
  },
  archive: ModArchiveCandidate,
  warnings: McpServerLocalModArchiveWarning[]
): Promise<McpServerLocalModArchiveCandidate | undefined> {
  const metadata = await readArchiveMetadata(archive, warnings);

  if (!metadata) {
    return undefined;
  }

  const score = scoreLocalMatch(request, archive, metadata);

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
    fileName: basename(archive.archivePath),
    archivePath: archive.archivePath,
    relativePath: archive.relativePath,
    archiveSource: archive.source,
    metadataPath: metadata.metadataPath,
    requiresConfirmation: false,
    cachePolicy: "metadata_only"
  };
}

async function readArchiveMetadata(
  archive: ModArchiveCandidate,
  warnings: McpServerLocalModArchiveWarning[]
): Promise<ModArchiveMetadata | undefined> {
  try {
    return await readModArchiveMetadata(archive.archivePath);
  } catch (error) {
    warnings.push({
      code: "local_archive_metadata_unreadable",
      message: `Could not read mod metadata from ${archive.relativePath}: ${toMessage(error)}`,
      relativePath: archive.relativePath
    });
    return undefined;
  }
}

function scoreLocalMatch(
  request: ResolvableExternalModRequest & {
    platform: "modrinth" | "curseforge";
  },
  archive: ModArchiveCandidate,
  metadata: ModArchiveMetadata
): LocalMatchScore | undefined {
  if (normalizeText(metadata.loader) !== normalizeText(request.loader)) {
    return undefined;
  }

  const query = normalizeText(request.query);
  const values = [
    metadata.modId,
    metadata.name,
    archive.relativePath,
    basename(archive.archivePath)
  ].filter((value): value is string => Boolean(value));

  if (!matchesQuery(query, values)) {
    return undefined;
  }

  return {
    confidence: isExactMetadataMatch(query, metadata) ? "high" : "medium",
    reasons: buildMatchReasons(request, archive, metadata, query)
  };
}

function buildMatchReasons(
  request: ResolvableExternalModRequest & {
    platform: "modrinth" | "curseforge";
  },
  archive: ModArchiveCandidate,
  metadata: ModArchiveMetadata,
  query: string
): string[] {
  const reasons: string[] = [];

  if (normalizeText(metadata.modId) === query) {
    reasons.push(`matched local mod id ${metadata.modId}`);
  }
  if (metadata.name && normalizeText(metadata.name) === query) {
    reasons.push(`matched local mod name ${metadata.name}`);
  }
  if (reasons.length === 0) {
    reasons.push(`matched local archive path ${archive.relativePath}`);
  }

  reasons.push(`loader ${metadata.loader} matched requested loader`);
  reasons.push(
    `local metadata does not declare Minecraft version ${request.minecraftVersion}`
  );

  return reasons;
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
