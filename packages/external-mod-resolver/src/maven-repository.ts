import { buildRepositoryMavenArtifact } from "./maven.js";
import type {
  ExternalModCandidate,
  ExternalModResolverResult,
  ExternalModResolverWarning
} from "./types.js";

export interface ResolveMavenArtifactInput {
  coordinate: string;
  repositories: ExternalMavenRepository[];
  includeSources?: boolean;
  fetch?: MavenMetadataFetch;
}

export interface ExternalMavenRepository {
  name: string;
  url: string;
}

export type MavenMetadataFetch = (
  url: URL,
  init?: RequestInit
) => Promise<Response>;

interface ParsedMavenCoordinate {
  group: string;
  artifact: string;
  version?: string;
}

export async function resolveMavenArtifact(
  input: ResolveMavenArtifactInput
): Promise<ExternalModResolverResult> {
  const parsed = parseMavenCoordinate(input.coordinate);

  if (!parsed) {
    return unresolved(input.coordinate, {
      code: "invalid_maven_coordinate",
      message: `No Maven coordinate was found in ${input.coordinate}.`
    });
  }

  const repository = input.repositories[0];
  if (!repository) {
    return unresolved(toCoordinate(parsed), {
      code: "missing_maven_repository",
      message: "At least one Maven repository URL is required."
    });
  }

  const versionResolution = await resolveVersion(parsed, repository, input.fetch);

  if (!versionResolution.version) {
    return unresolved(toCoordinate(parsed), versionResolution.warning);
  }

  const coordinate = toCoordinate({
    ...parsed,
    version: versionResolution.version
  });
  const candidate = buildCandidate({
    parsed,
    version: versionResolution.version,
    repository,
    classifier: undefined,
    confidenceReasons: versionResolution.reason
      ? [
          versionResolution.reason,
          `selected repository ${repository.name}`,
          "built deterministic Maven artifact URL"
        ]
      : [
          `parsed exact Maven coordinate ${coordinate}`,
          `selected repository ${repository.name}`,
          "built deterministic Maven artifact URL"
        ]
  });
  const candidates = input.includeSources
    ? [
        candidate,
        buildCandidate({
          parsed,
          version: versionResolution.version,
          repository,
          classifier: "sources",
          confidenceReasons: [
            `derived sources jar from Maven coordinate ${coordinate}`,
            `selected repository ${repository.name}`,
            "built deterministic Maven artifact URL"
          ]
        })
      ]
    : [candidate];

  return {
    source: "maven",
    query: coordinate,
    candidates,
    warnings: []
  };
}

