import { buildCurseMavenArtifact } from "./maven.js";
import type {
  ExternalModCandidate,
  ExternalModProjectHint,
  ExternalModResolverResult
} from "./types.js";

const CURSEFORGE_API_BASE_URL = "https://api.curseforge.com";
const CURSEFORGE_API_KEY_SETUP_URL =
  "https://console.curseforge.com/?#/api-keys";
const CURSEFORGE_API_KEY_ENV_VAR = "CURSEFORGE_API_KEY";

export interface ResolveCurseForgeModInput {
  slug?: string;
  projectId?: string;
  query?: string;
  loader: string;
  minecraftVersion: string;
  apiKey?: string;
  credentialProvider?: () => string | undefined;
  fetch?: CurseForgeFetch;
  apiBaseUrl?: string;
}

export type CurseForgeFetch = (
  url: URL,
  init?: RequestInit
) => Promise<Response>;

export async function resolveCurseForgeMod(
  input: ResolveCurseForgeModInput
): Promise<ExternalModResolverResult> {
  const query = input.slug ?? input.projectId ?? input.query ?? "";
  const apiKey = resolveApiKey(input);

  if (!apiKey) {
    return {
      source: "curseforge",
      query,
      candidates: [],
      warnings: [
        {
          code: "credentials_required",
          message:
            `CurseForge API resolution requires ${CURSEFORGE_API_KEY_ENV_VAR}. ` +
            `Create one at ${CURSEFORGE_API_KEY_SETUP_URL}.`,
          setupUrl: CURSEFORGE_API_KEY_SETUP_URL,
          credentialEnvVar: CURSEFORGE_API_KEY_ENV_VAR
        }
      ]
    };
  }

  const fetchImpl = input.fetch ?? fetchCurseForge;
  const projectResolution = input.projectId
    ? {
        project: await fetchProjectById({ fetchImpl, input, apiKey }),
        ambiguity: undefined
      }
    : await resolveProjectBySearch({ fetchImpl, input, apiKey, query });

  if (projectResolution.ambiguity) {
    return {
      source: "curseforge",
      query,
      candidates: [],
      warnings: [
        {
          code: "ambiguous_project_match",
          message:
            `CurseForge query ${query} matched multiple projects; ` +
            "choose an exact slug or project id.",
          projectHints: projectResolution.ambiguity
        }
      ]
    };
  }

  if (!projectResolution.project) {
    return {
      source: "curseforge",
      query,
      candidates: [],
      warnings: [
        {
          code: "no_project_match",
          message: `No CurseForge mod project matched ${query}.`
        }
      ]
    };
  }

  const files = await fetchJson<CurseForgeFilesResponse>(
    fetchImpl,
    buildFilesUrl(input, projectResolution.project.id),
    apiKey
  );
  const file = chooseFile(files.data, input);

  if (!file) {
    return {
      source: "curseforge",
      query,
      candidates: [],
      warnings: [
        {
          code: "no_compatible_file",
          message:
            `CurseForge project ${projectResolution.project.slug} has no jar file matching ` +
            `loader ${input.loader} and Minecraft ${input.minecraftVersion}.`
        }
      ]
    };
  }
  const downloadUrl = await resolveFileDownloadUrl({
    fetchImpl,
    input,
    apiKey,
    projectId: projectResolution.project.id,
    file
  });

  return {
    source: "curseforge",
    query,
    candidates: [
      toCandidate({
        project: projectResolution.project,
        file,
        input,
        downloadUrl
      })
    ],
    warnings: []
  };
}

async function fetchProjectById(input: {
  fetchImpl: CurseForgeFetch;
  input: ResolveCurseForgeModInput;
  apiKey: string;
}): Promise<CurseForgeProject | undefined> {
  const response = await fetchJson<CurseForgeProjectResponse>(
    input.fetchImpl,
    new URL(
      `/v1/mods/${encodeURIComponent(input.input.projectId ?? "")}`,
      input.input.apiBaseUrl ?? CURSEFORGE_API_BASE_URL
    ),
    input.apiKey
  );

  return response.data;
}

async function resolveProjectBySearch(input: {
  fetchImpl: CurseForgeFetch;
  input: ResolveCurseForgeModInput;
  apiKey: string;
  query: string;
}): Promise<{
  project?: CurseForgeProject;
  ambiguity?: ExternalModProjectHint[];
}> {
  const response = await fetchJson<CurseForgeSearchResponse>(
    input.fetchImpl,
    buildSearchUrl(input.input, input.query),
    input.apiKey
  );
  const ambiguity = detectAmbiguousProjectMatch(response.data, input.input);

  if (ambiguity) {
    return { ambiguity };
  }

  return { project: chooseProject(response.data, input.input) };
}

function buildSearchUrl(
  input: ResolveCurseForgeModInput,
  query: string
): URL {
  const url = new URL("/v1/mods/search", input.apiBaseUrl ?? CURSEFORGE_API_BASE_URL);

  url.searchParams.set("gameId", "432");
  url.searchParams.set("classId", "6");
  url.searchParams.set("pageSize", "5");

  if (input.slug) {
    url.searchParams.set("slug", input.slug);
  } else if (query) {
    url.searchParams.set("searchFilter", query);
  }

  return url;
}

function buildFilesUrl(
  input: ResolveCurseForgeModInput,
  projectId: number
): URL {
  const url = new URL(
    `/v1/mods/${projectId}/files`,
    input.apiBaseUrl ?? CURSEFORGE_API_BASE_URL
  );

  url.searchParams.set("gameVersion", input.minecraftVersion);
  url.searchParams.set("pageSize", "50");

  return url;
}

