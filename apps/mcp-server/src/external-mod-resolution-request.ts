export type McpServerExternalModPlatform = "maven" | "modrinth" | "curseforge";

export interface McpServerExternalModResolutionRequest {
  platform: McpServerExternalModPlatform;
  coordinate?: string;
  repositoryUrls?: string[];
  projectId?: string;
  slug?: string;
  query?: string;
  loader?: string;
  minecraftVersion?: string;
}

export interface McpServerExternalModMavenRepository {
  name: string;
  url: string;
}

export interface McpServerExternalModRequestDefaults {
  loader?: string;
  minecraftVersion?: string;
}

interface ExternalModUrlHint {
  platform: "modrinth" | "curseforge";
  query: string;
  slug: string;
}

interface ExternalModConstraintHint {
  query: string;
  slug?: string;
  projectId?: string;
}

export type ResolvableExternalModRequest =
  | (McpServerExternalModResolutionRequest & {
      platform: "maven";
      coordinate: string;
    })
  | (McpServerExternalModResolutionRequest & {
      platform: "modrinth" | "curseforge";
      query: string;
      loader: string;
      minecraftVersion: string;
    });

export function parseExternalModRequest(
  requestText: string,
  defaults: McpServerExternalModRequestDefaults = {}
): McpServerExternalModResolutionRequest {
  const coordinate = extractMavenCoordinate(requestText);

  if (coordinate) {
    const repositoryUrls = extractRepositoryUrls(requestText);

    return {
      platform: "maven",
      coordinate,
      repositoryUrls: repositoryUrls.length > 0 ? repositoryUrls : undefined
    };
  }

  const urlHint = extractExternalModUrlHint(requestText);
  const constraintHint = extractExplicitConstraintHint(requestText);
  const platform = urlHint?.platform ?? detectPlatform(requestText);
  const loader = detectLoader(requestText) ?? defaults.loader;
  const minecraftVersion =
    detectMinecraftVersion(requestText) ?? defaults.minecraftVersion;
  const crashLoaderModQuery = extractCrashLoaderModQuery(requestText);

  return {
    platform,
    projectId: constraintHint?.projectId,
    slug: urlHint?.slug ?? constraintHint?.slug,
    query:
      urlHint?.query ??
      constraintHint?.query ??
      crashLoaderModQuery ??
      extractQuery(requestText, loader, minecraftVersion),
    loader,
    minecraftVersion
  };
}

export function collectMissingConstraints(
  request: McpServerExternalModResolutionRequest
): string[] {
  if (request.platform === "maven") {
    return [request.coordinate ? undefined : "Maven coordinate"].filter(
      (entry): entry is string => entry !== undefined
    );
  }

  return [
    request.query ? undefined : "mod query or slug",
    request.loader ? undefined : "mod loader",
    request.minecraftVersion ? undefined : "Minecraft version"
  ].filter((entry): entry is string => entry !== undefined);
}

export function hasRequiredConstraints(
  request: McpServerExternalModResolutionRequest
): request is ResolvableExternalModRequest {
  if (request.platform === "maven") {
    return Boolean(request.coordinate);
  }

  return Boolean(request.query && request.loader && request.minecraftVersion);
}

export function buildMavenRepositories(
  request: McpServerExternalModResolutionRequest & {
    platform: "maven";
    coordinate: string;
  },
  fallbackRepositories: McpServerExternalModMavenRepository[] = []
): McpServerExternalModMavenRepository[] {
  if (request.repositoryUrls && request.repositoryUrls.length > 0) {
    return request.repositoryUrls.map((url) => ({
      name: "requested-maven-repository",
      url
    }));
  }

  if (fallbackRepositories.length > 0) {
    return fallbackRepositories;
  }

  return [inferMavenRepository(request.coordinate)];
}

