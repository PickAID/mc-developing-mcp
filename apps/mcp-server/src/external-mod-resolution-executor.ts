import {
  resolveMavenArtifact,
  resolveCurseForgeMod,
  resolveModrinthMod,
  type ExternalModResolverResult,
  type MavenMetadataCache,
  type ResolveMavenArtifactInput,
  type ResolveCurseForgeModInput,
  type ResolveModrinthModInput
} from "@mcpskill/external-mod-resolver";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "./request-handler.js";
import {
  buildMavenRepositories,
  collectMissingConstraints,
  hasRequiredConstraints,
  parseExternalModRequest,
  type McpServerExternalModMavenRepository,
  type ResolvableExternalModRequest
} from "./external-mod-resolution-request.js";

export interface McpServerExternalModResolutionOptions {
  mavenMetadataCache?: MavenMetadataCache;
  mavenRepositories?: McpServerExternalModMavenRepository[];
  mavenResolver?: (
    input: ResolveMavenArtifactInput
  ) => Promise<ExternalModResolverResult>;
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

async function resolveByPlatform(
  request: ResolvableExternalModRequest,
  options: McpServerExternalModResolutionOptions
): Promise<ExternalModResolverResult> {
  if (request.platform === "maven") {
    const resolver = options.mavenResolver ?? resolveMavenArtifact;

    return await resolver({
      coordinate: request.coordinate,
      repositories: buildMavenRepositories(request, options.mavenRepositories),
      includeSources: true,
      metadataCache: options.mavenMetadataCache
    });
  }

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
  const coordinates = [
    ...new Set(
      result.candidates.flatMap((candidate) =>
        candidate.mavenArtifacts.map((artifact) => artifact.coordinates)
      )
    )
  ];

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
