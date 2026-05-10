import type { MappingIndexProvider } from "../../source-acquisition/mapping/source-acquisition-mapping-index.js";
import {
  createTinyV2MappingIndexProvider,
  createYarnMavenTinyV2MappingIndexProvider
} from "../../source-acquisition/mapping/source-acquisition-mapping-provider.js";
import { createMojangManifestMappingIndexProvider } from "../../source-acquisition/mapping/source-acquisition-mojmap-provider.js";
import { createParchmentMavenMappingIndexProvider } from "../../source-acquisition/mapping/source-acquisition-parchment-provider.js";

export interface McpMappingProviderRuntimeOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  mappingIndexProvider?: MappingIndexProvider;
  mappingIndexFetch?: (url: URL) => Promise<Response>;
}

export function resolveMappingIndexProvider(input: {
  options: McpMappingProviderRuntimeOptions;
  env: NodeJS.ProcessEnv;
}): MappingIndexProvider | undefined {
  if (input.options.mappingIndexProvider) {
    return input.options.mappingIndexProvider;
  }

  const yarnProvider = createConfiguredYarnProvider(input.options, input.env);
  const mojmapProvider = createConfiguredMojmapProvider(input.options, input.env);
  const parchmentProvider = createConfiguredParchmentProvider(
    input.options,
    input.env
  );
  if (!yarnProvider && !mojmapProvider && !parchmentProvider) {
    return undefined;
  }

  return async (request) => {
    if (request.mappingFamily === "yarn") {
      return yarnProvider
        ? yarnProvider(request)
        : unavailableConfiguredMappingProvider(request);
    }
    if (request.mappingFamily === "mojmap") {
      return mojmapProvider
        ? mojmapProvider(request)
        : unavailableConfiguredMappingProvider(request);
    }
    if (request.mappingFamily === "parchment") {
      return parchmentProvider
        ? parchmentProvider(request)
        : unavailableConfiguredMappingProvider(request);
    }

    return unavailableConfiguredMappingProvider(request);
  };
}

function createConfiguredYarnProvider(
  options: McpMappingProviderRuntimeOptions,
  env: NodeJS.ProcessEnv
): MappingIndexProvider | undefined {
  const yarnTemplate = env.MC_DEVELOPING_MCP_YARN_MAPPING_URL_TEMPLATE;
  if (yarnTemplate) {
    return createTinyV2MappingIndexProvider({
      fetch: options.mappingIndexFetch,
      resolveUrl: (request) =>
        request.mappingFamily === "yarn"
          ? expandMappingUrlTemplate(yarnTemplate, request)
          : undefined
    });
  }

  const yarnMavenBaseUrl = env.MC_DEVELOPING_MCP_YARN_MAVEN_BASE_URL;
  return yarnMavenBaseUrl
    ? createYarnMavenTinyV2MappingIndexProvider({
        fetch: options.mappingIndexFetch,
        mavenBaseUrl: yarnMavenBaseUrl
      })
    : undefined;
}

function createConfiguredMojmapProvider(
  options: McpMappingProviderRuntimeOptions,
  env: NodeJS.ProcessEnv
): MappingIndexProvider | undefined {
  const mojangManifestUrl = env.MC_DEVELOPING_MCP_MOJANG_VERSION_MANIFEST_URL;
  return mojangManifestUrl
    ? createMojangManifestMappingIndexProvider({
        fetch: options.mappingIndexFetch,
        versionManifestUrl: mojangManifestUrl
      })
    : undefined;
}

function createConfiguredParchmentProvider(
  options: McpMappingProviderRuntimeOptions,
  env: NodeJS.ProcessEnv
): MappingIndexProvider | undefined {
  const parchmentMavenBaseUrl =
    env.MC_DEVELOPING_MCP_PARCHMENT_MAVEN_BASE_URL;
  return parchmentMavenBaseUrl
    ? createParchmentMavenMappingIndexProvider({
        fetch: options.mappingIndexFetch,
        mavenBaseUrl: parchmentMavenBaseUrl
      })
    : undefined;
}

function unavailableConfiguredMappingProvider(request: {
  minecraftVersion: string;
  mappingFamily: string;
}): ReturnType<MappingIndexProvider> {
  return Promise.resolve({
    provenance: {
      status: "mapping_family_unavailable",
      minecraftVersion: request.minecraftVersion,
      mappingFamily: request.mappingFamily
    },
    cacheable: false,
    entries: []
  });
}

function expandMappingUrlTemplate(
  template: string,
  request: { minecraftVersion: string; mappingFamily: string }
): string {
  return template
    .replaceAll("{version}", encodeURIComponent(request.minecraftVersion))
    .replaceAll("{minecraftVersion}", encodeURIComponent(request.minecraftVersion))
    .replaceAll("{family}", encodeURIComponent(request.mappingFamily));
}
