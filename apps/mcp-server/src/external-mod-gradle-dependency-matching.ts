import { parseMavenCoordinate } from "@mcpskill/external-mod-resolver";
import type { GradleDeclaredDependency } from "@mcpskill/gradle-adapter";
import type { ModArchiveMetadata } from "@mcpskill/jar-source-adapter";

import type { McpServerExternalModResolutionRequest } from "./external-mod-resolution-request.js";

export interface GradleDependencyEvidenceMatch {
  dependency: GradleDeclaredDependency & { version: string };
  confidence: "high" | "medium";
  reasons: string[];
  score: number;
  metadata?: ModArchiveMetadata;
  embeddedArchivePath?: string;
}

export function scoreGradleDependencyQuery(
  query: string,
  dependency: GradleDeclaredDependency
): GradleDependencyEvidenceMatch | undefined {
  if (!dependency.version) {
    return undefined;
  }

  const coordinateMatch = scoreCoordinateQuery(query, dependency);
  if (coordinateMatch) {
    return coordinateMatch;
  }

  const normalizedQuery = normalizeText(query);
  const values = [
    dependency.artifact,
    dependency.group,
    dependency.notation,
    `${dependency.group}:${dependency.artifact}`,
    `${dependency.group} ${dependency.artifact}`
  ];

  if (!matchesQuery(normalizedQuery, values)) {
    return undefined;
  }

  const exactArtifact = normalizeText(dependency.artifact) === normalizedQuery;

  return {
    dependency: { ...dependency, version: dependency.version },
    confidence: exactArtifact ? "high" : "medium",
    reasons: [
      exactArtifact
        ? `matched Gradle dependency artifact ${dependency.artifact}`
        : `matched Gradle dependency ${dependency.notation}`,
      `declared in ${dependency.sourceFile}`
    ],
    score: exactArtifact ? 90 : 60
  };
}

export function scoreGradleArchiveMetadata(
  query: string,
  request: McpServerExternalModResolutionRequest,
  dependency: GradleDeclaredDependency & { version: string },
  metadata: ModArchiveMetadata,
  embeddedArchivePath?: string
): GradleDependencyEvidenceMatch | undefined {
  if (
    request.loader &&
    normalizeText(metadata.loader) !== normalizeText(request.loader)
  ) {
    return undefined;
  }

  const normalizedQuery = normalizeText(query);
  const values = [
    metadata.modId,
    metadata.name,
    embeddedArchivePath
  ].filter((value): value is string => Boolean(value));

  if (!matchesQuery(normalizedQuery, values)) {
    return undefined;
  }

  const exactMetadata = isExactMetadataMatch(normalizedQuery, metadata);

  return {
    dependency,
    confidence: exactMetadata ? "high" : "medium",
    reasons: buildMetadataReasons(request, metadata, embeddedArchivePath),
    score: exactMetadata ? 120 : 80,
    metadata,
    embeddedArchivePath
  };
}

export function compareGradleDependencyEvidenceMatches(
  left: GradleDependencyEvidenceMatch,
  right: GradleDependencyEvidenceMatch
): number {
  return (
    right.score - left.score ||
    left.dependency.notation.localeCompare(right.dependency.notation)
  );
}

function scoreCoordinateQuery(
  query: string,
  dependency: GradleDeclaredDependency
): GradleDependencyEvidenceMatch | undefined {
  const parsed = parseMavenCoordinate(query);

  if (
    !parsed ||
    parsed.group !== dependency.group ||
    parsed.artifact !== dependency.artifact
  ) {
    return undefined;
  }
  if (parsed.version && parsed.version !== dependency.version) {
    return undefined;
  }

  return {
    dependency: { ...dependency, version: dependency.version ?? "" },
    confidence: "high",
    reasons: [
      `matched exact Gradle dependency coordinate ${dependency.notation}`,
      `declared in ${dependency.sourceFile}`
    ],
    score: parsed.version ? 110 : 100
  };
}

function buildMetadataReasons(
  request: McpServerExternalModResolutionRequest,
  metadata: ModArchiveMetadata,
  embeddedArchivePath?: string
): string[] {
  return [
    metadata.name
      ? `matched Gradle cache mod metadata ${metadata.name}`
      : `matched Gradle cache mod id ${metadata.modId}`,
    embeddedArchivePath
      ? `metadata found in nested archive ${embeddedArchivePath}`
      : `metadata found at ${metadata.metadataPath}`,
    request.loader
      ? `loader ${metadata.loader} matched requested loader`
      : `Gradle cache metadata declares loader ${metadata.loader}`
  ];
}

function isExactMetadataMatch(
  query: string,
  metadata: ModArchiveMetadata
): boolean {
  return [metadata.modId, metadata.name]
    .filter((value): value is string => Boolean(value))
    .some((value) => normalizeText(value) === query);
}

function matchesQuery(query: string, values: string[]): boolean {
  const tokens = tokenize(query);

  return (
    tokens.length > 0 &&
    tokens.every((token) =>
      values.some((value) => tokenize(value).includes(token))
    )
  );
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
