export type McpServerExternalModPlatform = "maven" | "modrinth" | "curseforge";

export interface McpServerExternalModResolutionRequest {
  platform: McpServerExternalModPlatform;
  coordinate?: string;
  repositoryUrls?: string[];
  query?: string;
  loader?: string;
  minecraftVersion?: string;
}

export interface McpServerExternalModMavenRepository {
  name: string;
  url: string;
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
  requestText: string
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

  const platform = detectPlatform(requestText);
  const loader = detectLoader(requestText);
  const minecraftVersion = detectMinecraftVersion(requestText);

  return {
    platform,
    query: extractQuery(requestText, loader, minecraftVersion),
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

  return meaningful[0]?.toLowerCase();
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
