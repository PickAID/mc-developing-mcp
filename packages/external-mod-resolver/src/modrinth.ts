import type {
  ExternalModCandidate,
  ExternalModProjectHint,
  ExternalModResolverResult
} from "./types.js";
import { buildModrinthMavenArtifact } from "./maven.js";
import { chooseStrongModrinthProjectMatch } from "./modrinth-ranking.js";

const MODRINTH_API_BASE_URL = "https://api.modrinth.com";
const MODRINTH_USER_AGENT = "PickAID-mc-developing-mcp/0.0.0";

export interface ResolveModrinthModInput {
  query: string;
  loader: string;
  minecraftVersion: string;
  fetch?: ModrinthFetch;
  apiBaseUrl?: string;
}

export type ModrinthFetch = (
  url: URL,
  init?: RequestInit
) => Promise<Response>;

export async function resolveModrinthMod(
  input: ResolveModrinthModInput
): Promise<ExternalModResolverResult> {
  const fetchImpl = input.fetch ?? fetchModrinth;
  const directProject = await fetchProjectByIdOrSlug(fetchImpl, input);

  if (directProject) {
    return await resolveProjectVersions({
      fetchImpl,
      input,
      project: directProject
    });
  }

  const search = await fetchJson<ModrinthSearchResponse>(
    fetchImpl,
    buildSearchUrl(input)
  );
  const ambiguity = detectAmbiguousProjectMatch(search.hits, input.query);

  if (ambiguity) {
    return {
      source: "modrinth",
      query: input.query,
      candidates: [],
      warnings: [
        {
          code: "ambiguous_project_match",
          message:
            `Modrinth query ${input.query} matched multiple projects; ` +
            "choose an exact slug or project id.",
          projectHints: ambiguity
        }
      ]
    };
  }

  const project = chooseProject(search.hits, input.query);

  if (!project) {
    return {
      source: "modrinth",
      query: input.query,
      candidates: [],
      warnings: [
        {
          code: "no_project_match",
          message: `No Modrinth mod project matched ${input.query}.`
        }
      ]
    };
  }

  return await resolveProjectVersions({ fetchImpl, input, project });
}

async function fetchProjectByIdOrSlug(
  fetchImpl: ModrinthFetch,
  input: ResolveModrinthModInput
): Promise<ModrinthProjectHit | undefined> {
  const project = await fetchOptionalJson<ModrinthProjectDetail>(
    fetchImpl,
    buildProjectUrl(input)
  );

  return project ? toProjectHit(project) : undefined;
}

async function resolveProjectVersions(input: {
  fetchImpl: ModrinthFetch;
  input: ResolveModrinthModInput;
  project: ModrinthProjectHit;
}): Promise<ExternalModResolverResult> {
  const versions = await fetchJson<ModrinthVersion[]>(
    input.fetchImpl,
    buildProjectVersionsUrl(input.input, input.project.slug)
  );
  const version = versions[0];

  if (!version) {
    return {
      source: "modrinth",
      query: input.input.query,
      candidates: [],
      warnings: [
        {
          code: "no_compatible_version",
          message:
            `Modrinth project ${input.project.slug} has no version matching loader ` +
            `${input.input.loader} and Minecraft ${input.input.minecraftVersion}.`
        }
      ]
    };
  }

  const file = chooseVersionFile(version.files);

  if (!file) {
    return {
      source: "modrinth",
      query: input.input.query,
      candidates: [],
      warnings: [
        {
          code: "no_jar_file",
          message: `Modrinth version ${version.version_number} has no jar file.`
        }
      ]
    };
  }

  return {
    source: "modrinth",
    query: input.input.query,
    candidates: [
      toCandidate({
        project: input.project,
        version,
        file,
        input: input.input
      })
    ],
    warnings: []
  };
}

function buildProjectUrl(input: ResolveModrinthModInput): URL {
  return new URL(
    `/v2/project/${encodeURIComponent(input.query)}`,
    input.apiBaseUrl ?? MODRINTH_API_BASE_URL
  );
}

function buildSearchUrl(input: ResolveModrinthModInput): URL {
  const url = new URL("/v2/search", input.apiBaseUrl ?? MODRINTH_API_BASE_URL);

  url.searchParams.set("query", input.query);
  url.searchParams.set("limit", "5");
  url.searchParams.set(
    "facets",
    JSON.stringify([
      ["project_type:mod"],
      [`categories:${input.loader}`],
      [`versions:${input.minecraftVersion}`]
    ])
  );

  return url;
}

