import { basename, normalize } from "node:path";

import {
  buildRepositoryMavenArtifact,
  type ExternalModMavenArtifact
} from "@mcpskill/external-mod-resolver";
import {
  discoverDeclaredDependencyBinaryArchives,
  isDeclaredDependencyBinaryFile,
  readGradleDeclaredDependencies,
  type GradleDeclaredDependency,
  type GradleSourceArchiveCandidate
} from "@mcpskill/gradle-adapter";
import type {
  ArchiveContentCache,
  ModArchiveCandidate
} from "@mcpskill/jar-source-adapter";

import type {
  McpServerExternalModMavenRepository,
  McpServerExternalModResolutionRequest
} from "./external-mod-resolution-request.js";
import {
  createLocalModArchiveInspectionCacheStats,
  inspectLocalModArchive,
  type LocalModArchiveInspectionCacheStats,
  type LocalModArchiveInspectionWarning
} from "./external-mod-local-archive-inspection.js";
import {
  compareGradleDependencyEvidenceMatches,
  scoreGradleArchiveMetadata,
  scoreGradleDependencyQuery,
  type GradleDependencyEvidenceMatch
} from "./external-mod-gradle-dependency-matching.js";
import type { GradleSourceArchiveDiscoveryOptions } from "./gradle-source-archive-lookup.js";

export interface McpServerGradleDependencyArchiveResolutionResult {
  source: "gradle_dependency_archive";
  query: string;
  candidates: McpServerGradleDependencyArchiveCandidate[];
  warnings: LocalModArchiveInspectionWarning[];
  scannedDependencies: number;
  scannedArchives: number;
  remoteLookupSkipped: true;
  cache?: LocalModArchiveInspectionCacheStats;
}

export interface McpServerGradleDependencyArchiveCandidate {
  source: "gradle_dependency_archive";
  confidence: "high" | "medium";
  confidenceReasons: string[];
  group: string;
  artifact: string;
  version: string;
  coordinate: string;
  sourceFile: string;
  modId?: string;
  title?: string;
  loader?: string;
  metadataPath?: string;
  embeddedArchivePath?: string;
  archivePath: string;
  fileName: string;
  archiveSource: GradleSourceArchiveCandidate["source"];
  archiveReason: string;
  mavenArtifacts: ExternalModMavenArtifact[];
  requiresConfirmation: false;
  cachePolicy: "metadata_only";
}

export async function resolveGradleDependencyArchiveEvidence(input: {
  request: McpServerExternalModResolutionRequest;
  workspaceRoot?: string;
  discovery?: GradleSourceArchiveDiscoveryOptions;
  mavenRepositories?: McpServerExternalModMavenRepository[];
  cache?: ArchiveContentCache;
}): Promise<McpServerGradleDependencyArchiveResolutionResult | undefined> {
  if (!input.workspaceRoot || input.discovery?.enabled === false) {
    return undefined;
  }

  const query = toGradleDependencyQuery(input.request);
  if (!query) {
    return undefined;
  }

  const dependencies = await readGradleDeclaredDependencies({
    workspaceRoot: input.workspaceRoot
  });
  const archives = await discoverDeclaredDependencyBinaryArchives({
    workspaceRoot: input.workspaceRoot,
    gradleUserHome: input.discovery?.gradleUserHome,
    includeDefaultGradleUserHome:
      input.discovery?.includeDefaultGradleUserHome,
    maxResults: input.discovery?.maxResults,
    dependencies
  });
  const warnings: LocalModArchiveInspectionWarning[] = [];
  const cacheStats = input.cache
    ? createLocalModArchiveInspectionCacheStats()
    : undefined;
  const candidates = await collectCandidates({
    request: input.request,
    query,
    dependencies,
    archives,
    repository: input.mavenRepositories?.[0],
    cache: input.cache,
    cacheStats,
    warnings
  });

  if (candidates.length === 0) {
    return undefined;
  }

  return {
    source: "gradle_dependency_archive",
    query,
    candidates,
    warnings,
    scannedDependencies: dependencies.length,
    scannedArchives: archives.length,
    remoteLookupSkipped: true,
    cache: cacheStats
  };
}

export function formatGradleDependencyCandidateReference(
  candidate: Pick<McpServerGradleDependencyArchiveCandidate, "coordinate">
): string {
  return candidate.coordinate;
}

function toGradleDependencyQuery(
  request: McpServerExternalModResolutionRequest
): string | undefined {
  if (request.platform === "maven") {
    return request.coordinate;
  }

  return request.query;
}