function detectPlatform(requestText: string): McpServerExternalModPlatform {
  const normalized = requestText.toLowerCase();

  if (
    /\b(?:curseforge|cursemaven|curse\.maven)\b/.test(normalized) ||
    /curse\s+maven/.test(normalized)
  ) {
    return "curseforge";
  }

  return "modrinth";
}

function detectLoader(requestText: string): string | undefined {
  const normalized = requestText.toLowerCase();

  if (/\bneo\s*forge\b|\bneoforge\b/.test(normalized)) {
    return "neoforge";
  }

  const match = normalized.match(/\b(fabric|forge|quilt)\b/);
  return match?.[1];
}

function detectMinecraftVersion(requestText: string): string | undefined {
  return requestText.match(/\b1\.\d{1,2}(?:\.\d+)?\b/)?.[0];
}

function extractQuery(
  requestText: string,
  loader?: string,
  minecraftVersion?: string
): string | undefined {
  const fromUrl = extractExternalModUrlHint(requestText)?.query;

  if (fromUrl) {
    return fromUrl;
  }

  const fromForPhrase = extractQueryAfterFor(requestText, loader, minecraftVersion);

  if (fromForPhrase) {
    return fromForPhrase;
  }

  const tokens = requestText
    .replace(/[()[\]{}"'`]/g, " ")
    .split(/[^A-Za-z0-9_.-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const meaningful = tokens.filter(
    (token) => !isQueryStopToken(token, loader, minecraftVersion)
  );
  const query = meaningful.join(" ").toLowerCase();

  return query ? query : undefined;
}

function extractCrashLoaderModQuery(requestText: string): string | undefined {
  const match = requestText.match(
    /^Crash log loader mod ids:\s*([A-Za-z0-9_.-]+(?:\s*,\s*[A-Za-z0-9_.-]+)*)/im
  );
  const firstModId = match?.[1]?.split(",")[0]?.trim().toLowerCase();

  return firstModId && firstModId.length > 0 ? firstModId : undefined;
}

function extractExplicitConstraintHint(
  requestText: string
): ExternalModConstraintHint | undefined {
  const projectId = requestText.match(/\bproject\s+id\s+([A-Za-z0-9_-]+)\b/i)?.[1];

  if (projectId) {
    return {
      projectId,
      query: projectId
    };
  }

  const slug = requestText.match(/\bslug\s+([A-Za-z0-9_.-]+)\b/i)?.[1]?.toLowerCase();

  if (slug) {
    return {
      slug,
      query: slug
    };
  }

  return undefined;
}

function extractExternalModUrlHint(requestText: string): ExternalModUrlHint | undefined {
  for (const rawUrl of extractRepositoryUrls(requestText)) {
    const hint = parseExternalModUrlHint(rawUrl);

    if (hint) {
      return hint;
    }
  }

  return undefined;
}

function parseExternalModUrlHint(rawUrl: string): ExternalModUrlHint | undefined {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment).toLowerCase());

  if (host === "modrinth.com") {
    return parseModrinthUrlSegments(segments);
  }

  if (host === "curseforge.com") {
    return parseCurseForgeUrlSegments(segments);
  }

  return undefined;
}

function parseModrinthUrlSegments(
  segments: string[]
): ExternalModUrlHint | undefined {
  const projectKinds = new Set(["mod", "plugin"]);
  const kindIndex = segments.findIndex((segment) => projectKinds.has(segment));
  const query = kindIndex >= 0 ? segments[kindIndex + 1] : undefined;

  return query ? { platform: "modrinth", query, slug: query } : undefined;
}

function parseCurseForgeUrlSegments(
  segments: string[]
): ExternalModUrlHint | undefined {
  const modsIndex = segments.findIndex((segment) => segment === "mc-mods");
  const query = modsIndex >= 0 ? segments[modsIndex + 1] : undefined;

  return query ? { platform: "curseforge", query, slug: query } : undefined;
}

function extractQueryAfterFor(
  requestText: string,
  loader?: string,
  minecraftVersion?: string
): string | undefined {
  const matches = [...requestText.matchAll(/\bfor\s+(.+?)(?=[.?!]|$)/gi)];
  const phrase = matches.at(-1)?.[1];

  if (!phrase) {
    return undefined;
  }

  return cleanQueryPhrase(phrase, loader, minecraftVersion);
}

function cleanQueryPhrase(
  phrase: string,
  loader?: string,
  minecraftVersion?: string
): string | undefined {
  const stopBoundary = new RegExp(
    [
      loader ? `\\b${escapeRegExp(loader)}\\b` : undefined,
      minecraftVersion ? `\\b${escapeRegExp(minecraftVersion)}\\b` : undefined,
      "\\b(?:fabric|forge|neoforge|quilt)\\b",
      "\\b1\\.\\d{1,2}(?:\\.\\d+)?\\b"
    ]
      .filter(Boolean)
      .join("|"),
    "i"
  );
  const beforeConstraint = phrase.split(stopBoundary)[0] ?? phrase;
  const cleaned = beforeConstraint
    .replace(/[()[\]{}"'`]/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return cleaned ? cleaned.toLowerCase() : undefined;
}

function isQueryStopToken(
  token: string,
  loader?: string,
  minecraftVersion?: string
): boolean {
  const normalized = token.toLowerCase();
  const stopTokens = new Set([
    "find",
    "can",
    "you",
    "please",
    "i",
    "me",
    "need",
    "want",
    "get",
    "lookup",
    "resolve",
    "search",
    "the",
    "a",
    "an",
    "for",
    "mod",
    "mods",
    "maven",
    "modrinth",
    "curseforge",
    "cursemaven",
    "curse.maven",
    "coordinate",
    "coordinates",
    "dependency",
    "gradle",
    "modimplementation",
    "modcompileonly",
    "modruntimeonly",
    "modlocalruntime",
    "implementation",
    "compileonly",
    "runtimeonly",
    "fg.deobf",
    "minecraft",
    "mc",
    "fabric",
    "forge",
    "neoforge",
    "quilt"
  ]);

  return (
    stopTokens.has(normalized) ||
    normalized === loader ||
    normalized === minecraftVersion ||
    /\b1\.\d{1,2}(?:\.\d+)?\b/.test(normalized)
  );
}

function extractMavenCoordinate(requestText: string): string | undefined {
  const match = requestText.match(
    /(?:^|[\s"'(])([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+)(?::([A-Za-z0-9_.+-]+))?(?=$|[\s"',)])/u
  );

  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  return match[3] ? `${match[1]}:${match[2]}:${match[3]}` : `${match[1]}:${match[2]}`;
}

function extractRepositoryUrls(requestText: string): string[] {
  return [...requestText.matchAll(/https?:\/\/[^\s"'()]+/g)].map((match) =>
    trimUrlPunctuation(match[0])
  );
}

function trimUrlPunctuation(value: string): string {
  return value.replace(/[.,;:]+$/g, "");
}

function inferMavenRepository(coordinate: string): { name: string; url: string } {
  if (coordinate.startsWith("maven.modrinth:")) {
    return {
      name: "Modrinth Maven",
      url: "https://api.modrinth.com/maven"
    };
  }

  if (coordinate.startsWith("curse.maven:")) {
    return {
      name: "CurseMaven",
      url: "https://cursemaven.com"
    };
  }

  if (coordinate.startsWith("net.fabricmc:")) {
    return {
      name: "Fabric Maven",
      url: "https://maven.fabricmc.net"
    };
  }

  if (coordinate.startsWith("net.neoforged:")) {
    return {
      name: "NeoForged Maven",
      url: "https://maven.neoforged.net/releases"
    };
  }

  if (coordinate.startsWith("net.minecraftforge:")) {
    return {
      name: "Forge Maven",
      url: "https://maven.minecraftforge.net"
    };
  }

  return {
    name: "Maven Central",
    url: "https://repo.maven.apache.org/maven2"
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