function buildProjectVersionsUrl(
  input: ResolveModrinthModInput,
  projectSlug: string
): URL {
  const url = new URL(
    `/v2/project/${encodeURIComponent(projectSlug)}/version`,
    input.apiBaseUrl ?? MODRINTH_API_BASE_URL
  );

  url.searchParams.set("loaders", JSON.stringify([input.loader]));
  url.searchParams.set("game_versions", JSON.stringify([input.minecraftVersion]));

  return url;
}

async function fetchJson<T>(
  fetchImpl: ModrinthFetch,
  url: URL
): Promise<T> {
  const response = await fetchImpl(url, {
    headers: {
      "user-agent": MODRINTH_USER_AGENT,
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Modrinth request failed: HTTP ${response.status}`);
  }

  return await response.json() as T;
}

async function fetchOptionalJson<T>(
  fetchImpl: ModrinthFetch,
  url: URL
): Promise<T | undefined> {
  const response = await fetchImpl(url, {
    headers: {
      "user-agent": MODRINTH_USER_AGENT,
      accept: "application/json"
    }
  });

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(`Modrinth request failed: HTTP ${response.status}`);
  }

  return await response.json() as T;
}

function fetchModrinth(url: URL, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

function chooseProject(
  hits: ModrinthProjectHit[],
  query: string
): ModrinthProjectHit | undefined {
  return chooseStrongModrinthProjectMatch(hits, query) ?? hits[0];
}

function detectAmbiguousProjectMatch(
  hits: ModrinthProjectHit[],
  query: string
): ExternalModProjectHint[] | undefined {
  if (hits.length <= 1) {
    return undefined;
  }

  if (chooseStrongModrinthProjectMatch(hits, query)) {
    return undefined;
  }

  return hits.slice(0, 5).map((hit) => ({
    source: "modrinth",
    projectId: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    downloads: hit.downloads
  }));
}

function toProjectHit(project: ModrinthProjectDetail): ModrinthProjectHit {
  return {
    project_id: project.id,
    slug: project.slug,
    title: project.title,
    project_type: project.project_type,
    downloads: project.downloads
  };
}

function chooseVersionFile(
  files: ModrinthVersionFile[]
): ModrinthVersionFile | undefined {
  return (
    files.find((file) => file.primary && isRuntimeJarFile(file)) ??
    files.find((file) => isRuntimeJarFile(file))
  );
}

function toCandidate(input: {
  project: ModrinthProjectHit;
  version: ModrinthVersion;
  file: ModrinthVersionFile;
  input: ResolveModrinthModInput;
}): ExternalModCandidate {
  return {
    source: "modrinth",
    confidence: "high",
    confidenceReasons: [
      `matched Modrinth slug ${input.project.slug}`,
      `matched loader ${input.input.loader}`,
      `matched Minecraft ${input.input.minecraftVersion}`,
      input.file.primary ? "selected primary jar file" : "selected jar file"
    ],
    projectId: input.project.project_id,
    slug: input.project.slug,
    title: input.project.title,
    versionId: input.version.id,
    versionNumber: input.version.version_number,
    loaders: [...input.version.loaders],
    minecraftVersions: [...input.version.game_versions],
    fileName: input.file.filename,
    downloadUrl: input.file.url,
    hashes: { ...input.file.hashes },
    mavenArtifacts: [
      buildModrinthMavenArtifact({
        slug: input.project.slug,
        projectId: input.project.project_id,
        versionId: input.version.id,
        versionNumber: input.version.version_number
      })
    ],
    requiresConfirmation: true,
    cachePolicy: "metadata_only"
  };
}

function isJarFile(filename: string): boolean {
  return filename.toLowerCase().endsWith(".jar");
}

function isRuntimeJarFile(file: ModrinthVersionFile): boolean {
  return isJarFile(file.filename) && !isSidecarFileType(file.file_type);
}

function isSidecarFileType(fileType?: string | null): boolean {
  return (
    fileType === "sources-jar" ||
    fileType === "dev-jar" ||
    fileType === "javadoc-jar" ||
    fileType === "signature" ||
    fileType === "required-resource-pack" ||
    fileType === "optional-resource-pack"
  );
}

interface ModrinthSearchResponse {
  total_hits: number;
  hits: ModrinthProjectHit[];
}

interface ModrinthProjectHit {
  project_id: string;
  slug: string;
  title: string;
  project_type: string;
  downloads: number;
}

interface ModrinthProjectDetail {
  id: string;
  slug: string;
  title: string;
  project_type: string;
  downloads: number;
}

interface ModrinthVersion {
  id: string;
  version_number: string;
  loaders: string[];
  game_versions: string[];
  files: ModrinthVersionFile[];
}

interface ModrinthVersionFile {
  primary: boolean;
  filename: string;
  file_type?: string | null;
  url: string;
  hashes: Record<string, string>;
}