function buildFileDownloadUrl(
  input: ResolveCurseForgeModInput,
  projectId: number,
  fileId: number
): URL {
  return new URL(
    `/v1/mods/${projectId}/files/${fileId}/download-url`,
    input.apiBaseUrl ?? CURSEFORGE_API_BASE_URL
  );
}

async function fetchJson<T>(
  fetchImpl: CurseForgeFetch,
  url: URL,
  apiKey: string
): Promise<T> {
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/json",
      "x-api-key": apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`CurseForge request failed: HTTP ${response.status}`);
  }

  return await response.json() as T;
}

function fetchCurseForge(url: URL, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

function resolveApiKey(input: ResolveCurseForgeModInput): string | undefined {
  return (
    input.apiKey ??
    input.credentialProvider?.() ??
    process.env[CURSEFORGE_API_KEY_ENV_VAR]
  );
}

function chooseProject(
  projects: CurseForgeProject[],
  input: ResolveCurseForgeModInput
): CurseForgeProject | undefined {
  const slug = input.slug?.toLowerCase();

  if (slug) {
    return projects.find((project) => project.slug.toLowerCase() === slug);
  }

  return projects[0];
}

function detectAmbiguousProjectMatch(
  projects: CurseForgeProject[],
  input: ResolveCurseForgeModInput
): ExternalModProjectHint[] | undefined {
  const slug = input.slug?.toLowerCase();

  if (projects.length <= 1 || slug) {
    return undefined;
  }

  return projects.slice(0, 5).map((project) => ({
    source: "curseforge",
    projectId: String(project.id),
    slug: project.slug,
    title: project.name
  }));
}

async function resolveFileDownloadUrl(input: {
  fetchImpl: CurseForgeFetch;
  input: ResolveCurseForgeModInput;
  apiKey: string;
  projectId: number;
  file: CurseForgeFile;
}): Promise<string> {
  if (input.file.downloadUrl) {
    return input.file.downloadUrl;
  }

  const response = await fetchJson<CurseForgeDownloadUrlResponse>(
    input.fetchImpl,
    buildFileDownloadUrl(input.input, input.projectId, input.file.id),
    input.apiKey
  );

  return response.data;
}

function chooseFile(
  files: CurseForgeFile[],
  input: ResolveCurseForgeModInput
): CurseForgeFile | undefined {
  const loader = normalizeLoader(input.loader);

  return files.find((file) =>
    isJarFile(file.fileName) &&
    hasGameVersion(file, input.minecraftVersion) &&
    file.gameVersions.some((entry) => normalizeLoader(entry) === loader)
  );
}

function toCandidate(input: {
  project: CurseForgeProject;
  file: CurseForgeFile;
  input: ResolveCurseForgeModInput;
  downloadUrl: string;
}): ExternalModCandidate {
  const projectId = String(input.project.id);
  const fileId = String(input.file.id);

  return {
    source: "curseforge",
    confidence: input.input.slug ? "high" : "medium",
    confidenceReasons: [
      input.input.slug
        ? `matched CurseForge slug ${input.project.slug}`
        : `matched CurseForge project ${input.project.id}`,
      `matched loader ${input.input.loader}`,
      `matched Minecraft ${input.input.minecraftVersion}`,
      "selected jar file"
    ],
    projectId,
    slug: input.project.slug,
    title: input.project.name,
    versionId: fileId,
    versionNumber: input.file.displayName,
    loaders: [normalizeLoader(input.input.loader)],
    minecraftVersions: [input.input.minecraftVersion],
    fileName: input.file.fileName,
    downloadUrl: input.downloadUrl,
    hashes: toHashRecord(input.file.hashes),
    mavenArtifacts: [
      buildCurseMavenArtifact({
        slug: input.project.slug,
        projectId,
        fileId
      })
    ],
    requiresConfirmation: true,
    cachePolicy: "metadata_only"
  };
}

function toHashRecord(hashes: CurseForgeHash[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const hash of hashes) {
    result[toHashName(hash.algo)] = hash.value;
  }

  return result;
}

function toHashName(algo: number): string {
  if (algo === 1) {
    return "sha1";
  }

  if (algo === 2) {
    return "md5";
  }

  return `curseforge_algo_${algo}`;
}

function hasGameVersion(file: CurseForgeFile, minecraftVersion: string): boolean {
  return file.gameVersions.some((entry) => entry === minecraftVersion);
}

function normalizeLoader(loader: string): string {
  return loader.toLowerCase().replace(/\s+/g, "");
}

function isJarFile(filename: string): boolean {
  return filename.toLowerCase().endsWith(".jar");
}

interface CurseForgeSearchResponse {
  data: CurseForgeProject[];
}

interface CurseForgeProjectResponse {
  data: CurseForgeProject;
}

interface CurseForgeProject {
  id: number;
  name: string;
  slug: string;
  classId: number;
}

interface CurseForgeFilesResponse {
  data: CurseForgeFile[];
}

interface CurseForgeDownloadUrlResponse {
  data: string;
}

interface CurseForgeFile {
  id: number;
  displayName: string;
  fileName: string;
  downloadUrl?: string | null;
  gameVersions: string[];
  hashes: CurseForgeHash[];
}

interface CurseForgeHash {
  algo: number;
  value: string;
}
