import {
  resolveCurseForgeMod,
  resolveModrinthMod,
  type ExternalModResolverResult,
  type ResolveCurseForgeModInput,
  type ResolveModrinthModInput
} from "@mcpskill/external-mod-resolver";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";

export type McpServerExternalModPlatform = "modrinth" | "curseforge";

export interface McpServerExternalModResolutionRequest {
  platform: McpServerExternalModPlatform;
  query?: string;
  loader?: string;
  minecraftVersion?: string;
}

export interface McpServerExternalModResolutionOptions {
  modrinthResolver?: (
    input: ResolveModrinthModInput
  ) => Promise<ExternalModResolverResult>;
  curseForgeResolver?: (
    input: ResolveCurseForgeModInput
  ) => Promise<ExternalModResolverResult>;
}

export async function executeMcpServerExternalModResolution(
  input: McpServerEvidenceExecutorInput,
  options: McpServerExternalModResolutionOptions = {}
): Promise<McpServerEvidenceExecutorResult> {
  const request = parseExternalModRequest(
    input.requestPlan.requestText ?? input.candidate.queryHint ?? ""
  );
  const missing = collectMissingConstraints(request);

  if (missing.length > 0) {
    return {
      matched: true,
      summary: `External mod resolution needs ${missing.join(", ")}.`,
      payload: {
        source: "external_mod_resolution",
        request,
        result: {
          candidates: [],
          warnings: [
            {
              code: "needs_more_constraints",
              message:
                `Provide ${missing.join(", ")} to resolve API-backed mod ` +
                "candidates and Maven coordinates."
            }
          ]
        }
      }
    };
  }

  if (!hasRequiredConstraints(request)) {
    throw new Error("External mod request constraints were not narrowed.");
  }

  const result = await resolveByPlatform(request, options);

  return {
    matched: true,
    summary: summarizeResolution(result),
    payload: {
      source: "external_mod_resolution",
      request,
      result
    }
  };
}

function parseExternalModRequest(
  requestText: string
): McpServerExternalModResolutionRequest {
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

  if (!cleaned) {
    return undefined;
  }

  return cleaned.toLowerCase();
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

function collectMissingConstraints(
  request: McpServerExternalModResolutionRequest
): string[] {
  return [
    request.query ? undefined : "mod query or slug",
    request.loader ? undefined : "mod loader",
    request.minecraftVersion ? undefined : "Minecraft version"
  ].filter((entry): entry is string => entry !== undefined);
}

function hasRequiredConstraints(
  request: McpServerExternalModResolutionRequest
): request is Required<McpServerExternalModResolutionRequest> {
  return Boolean(request.query && request.loader && request.minecraftVersion);
}

async function resolveByPlatform(
  request: Required<McpServerExternalModResolutionRequest>,
  options: McpServerExternalModResolutionOptions
): Promise<ExternalModResolverResult> {
  if (request.platform === "curseforge") {
    const resolver = options.curseForgeResolver ?? resolveCurseForgeMod;
    const slug = request.query.includes(" ") ? undefined : request.query;

    return await resolver({
      slug,
      query: request.query,
      loader: request.loader,
      minecraftVersion: request.minecraftVersion
    });
  }

  const resolver = options.modrinthResolver ?? resolveModrinthMod;
  return await resolver({
    query: request.query,
    loader: request.loader,
    minecraftVersion: request.minecraftVersion
  });
}

function summarizeResolution(result: ExternalModResolverResult): string {
  const coordinates = result.candidates.flatMap((candidate) =>
    candidate.mavenArtifacts.map((artifact) => artifact.coordinates)
  );

  if (coordinates.length > 0) {
    return `Resolved external mod Maven coordinates: ${coordinates.join(", ")}.`;
  }

  const warning = result.warnings[0];
  if (warning) {
    return warning.credentialEnvVar
      ? `${warning.message} Set ${warning.credentialEnvVar} before retrying.`
      : warning.message;
  }

  return `No external mod candidates matched ${result.query}.`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
