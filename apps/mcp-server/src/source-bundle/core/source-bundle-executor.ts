import {
  resolveVanillaSource,
  type VanillaSourceRequest
} from "@mcpskill/vanilla-source-adapter";
import { discoverMinecraftSourceArchives } from "@mcpskill/gradle-adapter";
import { resolveManagedRuntimeLayout } from "@mcpskill/runtime-manager";
import type {
  SourcePackageRecipe,
  SourceAcquisitionJobRunner,
  SourcePackageRecipeExecutor,
  SourcePackageRecipeProvider,
  SourcePackageRecipeRegistry
} from "@mcpskill/source-package-manager";
import {
  buildMojangVanillaAssetsRecipeProvider,
  buildMojangVanillaDataPackRecipeProvider,
  buildMojangVanillaResourcePackRecipeProvider,
  buildVanillaSourcePackZipRecipe
} from "@mcpskill/source-package-manager";
import type { SourcePackageCoordinate } from "@mcpskill/shared-types";

import type {
  McpServerEvidenceExecutor,
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "../../request/execution/request-handler.js";
import {
  resolveGradleSourceArchiveLookup,
  type GradleSourceArchiveDiscoveryOptions
} from "../../gradle/archive/gradle-source-archive-lookup.js";
import { resolveGradleDependencyArchiveLookup } from "../../gradle/archive/gradle-dependency-archive-lookup.js";
import { executeMcpServerDatapackFiles } from "../datapack/source-bundle-datapack.js";
import { resolveMcpServerWorkspaceSource } from "../workspace/source-bundle-workspace.js";
import type { ClientVisualExternalShaderReferenceOptions } from "../../client-visual/shader/client-visual-shader-reference.js";
import type { MdmVanillaReleaseCatalogContext } from "../../docs/mdm-resource/vanilla-release-catalog.js";
import { executeMcpServerVanillaGenerationTargets } from "../vanilla/source-bundle-vanilla-generation-targets.js";

export interface McpServerSourceBundleExecutorOptions {
  runtimeRoot: string;
  recipes?: SourcePackageRecipeRegistry;
  recipeProvider?: SourcePackageRecipeProvider;
  jobRunner?: SourceAcquisitionJobRunner;
  gradleSourceDiscovery?: McpServerGradleSourceDiscoveryOptions;
  externalShaderReference?: ClientVisualExternalShaderReferenceOptions;
  vanillaReleaseCatalog?: MdmVanillaReleaseCatalogContext;
  sourceIndexDatabasePaths?: string[];
  executeRecipe: SourcePackageRecipeExecutor;
  fallbackExecutor?: McpServerEvidenceExecutor;
}

export interface McpServerGradleSourceDiscoveryOptions
  extends GradleSourceArchiveDiscoveryOptions {}

export function buildMcpServerSourceBundleExecutor(
  options: McpServerSourceBundleExecutorOptions
): McpServerEvidenceExecutor {
  const runtimeLayout = resolveManagedRuntimeLayout(options.runtimeRoot);

  return async (
    input: McpServerEvidenceExecutorInput
  ): Promise<McpServerEvidenceExecutorResult> => {
    if (input.candidate.routeStep === "datapack_files") {
      const generationTargets = executeMcpServerVanillaGenerationTargets(
        input,
        options.vanillaReleaseCatalog
      );

      if (generationTargets) {
        return generationTargets;
      }

      return executeMcpServerDatapackFiles(input, {
        vanillaDatapackPackage: {
          runtimeLayout,
          recipes: options.recipes,
          recipeProvider: buildVanillaDatapackRecipeProvider(options),
          executeRecipe: options.executeRecipe
        },
        vanillaAssetsPackage: {
          runtimeLayout,
          recipes: options.recipes,
          recipeProvider: buildVanillaAssetsRecipeProvider(options),
          executeRecipe: options.executeRecipe
        },
        externalShaderReference: options.externalShaderReference
      });
    }

    if (input.candidate.routeStep !== "workspace_source") {
      return (
        options.fallbackExecutor?.(input) ?? {
          matched: false,
          summary: `No internal source.bundle handler registered for ${input.candidate.routeStep}.`
        }
      );
    }

    if (input.candidate.provenance !== "vanilla_source") {
      const workspaceSourceResult = await resolveMcpServerWorkspaceSource(input);
      if (workspaceSourceResult) {
        return workspaceSourceResult;
      }

      const gradleSourceResult = await resolveGradleSourceArchiveReference(
        options,
        input
      );
      const gradleDependencyResult =
        gradleSourceResult ??
        (await resolveGradleDependencyArchiveReference(options, input));

      return (
        gradleDependencyResult ??
        options.fallbackExecutor?.(input) ?? {
          matched: false,
          summary: "No vanilla source request detected for source.bundle."
        }
      );
    }

    const request = extractVanillaSourceRequest(input.requestPlan.requestText);

    if (!request) {
      return (
        options.fallbackExecutor?.(input) ?? {
          matched: false,
          summary: "No vanilla source request detected for source.bundle."
        }
      );
    }

    const result = await resolveVanillaSource({
      runtimeLayout,
      currentRuntime:
        input.requestPlan.requestContext.workspaceContext?.descriptor.currentRuntime,
      request,
      recipes: options.recipes ?? {},
      recipeProvider: buildSourcePackageRecipeProvider(options, input),
      executeRecipe: options.executeRecipe,
      jobRunner: options.jobRunner,
      sourceIndexDatabasePaths: options.sourceIndexDatabasePaths
    });

    return {
      matched: true,
      summary: result.summary,
      payload: {
        source: "vanilla_source",
        request,
        result
      }
    };
  };
}

async function resolveGradleSourceArchiveReference(
  options: McpServerSourceBundleExecutorOptions,
  input: McpServerEvidenceExecutorInput
): Promise<McpServerEvidenceExecutorResult | undefined> {
  const workspaceRoot =
    input.requestPlan.requestContext.workspaceContext?.workspaceRoot;

  if (!workspaceRoot) {
    return undefined;
  }

  const result = await resolveGradleSourceArchiveLookup({
    workspaceRoot,
    requestText: input.requestPlan.requestText,
    discovery: options.gradleSourceDiscovery
  });

  if (!result) {
    return undefined;
  }

  return {
    matched: true,
    summary: `Resolved ${result.request.symbol} from a Gradle sources archive.`,
    payload: {
      source: "gradle_source_archive",
      request: result.request,
      result
    }
  };
}

async function resolveGradleDependencyArchiveReference(
  options: McpServerSourceBundleExecutorOptions,
  input: McpServerEvidenceExecutorInput
): Promise<McpServerEvidenceExecutorResult | undefined> {
  const workspaceRoot =
    input.requestPlan.requestContext.workspaceContext?.workspaceRoot;

  if (!workspaceRoot) {
    return undefined;
  }

  const result = await resolveGradleDependencyArchiveLookup({
    workspaceRoot,
    requestText: input.requestPlan.requestText,
    discovery: options.gradleSourceDiscovery
  });

  if (!result) {
    return undefined;
  }

  return {
    matched: true,
    summary: `Located ${result.matches.length} class owner match(es) from Gradle dependency archives.`,
    payload: {
      source: "gradle_dependency_archive",
      result
    }
  };
}

function buildSourcePackageRecipeProvider(
  options: McpServerSourceBundleExecutorOptions,
  input: McpServerEvidenceExecutorInput
): SourcePackageRecipeProvider | undefined {
  const providers = [
    options.recipeProvider,
    buildGradleVanillaSourceRecipeProvider(options, input)
  ].filter((provider): provider is SourcePackageRecipeProvider => Boolean(provider));

  if (providers.length === 0) {
    return undefined;
  }

  return async (sourcePackage) => {
    for (const provider of providers) {
      const recipe = await provider(sourcePackage);

      if (recipe) {
        return recipe;
      }
    }

    return undefined;
  };
}

function buildVanillaDatapackRecipeProvider(
  options: McpServerSourceBundleExecutorOptions
): SourcePackageRecipeProvider {
  return combineRecipeProviders([
    options.recipeProvider,
    buildMojangVanillaDataPackRecipeProvider()
  ]);
}

function buildVanillaAssetsRecipeProvider(
  options: McpServerSourceBundleExecutorOptions
): SourcePackageRecipeProvider {
  return combineRecipeProviders([
    options.recipeProvider,
    buildMojangVanillaResourcePackRecipeProvider(),
    buildMojangVanillaAssetsRecipeProvider()
  ]);
}

function combineRecipeProviders(
  providers: Array<SourcePackageRecipeProvider | undefined>
): SourcePackageRecipeProvider {
  const activeProviders = providers.filter(
    (provider): provider is SourcePackageRecipeProvider => Boolean(provider)
  );

  return async (sourcePackage) => {
    for (const provider of activeProviders) {
      const recipe = await provider(sourcePackage);

      if (recipe) {
        return recipe;
      }
    }

    return undefined;
  };
}

function buildGradleVanillaSourceRecipeProvider(
  options: McpServerSourceBundleExecutorOptions,
  input: McpServerEvidenceExecutorInput
): SourcePackageRecipeProvider | undefined {
  const discovery = options.gradleSourceDiscovery;

  if (discovery?.enabled === false) {
    return undefined;
  }

  const workspaceRoot =
    input.requestPlan.requestContext.workspaceContext?.workspaceRoot;

  if (!workspaceRoot) {
    return undefined;
  }

  return async (sourcePackage) =>
    discoverVanillaSourceRecipeFromGradle({
      sourcePackage,
      workspaceRoot,
      discovery
    });
}

async function discoverVanillaSourceRecipeFromGradle(input: {
  sourcePackage: SourcePackageCoordinate;
  workspaceRoot: string;
  discovery?: McpServerGradleSourceDiscoveryOptions;
}): Promise<SourcePackageRecipe | undefined> {
  if (
    input.sourcePackage.namespace !== "minecraft" ||
    input.sourcePackage.artifactType !== "source-pack"
  ) {
    return undefined;
  }

  const archives = await discoverMinecraftSourceArchives({
    workspaceRoot: input.workspaceRoot,
    minecraftVersion: input.sourcePackage.minecraftVersion,
    gradleUserHome: input.discovery?.gradleUserHome,
    includeDefaultGradleUserHome:
      input.discovery?.includeDefaultGradleUserHome,
    maxVisitedEntries: input.discovery?.maxVisitedEntries,
    maxResults: input.discovery?.maxResults
  });
  const candidate = archives[0];

  if (!candidate) {
    return undefined;
  }

  return buildVanillaSourcePackZipRecipe({
    minecraftVersion: input.sourcePackage.minecraftVersion,
    sourceZip: candidate.archivePath,
    provenance: `gradle-${candidate.source}`
  });
}

function extractVanillaSourceRequest(
  requestText?: string
): VanillaSourceRequest | undefined {
  if (!requestText) {
    return undefined;
  }

  const symbolMatch = requestText.match(
    /\bnet\.minecraft(?:\.[A-Za-z_][A-Za-z0-9_]*)+\b/
  );

  if (symbolMatch) {
    return {
      symbol: symbolMatch[0]
    };
  }

  const pathMatch = requestText.match(
    /\bnet\/minecraft(?:\/[A-Za-z0-9_]+)+(?:\.java)?\b/
  );

  if (!pathMatch) {
    return undefined;
  }

  return {
    relativePath: pathMatch[0].endsWith(".java")
      ? pathMatch[0]
      : `${pathMatch[0]}.java`
  };
}