async function collectCandidates(input: {
  request: McpServerExternalModResolutionRequest;
  query: string;
  dependencies: GradleDeclaredDependency[];
  archives: GradleSourceArchiveCandidate[];
  repository?: McpServerExternalModMavenRepository;
  cache?: ArchiveContentCache;
  cacheStats?: LocalModArchiveInspectionCacheStats;
  warnings: LocalModArchiveInspectionWarning[];
}): Promise<McpServerGradleDependencyArchiveCandidate[]> {
  const candidates: McpServerGradleDependencyArchiveCandidate[] = [];

  for (const archive of input.archives) {
    const dependency = input.dependencies.find(
      (entry) =>
        entry.version &&
        archiveMatchesDependency(archive, {
          ...entry,
          version: entry.version
        })
    );

    if (!dependency?.version) {
      continue;
    }

    const score = await scoreArchive({
      request: input.request,
      query: input.query,
      dependency: { ...dependency, version: dependency.version },
      archive,
      cache: input.cache,
      cacheStats: input.cacheStats,
      warnings: input.warnings
    });

    if (score) {
      candidates.push(buildCandidate(score, archive, input.repository));
    }
  }

  return candidates.sort(compareCandidates);
}

async function scoreArchive(input: {
  request: McpServerExternalModResolutionRequest;
  query: string;
  dependency: GradleDeclaredDependency & { version: string };
  archive: GradleSourceArchiveCandidate;
  cache?: ArchiveContentCache;
  cacheStats?: LocalModArchiveInspectionCacheStats;
  warnings: LocalModArchiveInspectionWarning[];
}): Promise<GradleDependencyEvidenceMatch | undefined> {
  const archiveCandidate = toModArchiveCandidate(input.archive, input.dependency);
  const inspection = await inspectLocalModArchive({
    archive: archiveCandidate,
    cache: input.cache,
    cacheStats: input.cacheStats
  });
  const scores = [
    scoreGradleDependencyQuery(input.query, input.dependency),
    inspection.archiveMetadata
      ? scoreGradleArchiveMetadata(
          input.query,
          input.request,
          input.dependency,
          inspection.archiveMetadata
        )
      : undefined,
    ...inspection.nestedArchives.map((nested) =>
      nested.embeddedArchiveMetadata
        ? scoreGradleArchiveMetadata(
            input.query,
            input.request,
            input.dependency,
            nested.embeddedArchiveMetadata,
            nested.embeddedArchivePath
          )
        : undefined
    )
  ].filter((entry): entry is GradleDependencyEvidenceMatch => Boolean(entry));

  input.warnings.push(...inspection.warnings);
  return scores.sort(compareGradleDependencyEvidenceMatches)[0];
}

function buildCandidate(
  entry: GradleDependencyEvidenceMatch,
  archive: GradleSourceArchiveCandidate,
  repository: McpServerExternalModMavenRepository | undefined
): McpServerGradleDependencyArchiveCandidate {
  const dependency = entry.dependency;
  const coordinate = dependency.notation;

  return {
    source: "gradle_dependency_archive",
    confidence: entry.confidence,
    confidenceReasons: [
      ...entry.reasons,
      `found binary jar in ${archive.source}`
    ],
    group: dependency.group,
    artifact: dependency.artifact,
    version: dependency.version,
    coordinate,
    sourceFile: dependency.sourceFile,
    modId: entry.metadata?.modId,
    title: entry.metadata?.name ?? entry.metadata?.modId,
    loader: entry.metadata?.loader,
    metadataPath: entry.metadata?.metadataPath,
    embeddedArchivePath: entry.embeddedArchivePath,
    archivePath: archive.archivePath,
    fileName: basename(entry.embeddedArchivePath ?? archive.archivePath),
    archiveSource: archive.source,
    archiveReason: archive.reason,
    mavenArtifacts: repository
      ? [
          buildRepositoryMavenArtifact({
            repositoryName: repository.name,
            repositoryUrl: repository.url,
            group: dependency.group,
            artifact: dependency.artifact,
            version: dependency.version
          })
        ]
      : [],
    requiresConfirmation: false,
    cachePolicy: "metadata_only"
  };
}

function toModArchiveCandidate(
  archive: GradleSourceArchiveCandidate,
  dependency: GradleDeclaredDependency & { version: string }
): ModArchiveCandidate {
  const source = archive.source === "workspace" ? "workspace-libs" : "gradle-cache";

  return {
    archivePath: archive.archivePath,
    relativePath:
      `${source}/${dependency.group}/${dependency.artifact}/` +
      `${dependency.version}/${basename(archive.archivePath)}`,
    source
  };
}

function archiveMatchesDependency(
  archive: GradleSourceArchiveCandidate,
  dependency: GradleDeclaredDependency & { version: string }
): boolean {
  const normalizedPath = normalize(archive.archivePath).replaceAll("\\", "/");
  const expectedPath =
    `/${dependency.group}/${dependency.artifact}/${dependency.version}/`;

  return (
    (archive.source === "workspace" || normalizedPath.includes(expectedPath)) &&
    isDeclaredDependencyBinaryFile(basename(archive.archivePath), dependency)
  );
}

function compareCandidates(
  left: McpServerGradleDependencyArchiveCandidate,
  right: McpServerGradleDependencyArchiveCandidate
): number {
  if (left.confidence !== right.confidence) {
    return left.confidence === "high" ? -1 : 1;
  }

  return left.coordinate.localeCompare(right.coordinate);
}
