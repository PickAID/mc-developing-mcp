import {
  resolveMavenArtifact,
  resolveCurseForgeMod,
  resolveModrinthMod,
  type ExternalModResolverResult,
  type MavenMetadataCache,
  type ResolveMavenArtifactInput,
  type ResolveCurseForgeModInput,
  type ResolveModrinthModInput
} from "minecraft-developing-mcp-external-mod-resolver";
import type { ArchiveContentCache } from "minecraft-developing-mcp-jar-source-adapter";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "../../request/execution/request-handler.js";
import {
  buildMavenRepositories,
  collectMissingConstraints,
  hasRequiredConstraints,
  normalizeExternalModRequest,
  parseExternalModRequest,
  type McpServerExternalModMavenRepository,
  type McpServerExternalModResolutionRequest,
  type ResolvableExternalModRequest
} from "./external-mod-resolution-request.js";
import {
  formatLocalArchiveCandidateReference,
  resolveLocalModArchiveEvidence,
  type McpServerLocalModArchiveResolutionResult
} from "../local/external-mod-local-archives.js";
import {
  formatGradleDependencyCandidateReference,
  resolveGradleDependencyArchiveEvidence,
  type McpServerGradleDependencyArchiveResolutionResult
} from "../gradle/external-mod-gradle-dependency-evidence.js";
import type { GradleSourceArchiveDiscoveryOptions } from "../../gradle/archive/gradle-source-archive-lookup.js";

export interface McpServerExternalModResolutionOptions {
  mavenMetadataCache?: MavenMetadataCache;
  mavenRepositories?: McpServerExternalModMavenRepository[];
  modArchiveContentCache?: ArchiveContentCache;
  gradleDependencyDiscovery?: GradleSourceArchiveDiscoveryOptions;
  mavenFetch?: ResolveMavenArtifactInput["fetch"];
  mavenResolver?: (
    input: ResolveMavenArtifactInput
  ) => Promise<ExternalModResolverResult>;
  modrinthFetch?: ResolveModrinthModInput["fetch"];
  modrinthApiBaseUrl?: string;
  modrinthResolver?: (
    input: ResolveModrinthModInput
  ) => Promise<ExternalModResolverResult>;
  curseForgeApiKey?: string;
  curseForgeCredentialProvider?: () => string | undefined;
  curseForgeFetch?: ResolveCurseForgeModInput["fetch"];
  curseForgeApiBaseUrl?: string;
  curseForgeResolver?: (
    input: ResolveCurseForgeModInput
  ) => Promise<ExternalModResolverResult>;
  requests?: McpServerExternalModResolutionRequest[];
}

type McpServerExternalModResolutionResult =
  | ExternalModResolverResult
  | McpServerLocalModArchiveResolutionResult
  | McpServerGradleDependencyArchiveResolutionResult;

export async function executeMcpServerExternalModResolution(
  input: McpServerEvidenceExecutorInput,
  options: McpServerExternalModResolutionOptions = {}
): Promise<McpServerEvidenceExecutorResult> {
  const defaults =
    input.requestPlan.requestContext.workspaceContext?.descriptor.currentRuntime;
  const structuredRequests = (
    input.candidate?.operationInput?.externalModRequests ??
    options.requests
  )?.map((request) =>
    normalizeExternalModRequest(request, defaults)
  );
  if (structuredRequests && structuredRequests.length > 0) {
    return await executeStructuredRequests(input, structuredRequests, options);
  }

  const requestText =
    input.requestPlan.requestText ?? input.candidate?.queryHint ?? "";
  const request = normalizeExternalModRequest(
    parseExternalModRequest(requestText, defaults),
    defaults
  );

  return await executeSingleRequest(input, request, options, requestText);
}

async function executeStructuredRequests(
  input: McpServerEvidenceExecutorInput,
  requests: McpServerExternalModResolutionRequest[],
  options: McpServerExternalModResolutionOptions
): Promise<McpServerEvidenceExecutorResult> {
  const requestText = input.requestPlan.requestText ?? input.candidate.queryHint ?? "";

  if (requests.length === 1) {
    return await executeSingleRequest(input, requests[0], options, requestText);
  }

  const results = [];

  for (const request of requests) {
    const result = await executeSingleRequest(input, request, options, requestText);
    const payload = isExternalModResolutionPayload(result.payload)
      ? result.payload
      : undefined;

    results.push({
      request,
      matched: result.matched,
      summary: result.summary,
      result: payload?.result
    });
  }

  return {
    matched: true,
    summary: summarizeAggregateResolution(results),
    payload: {
      source: "external_mod_resolution",
      requests,
      results
    }
  };
}

