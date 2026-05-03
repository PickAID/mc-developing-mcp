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
import type { ArchiveContentCache } from "@mcpskill/jar-source-adapter";

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
import {
  formatLocalArchiveCandidateReference,
  resolveLocalModArchiveEvidence,
  type McpServerLocalModArchiveResolutionResult
} from "./external-mod-local-archives.js";
import {
  formatGradleDependencyCandidateReference,
  resolveGradleDependencyArchiveEvidence,
  type McpServerGradleDependencyArchiveResolutionResult
} from "./external-mod-gradle-dependency-evidence.js";
import type { GradleSourceArchiveDiscoveryOptions } from "./gradle-source-archive-lookup.js";

export interface McpServerExternalModResolutionOptions {
  mavenMetadataCache?: MavenMetadataCache;
  mavenRepositories?: McpServerExternalModMavenRepository[];
  modArchiveContentCache?: ArchiveContentCache;
  gradleDependencyDiscovery?: GradleSourceArchiveDiscoveryOptions;
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

type McpServerExternalModResolutionResult =
  | ExternalModResolverResult
  | McpServerLocalModArchiveResolutionResult
  | McpServerGradleDependencyArchiveResolutionResult;

export async function executeMcpServerExternalModResolution(
  input: McpServerEvidenceExecutorInput,
  options: McpServerExternalModResolutionOptions = {}
): Promise<McpServerEvidenceExecutorResult> {
  const request = parseExternalModRequest(
    input.requestPlan.requestText ?? input.candidate.queryHint ?? ""
  );
  const localResult = await resolveLocalModArchiveEvidence({
    request,
    workspaceRoot:
      input.requestPlan.requestContext.workspaceContext?.workspaceRoot,
    cache: options.modArchiveContentCache
  });

  if (localResult) {
    return {
      matched: true,
      summary: summarizeResolution(localResult),
      payload: {
        source: "external_mod_resolution",
        request,
        result: localResult
      }
    };
  }

  const gradleResult = await resolveGradleDependencyArchiveEvidence({
    request,
    workspaceRoot:
      input.requestPlan.requestContext.workspaceContext?.workspaceRoot,
    discovery: options.gradleDependencyDiscovery,
    mavenRepositories: options.mavenRepositories,
    cache: options.modArchiveContentCache
  });

  if (gradleResult) {
    return {
      matched: true,
      summary: summarizeResolution(gradleResult),
      payload: {
        source: "external_mod_resolution",
        request,
        result: gradleResult
      }
    };
  }

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

    return await resolver({
      slug: request.slug,
      projectId: request.projectId,
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

function summarizeResolution(
  result: McpServerExternalModResolutionResult
): string {
  if (result.source === "local_archive") {
    return `Resolved local mod archive: ${formatLocalArchiveCandidateReference(
      result.candidates[0]
    )}.`;
  }

  if (result.source === "gradle_dependency_archive") {
    return `Resolved Gradle dependency archive: ${formatGradleDependencyCandidateReference(
      result.candidates[0]
    )}.`;
  }

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