export function parseMavenCoordinate(
  value: string
): ParsedMavenCoordinate | undefined {
  const match = value.match(
    /(?:^|[\s"'(])([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+)(?::([A-Za-z0-9_.+-]+))?(?=$|[\s"',)])/u
  );

  if (!match) {
    return undefined;
  }

  return {
    group: match[1],
    artifact: match[2],
    version: match[3]
  };
}

async function resolveVersion(
  parsed: ParsedMavenCoordinate,
  repository: ExternalMavenRepository,
  fetchImpl?: MavenMetadataFetch
): Promise<{
  version?: string;
  reason?: string;
  warning: ExternalModResolverWarning;
}> {
  if (parsed.version) {
    return {
      version: parsed.version,
      warning: {
        code: "none",
        message: ""
      }
    };
  }

  if (!fetchImpl) {
    return {
      warning: {
        code: "metadata_fetch_required",
        message:
          `Maven coordinate ${toCoordinate(parsed)} omits a version and ` +
          "requires maven-metadata.xml."
      }
    };
  }

  const metadataUrl = buildMetadataUrl(repository, parsed);
  const response = await fetchImpl(metadataUrl, {
    headers: {
      accept: "application/xml,text/xml,*/*"
    }
  });

  if (!response.ok) {
    return {
      warning: {
        code: "metadata_request_failed",
        message: `Maven metadata request failed: HTTP ${response.status}.`
      }
    };
  }

  const metadata = await response.text();
  const version = readFirstXmlValue(metadata, "release") ??
    readFirstXmlValue(metadata, "latest") ??
    readLastVersion(metadata);

  return version
    ? {
        version,
        reason: `resolved Maven version ${version} from maven-metadata.xml`,
        warning: {
          code: "none",
          message: ""
        }
      }
    : {
        warning: {
          code: "metadata_version_missing",
          message: "maven-metadata.xml did not contain a version."
        }
      };
}

function buildCandidate(input: {
  parsed: ParsedMavenCoordinate;
  version: string;
  repository: ExternalMavenRepository;
  classifier?: string;
  confidenceReasons: string[];
}): ExternalModCandidate {
  const fileName = buildFileName(input.parsed.artifact, input.version, input.classifier);
  const coordinates = toCoordinate({
    ...input.parsed,
    version: input.version
  });

  return {
    source: "maven",
    confidence: input.classifier ? "medium" : "high",
    confidenceReasons: input.confidenceReasons,
    projectId: `${input.parsed.group}:${input.parsed.artifact}`,
    slug: input.parsed.artifact,
    title: input.classifier
      ? `${input.parsed.group}:${input.parsed.artifact}:${input.classifier}`
      : `${input.parsed.group}:${input.parsed.artifact}`,
    versionId: input.version,
    versionNumber: input.version,
    loaders: [],
    minecraftVersions: [],
    fileName,
    downloadUrl: buildArtifactUrl(input.repository, input.parsed, input.version, fileName),
    hashes: {},
    mavenArtifacts: [
      buildRepositoryMavenArtifact({
        repositoryName: input.repository.name,
        repositoryUrl: normalizeRepositoryUrl(input.repository.url),
        group: input.parsed.group,
        artifact: input.parsed.artifact,
        version: input.version
      })
    ],
    requiresConfirmation: true,
    cachePolicy: "metadata_only"
  };
}

function unresolved(
  query: string,
  warning: ExternalModResolverWarning
): ExternalModResolverResult {
  return {
    source: "maven",
    query,
    candidates: [],
    warnings: [warning]
  };
}

function buildMetadataUrl(
  repository: ExternalMavenRepository,
  parsed: ParsedMavenCoordinate
): URL {
  return new URL(
    `${toArtifactBasePath(parsed.group, parsed.artifact)}/maven-metadata.xml`,
    `${normalizeRepositoryUrl(repository.url)}/`
  );
}

function buildArtifactUrl(
  repository: ExternalMavenRepository,
  parsed: ParsedMavenCoordinate,
  version: string,
  fileName: string
): string {
  return new URL(
    `${toArtifactBasePath(parsed.group, parsed.artifact)}/${version}/${fileName}`,
    `${normalizeRepositoryUrl(repository.url)}/`
  ).toString();
}

function toArtifactBasePath(group: string, artifact: string): string {
  return `${group.replaceAll(".", "/")}/${artifact}`;
}

function buildFileName(
  artifact: string,
  version: string,
  classifier?: string
): string {
  return classifier
    ? `${artifact}-${version}-${classifier}.jar`
    : `${artifact}-${version}.jar`;
}

function toCoordinate(parsed: ParsedMavenCoordinate): string {
  return parsed.version
    ? `${parsed.group}:${parsed.artifact}:${parsed.version}`
    : `${parsed.group}:${parsed.artifact}`;
}

function readFirstXmlValue(xml: string, tagName: string): string | undefined {
  const match = xml.match(new RegExp(`<${tagName}>([^<]+)</${tagName}>`, "i"));
  return match?.[1]?.trim() || undefined;
}

function readLastVersion(xml: string): string | undefined {
  const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/gi)]
    .map((match) => match[1]?.trim())
    .filter((version): version is string => Boolean(version));

  return versions.at(-1);
}

function normalizeRepositoryUrl(url: string): string {
  return url.replace(/\/+$/, "");
}