async function executeSingleRequest(
  input: McpServerEvidenceExecutorInput,
  request: McpServerExternalModResolutionRequest,
  options: McpServerExternalModResolutionOptions,
  requestText: string
): Promise<McpServerEvidenceExecutorResult> {
  const normalizedRequest = normalizeExternalModRequest(
    request,
    input.requestPlan.requestContext.workspaceContext?.descriptor.currentRuntime
  );
  const localResult = await resolveLocalModArchiveEvidence({
    request: normalizedRequest,
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
        request: normalizedRequest,
        result: localResult
      }
    };
  }

  const gradleResult = await resolveGradleDependencyArchiveEvidence({
    request: normalizedRequest,
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
        request: normalizedRequest,
        result: gradleResult
      }
    };
  }

  const missing = collectMissingConstraints(normalizedRequest);

  if (missing.length > 0) {
    if (isNonDependencyCrashContext(requestText, normalizedRequest)) {
      return {
        matched: false,
        summary:
          "Crash context did not contain a loader dependency or explicit external mod request."
      };
    }

    return {
      matched: true,
      summary: `External mod resolution needs ${missing.join(", ")}.`,
      payload: {
        source: "external_mod_resolution",
        request: normalizedRequest,
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

  if (!hasRequiredConstraints(normalizedRequest)) {
    throw new Error("External mod request constraints were not narrowed.");
  }

  const result = await resolveByPlatform(normalizedRequest, options);

  return {
    matched: true,
    summary: summarizeResolution(result),
    payload: {
      source: "external_mod_resolution",
      request: normalizedRequest,
      result
    }
  };
}

function isNonDependencyCrashContext(
  requestText: string,
  request: ReturnType<typeof parseExternalModRequest>
): boolean {
  return (
    /\bCrash log (?:resource|class|mixin target|resource path) references:/u.test(
      requestText
    ) &&
    !/\bCrash log loader (?:mod ids|dependency):/u.test(requestText) &&
    !request.loaderDependency &&
    !/\b(?:cursemaven|curse\.maven|maven|coordinate|coordinates)\b/iu.test(
      requestText
    )
  );
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
      fetch: options.mavenFetch,
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
      minecraftVersion: request.minecraftVersion,
      apiKey: options.curseForgeApiKey,
      credentialProvider: options.curseForgeCredentialProvider,
      fetch: options.curseForgeFetch,
      apiBaseUrl: options.curseForgeApiBaseUrl
    });
  }

  const resolver = options.modrinthResolver ?? resolveModrinthMod;
  return await resolver({
    query: request.query,
    slug: request.slug,
    projectId: request.projectId,
    loader: request.loader,
    minecraftVersion: request.minecraftVersion,
    fetch: options.modrinthFetch,
    apiBaseUrl: options.modrinthApiBaseUrl
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

function isExternalModResolutionPayload(
  payload: unknown
): payload is {
  result: McpServerExternalModResolutionResult;
} {
  return typeof payload === "object" && payload !== null && "result" in payload;
}

function summarizeAggregateResolution(
  results: Array<{
    summary: string;
    result?: McpServerExternalModResolutionResult;
  }>
): string {
  const coordinates = [
    ...new Set(
      results.flatMap((entry) =>
        entry.result?.candidates.flatMap((candidate) => {
          if (!hasMavenArtifacts(candidate)) {
            return [];
          }

          return candidate.mavenArtifacts.map((artifact) => artifact.coordinates);
        }) ?? []
      )
    )
  ];

  if (coordinates.length > 0) {
    return `Resolved external mod Maven coordinates: ${coordinates.join(", ")}.`;
  }

  return results.map((entry) => entry.summary).join(" ");
}

function hasMavenArtifacts(
  candidate: unknown
): candidate is { mavenArtifacts: Array<{ coordinates: string }> } {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    Array.isArray((candidate as { mavenArtifacts?: unknown }).mavenArtifacts)
  );
}
