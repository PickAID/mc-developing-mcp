import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { LspDiagnosticRegistry } from "minecraft-developing-mcp-java-jdtls-adapter";
import type { AgentRuntimeTaskRouteStep } from "minecraft-developing-mcp-shared-types";
import type { SourceAcquisitionOrigin } from "minecraft-developing-mcp-source-package-manager";
import type {
  MdmArtifactFetch,
  MdmReleaseFetch
} from "minecraft-developing-mcp-resource-registry";
import { z } from "zod";

import { buildMcpServerBootstrap } from "../bootstrap/bootstrap.js";
import {
  executeMcpServerRequest,
  type McpServerRequestExecutorResult
} from "../../request/execution/request-executor.js";
import { buildMcpDevelopStructuredContent } from "./mcp-structured-content.js";
import {
  createMcpJavaDiagnosticsRuntime,
  type McpJavaDiagnosticsPreparation,
  type McpJavaDiagnosticsRuntime
} from "../../java/diagnostics/java-diagnostics-runtime.js";
import {
  buildMdmResourceStatusContext,
  type MdmResourceStatusContext
} from "../../docs/mdm-resource/mdm-resource-status.js";
import { buildMcpServerRequestContextWithServiceProfile } from "../../request/planning/service-profile-context.js";
import {
  installMdmReleasePackage, type McpMdmReleaseInstallResult
} from "../../docs/mdm-resource/mdm-release-install.js";
import { mergeInstalledReleaseResources } from "../../docs/mdm-resource/mdm-release-resource-merge.js";
import {
  loadMdmDocsResourcesFromStatus,
  type MdmDocsResourceSummary
} from "../../docs/mdm-docs/mdm-docs-records.js";
import { loadMdmVanillaReleaseCatalog } from "../../docs/mdm-resource/vanilla-release-catalog.js";
import {
  buildMdmPackageRecommendations,
  type MdmPackageRecommendations
} from "../../docs/mdm-resource/mdm-package-recommendations.js";
import {
  createMcpServerSourceAcquisitionWorkItemHandlers,
  type McpServerSourceAcquisitionWorkItemHandlerOptions
} from "../../source-acquisition/source-acquisition-work-item-handlers.js";
import type { McpOperationInput } from "../../request/evidence/evidence-operation-input.js";
import type { McpServerExternalModResolutionRequest } from "../../external-mod/resolution/external-mod-resolution-request.js";
import type { MappingIndexProvider } from "../../source-acquisition/mapping/source-acquisition-mapping-index.js";
import { resolveMappingIndexProvider } from "./mcp-tools-mapping-provider.js";
import { buildMcpDevelopToolDescription } from "./mcp-tool-description.js";
import { shouldPrepareJavaDiagnostics } from "./mcp-java-diagnostics-trigger.js";
import { resolveMcpDevelopSourceIndexDatabasePaths } from "./mcp-source-index-databases.js";
import { formatMcpDevelopResultText } from "./mcp-result-text.js";
import {
  formatToolError,
  resolveGradleSourceDiscovery,
  resolveLocalJarMode,
  resolveMcpRuntimeEnvironment,
  type McpRuntimeEnvironment
} from "./mcp-tool-runtime-resolution.js";

export const MC_DEVELOP_TOOL_NAME = "mc_develop";

const mdmReleaseInstallSchema = z
  .object({
    manifestUrl: z
      .string()
      .url()
      .optional()
      .describe("Optional remote MDM release manifest URL."),
    manifestPath: z
      .string()
      .optional()
      .describe("Optional local mdm-release-manifest.json path."),
    packageId: z.string().min(1).describe("MDM release package id to cache."),
    downloadPolicy: z
      .enum(["disabled", "allowed"])
      .optional()
      .describe("Defaults to disabled; allowed performs the explicit download.")
  })
  .refine((value) => Boolean(value.manifestUrl) !== Boolean(value.manifestPath), {
    message: "Provide exactly one of mdmReleaseInstall.manifestUrl or manifestPath."
  });

const preparationRouteOriginSchema = z.enum([
  "workspace_gradle",
  "workspace_probejs",
  "runtime_cache",
  "local_jar",
  "user_jar",
  "official",
  "modrinth",
  "curseforge",
  "github"
]);

const preparationRoutesSchema = z
  .array(preparationRouteOriginSchema)
  .min(1)
  .max(8)
  .describe(
    "Optional explicit source acquisition origins to plan. Defaults to progressive auto-discovery. Use workspace_gradle for Gradle dependency/cache/source archive evidence; workspace_probejs for KubeJS ProbeJS/d.ts resources; runtime_cache for offline SQLite/source packages; local_jar or user_jar for mod jars/JarJar/assets/data/classes; official for consent-gated vanilla generation; modrinth, curseforge, or github for remote metadata/source discovery."
  );

const preparationPolicySchema = z.object({
  remoteMetadataPolicy: z
    .enum(["disabled", "enabled"])
    .optional()
    .describe("Defaults to disabled; enabled runs explicit remote metadata work items when enough constraints and credentials are available."),
  localJarMode: z
    .enum(["inspect", "prewarm_entry_index"])
    .optional()
    .describe("Optional local jar execution intent. prewarm_entry_index builds the private SQLite entry index for later class/resource owner lookup.")
}).describe(
  "Optional execution policy for preparation routes. Use remoteMetadataPolicy: enabled only after remote lookup is allowed and credentials are available where required; use localJarMode: prewarm_entry_index to build the private local jar SQLite entry index before broad crash triage or class/resource owner lookup."
);

const gradleSourceDiscoverySchema = z.object({
  gradleUserHome: z
    .string()
    .optional()
    .describe("Optional Gradle user home to inspect for dependency source and binary archives."),
  includeDefaultGradleUserHome: z
    .boolean()
    .optional()
    .describe("Defaults to false in mc_develop; set true to also inspect ~/.gradle.")
}).describe(
  "Optional Gradle source archive discovery policy. Use includeDefaultGradleUserHome: true when workspace Gradle files are known but source jars were not found and inspecting ~/.gradle is acceptable."
);

const operationRouteStepSchema = z.enum([
  "source_acquisition_plan",
  "workspace_source",
  "probejs_types",
  "mod_archive_content",
  "external_mod_resolution",
  "datapack_files",
  "docs_lookup",
  "log_files",
  "java_diagnostics"
]);

const externalModRequestSchema = z.object({
  platform: z
    .enum(["maven", "modrinth", "curseforge"])
    .describe("External mod metadata platform to resolve."),
  coordinate: z
    .string()
    .optional()
    .describe("Exact Maven coordinate for platform=maven, e.g. group:artifact:version."),
  repositoryUrls: z
    .array(z.string().url())
    .max(8)
    .optional()
    .describe("Maven repository URLs for platform=maven."),
  projectId: z
    .string()
    .optional()
    .describe("Exact Modrinth project id or CurseForge numeric project id."),
  slug: z
    .string()
    .optional()
    .describe("Exact Modrinth or CurseForge project slug."),
  query: z
    .string()
    .optional()
    .describe("Fallback project search query; prefer slug or projectId when known."),
  loader: z
    .string()
    .optional()
    .describe("Minecraft loader constraint such as neoforge, forge, fabric, or quilt."),
  minecraftVersion: z
    .string()
    .optional()
    .describe("Exact Minecraft game version constraint, including non-1.x values such as 26.1.2.")
}).describe(
  "Structured external mod resolution request. Use this instead of encoding project ids, slugs, loaders, or versions in requestText."
);

const sourceAcquisitionOperationSchema = z.object({
  sourceIndexQuery: z
    .string()
    .optional()
    .describe("Exact source-index query such as a class name, path, or text fragment."),
  minecraftVersion: z
    .string()
    .optional()
    .describe("Exact Minecraft version to use for source acquisition planning."),
  mapping: z
    .object({
      minecraftVersion: z.string().optional(),
      family: z.enum(["yarn", "parchment", "mojmap"]).optional()
    })
    .optional()
    .describe("Explicit mapping-index request.")
});

const workspaceSourceOperationSchema = z.object({
  javaSymbols: z
    .array(z.string().min(1))
    .max(8)
    .optional()
    .describe("Exact Java symbols/classes to read from workspace source."),
  javaPaths: z
    .array(z.string().min(1))
    .max(8)
    .optional()
    .describe("Workspace-relative or absolute Java source paths to read."),
  buildFiles: z
    .array(z.string().min(1))
    .max(8)
    .optional()
    .describe("Build files to read, such as build.gradle, settings.gradle, or gradle.properties."),
  line: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional 1-based line hint for source reads.")
});

const probeJsOperationSchema = z.object({
  symbol: z
    .string()
    .optional()
    .describe("Exact KubeJS/ProbeJS symbol to query, such as event.recipes or ItemStack."),
  resourceQueries: z
    .array(z.string().min(1))
    .optional()
    .describe("Exact ProbeJS resource ids or query terms for items, recipes, tags, fluids, or registries."),
  resourceKinds: z
    .array(z.enum([
      "class",
      "language_key",
      "snippet",
      "item",
      "recipe",
      "registry",
      "fluid",
      "tag"
    ]))
    .max(8)
    .optional()
    .describe("Optional ProbeJS semantic resource kinds to include."),
  resourceLimitPerKind: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Optional per-kind entry limit. Omit for all matching entries; use 0 for counts-only output."),
  resourceOnly: z
    .boolean()
    .optional()
    .describe("When true, summarize ProbeJS resources without requiring a TypeScript symbol query."),
  scope: z
    .enum(["startup", "server", "client", "shared"])
    .optional()
    .describe("KubeJS script scope to prefer."),
  includeLifecycle: z
    .boolean()
    .optional()
    .describe("Include KubeJS lifecycle and script-quality evidence.")
});

const archiveContentDomainSchema = z.enum([
  "data",
  "assets",
  "java",
  "class",
  "metadata"
]);

const nestedArchiveEntrySchema = z.object({
  embeddedArchivePath: z.string().min(1),
  relativePath: z.string().min(1)
});

const modArchiveOperationSchema = z.object({
  archive: z
    .string()
    .optional()
    .describe("Archive path/name hint to select when multiple mod jars exist."),
  queries: z
    .array(z.string().min(1))
    .max(8)
    .optional()
    .describe("Exact archive search queries."),
  entryPaths: z
    .array(z.string().min(1))
    .max(8)
    .optional()
    .describe("Exact archive entry paths to read."),
  nestedEntryPaths: z
    .array(nestedArchiveEntrySchema)
    .max(8)
    .optional()
    .describe("Exact nested JarJar entry paths to read."),
  listDomains: z
    .array(archiveContentDomainSchema)
    .max(5)
    .optional()
    .describe("Archive content domains to list."),
  nestedListPath: z
    .string()
    .optional()
    .describe("Embedded jar path to list."),
  classOwners: z
    .array(z.string().min(1))
    .max(8)
    .optional()
    .describe("Exact binary class names to locate in local mod jars."),
  mixinTargets: z
    .array(z.string().min(1))
    .max(8)
    .optional()
    .describe("Exact Mixin target class names to verify."),
  decompileClasses: z
    .array(z.string().min(1))
    .max(4)
    .optional()
    .describe("Exact classes to decompile after local owner proof."),
  inventory: z
    .boolean()
    .optional()
    .describe("List or build local mod archive inventory."),
  refreshInventory: z
    .boolean()
    .optional()
    .describe("Refresh the local mod archive inventory cache."),
  preDecompileAnalysis: z
    .boolean()
    .optional()
    .describe("Analyze the selected archive before decompilation."),
  hotaiPatchProof: z
    .boolean()
    .optional()
    .describe("Run Hotai patch target proof for hotai/before_mixin patches.")
});

const datapackOperationSchema = z.object({
  resourceLocations: z
    .array(z.string().min(1))
    .max(12)
    .optional()
    .describe("Exact resource locations to search, such as minecraft:stone."),
  paths: z
    .array(z.string().min(1))
    .max(12)
    .optional()
    .describe("Exact data/ or assets/ paths to read."),
  traceReferences: z
    .boolean()
    .optional()
    .describe("Trace resource references from requested asset JSON paths."),
  migration: z
    .object({
      fromMinecraftVersion: z.string(),
      toMinecraftVersion: z.string()
    })
    .optional()
    .describe("Explicit datapack/resource-pack migration version pair."),
  mode: z
    .enum(["datapack", "resource_pack", "client_visual"])
    .optional()
    .describe("Datapack/resource-pack/client visual evidence mode.")
});

const logFilesOperationSchema = z.object({
  paths: z
    .array(z.string().min(1))
    .max(8)
    .optional()
    .describe("Exact log or crash-report paths to analyze.")
});

const vanillaSourceOperationSchema = z.object({
  symbol: z.string().optional(),
  packageHint: z.string().optional(),
  relativePath: z.string().optional(),
  maxFiles: z.number().int().positive().optional()
});

const mcpOperationSchema = z.object({
  kind: operationRouteStepSchema
    .describe("Exact mc_develop capability/route step to execute."),
  docsQuery: z
    .string()
    .optional()
    .describe("Exact docs lookup query. Use for kind=docs_lookup instead of hiding the query in requestText."),
  sourceAcquisition: sourceAcquisitionOperationSchema
    .optional()
    .describe("Structured input for kind=source_acquisition_plan."),
  workspaceSource: workspaceSourceOperationSchema
    .optional()
    .describe("Structured input for kind=workspace_source."),
  probeJs: probeJsOperationSchema
    .optional()
    .describe("Structured input for kind=probejs_types."),
  modArchive: modArchiveOperationSchema
    .optional()
    .describe("Structured input for kind=mod_archive_content."),
  externalModRequests: z
    .array(externalModRequestSchema)
    .min(1)
    .max(8)
    .optional()
    .describe("Structured requests for kind=external_mod_resolution."),
  datapack: datapackOperationSchema
    .optional()
    .describe("Structured input for kind=datapack_files."),
  logFiles: logFilesOperationSchema
    .optional()
    .describe("Structured input for kind=log_files."),
  vanillaSource: vanillaSourceOperationSchema
    .optional()
    .describe("Explicit vanilla source request for kind=workspace_source.")
}).describe(
  "Explicit operation entry point. When provided, mc_develop executes these operations in order instead of relying on keyword route inference."
);

const mcpDevelopInputSchema = z.object({
  requestText: z
    .string()
    .min(1)
    .describe("Natural-language Minecraft Java, KubeJS, datapack, or modpack request."),
  workspaceRoot: z
    .string()
    .optional()
    .describe("Minecraft project or modpack root. Defaults to MC_DEVELOPING_MCP_WORKSPACE_ROOT or process cwd."),
  runtimeRoot: z
    .string()
    .optional()
    .describe("Managed MCP runtime/cache root. Defaults to MC_DEVELOPING_MCP_RUNTIME_ROOT or ~/.cache/mc-developing-mcp/runtime."),
  mdmSourcesRoot: z
    .string()
    .optional()
    .describe("Optional local mdm-sources consumer checkout. Defaults to MDM_SOURCES_ROOT, MDM_SOURCES_DEFAULT_ROOT, or ~/.local/share/mc-developing-mcp/mdm-sources."),
  prismRoot: z
    .string()
    .optional()
    .describe("Optional PrismLauncher root when the workspace is a Prism instance."),
  mdmReleaseInstall: mdmReleaseInstallSchema
    .optional()
    .describe("Optional explicit MDM Release artifact cache request."),
  preparationRoutes: preparationRoutesSchema
    .optional()
    .describe(preparationRoutesSchema.description ?? ""),
  preparationPolicy: preparationPolicySchema
    .optional()
    .describe(preparationPolicySchema.description ?? ""),
  gradleSourceDiscovery: gradleSourceDiscoverySchema
    .optional()
    .describe(gradleSourceDiscoverySchema.description ?? ""),
  operations: z
    .array(mcpOperationSchema)
    .min(1)
    .max(12)
    .optional()
    .describe("Explicit MCP capability calls. Prefer operations for precise workflows; requestText remains context, not the control plane."),
  externalModRequests: z
    .array(externalModRequestSchema)
    .min(1)
    .max(8)
    .optional()
    .describe("Shortcut for operations[{kind:'external_mod_resolution', externalModRequests:[...]}].")
});

export const mcpDevelopInputShape = mcpDevelopInputSchema.shape;

export type McpDevelopToolInput = z.infer<typeof mcpDevelopInputSchema>;

export type McpToolHandler = (
  input: McpDevelopToolInput
) => Promise<CallToolResult>;

export interface McpToolRegistry {
  registerTool(
    name: string,
    config: {
      title: string;
      description: string;
      inputSchema: typeof mcpDevelopInputShape;
      annotations: {
        readOnlyHint: boolean;
        destructiveHint: boolean;
        idempotentHint: boolean;
        openWorldHint: boolean;
      };
    },
    handler: McpToolHandler
  ): unknown;
}

export interface McpToolRuntimeOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  cwd?: string;
  lspDiagnostics?: LspDiagnosticRegistry;
  javaDiagnosticsRuntime?: McpJavaDiagnosticsRuntime;
  mdmReleaseManifestFetch?: MdmReleaseFetch;
  mdmArtifactFetch?: MdmArtifactFetch;
  mdmReleaseNow?: () => string;
  mappingIndexProvider?: MappingIndexProvider;
  mappingIndexFetch?: (url: URL) => Promise<Response>;
  modrinthFetch?: McpServerSourceAcquisitionWorkItemHandlerOptions["modrinthFetch"];
  modrinthApiBaseUrl?: string;
  curseForgeFetch?: McpServerSourceAcquisitionWorkItemHandlerOptions["curseForgeFetch"];
  curseForgeApiBaseUrl?: string;
  curseForgeApiKey?: string;
}

export function registerMcpServerTools(
  registry: McpToolRegistry,
  options: McpToolRuntimeOptions = {}
): void {
  const runtimeOptions = {
    ...options,
    javaDiagnosticsRuntime:
      options.javaDiagnosticsRuntime ??
      createMcpJavaDiagnosticsRuntime({
        env: options.env as NodeJS.ProcessEnv | undefined
      })
  };

  registry.registerTool(
    MC_DEVELOP_TOOL_NAME,
    {
      title: "Minecraft Development Assistant",
      description: buildMcpDevelopToolDescription(),
      inputSchema: mcpDevelopInputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    (input) => executeMcpDevelopTool(input, runtimeOptions)
  );
}

async function executeMcpDevelopTool(
  rawInput: McpDevelopToolInput,
  options: McpToolRuntimeOptions
): Promise<CallToolResult> {
  try {
    const input = mcpDevelopInputSchema.parse(rawInput);
    const runtimeEnvironment = resolveMcpRuntimeEnvironment(input, options);
    const { env } = runtimeEnvironment;
    const { runtimeRoot, workspaceRoot, prismRoot, mdmSourcesRoot } =
      runtimeEnvironment.values;
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot, prismRoot }
    });
    let mdmResources = await buildMdmResourceStatusContext({
      runtimeRoot,
      mdmSourcesRoot
    });
    const mdmReleaseInstall = input.mdmReleaseInstall
      ? await installMdmReleasePackage({
          runtimeRoot,
          request: input.mdmReleaseInstall,
          manifestFetch: options.mdmReleaseManifestFetch,
          artifactFetch: options.mdmArtifactFetch,
          now: options.mdmReleaseNow
        })
      : undefined;

    if (shouldRefreshMdmResourceStatus(mdmReleaseInstall)) {
      mdmResources = await buildMdmResourceStatusContext({
        runtimeRoot,
        mdmSourcesRoot
      });
      mdmResources = await mergeInstalledReleaseResources({
        runtimeRoot,
        mdmResources,
        mdmReleaseInstall
      });
    }

    const mdmDocs = await loadMdmDocsResourcesFromStatus(mdmResources);
    const sourceIndexDatabasePaths =
      await resolveMcpDevelopSourceIndexDatabasePaths({
        runtimeRoot,
        mdmSourceIndexDatabasePaths: mdmDocs.sourceIndexArtifacts.map(
          (artifact) => artifact.artifactPath
        )
      });
    const mdmPackageRecommendations = buildMdmPackageRecommendations({
      requestText: input.requestText,
      mdmResources,
      minecraftVersion:
        bootstrap.workspaceContext?.descriptor.currentRuntime.minecraftVersion,
      minecraftLoader:
        bootstrap.workspaceContext?.descriptor.currentRuntime.loader
    });
    const vanillaReleaseCatalog =
      await loadMdmVanillaReleaseCatalog(mdmResources);
    const gradleSourceDiscovery = resolveGradleSourceDiscovery(input);
    const requestContext =
      await buildMcpServerRequestContextWithServiceProfile(bootstrap, {
        requestText: input.requestText,
        runtimeRoot,
        ...gradleSourceDiscovery,
        env,
        mdmResources,
        sourceIndexDatabasePaths
      });
    const javaDiagnosticsPreparation = options.lspDiagnostics
      ? undefined
      : await resolveJavaDiagnosticsPreparation(input, options, workspaceRoot);
    const lspDiagnostics =
      options.lspDiagnostics ?? javaDiagnosticsPreparation?.diagnostics;
    const operations = resolveMcpOperations(input);
    const externalModRequests = resolveExternalModRequests(input, operations);
    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: input.requestText,
      requestContext,
      operations,
      lspDiagnostics,
      javaDiagnosticsPreparation,
      sourceBundle: {
        vanillaReleaseCatalog,
        sourceIndexDatabasePaths,
        gradleSourceDiscovery
      },
      contextQuery: {
        env,
        docsRecords: mdmDocs.records,
        docsSqliteArtifacts: mdmDocs.sqliteArtifacts,
        sourceIndexDatabasePaths,
        externalModRequests,
        externalModModrinthFetch: options.modrinthFetch,
        externalModModrinthApiBaseUrl: options.modrinthApiBaseUrl,
        externalModCurseForgeFetch: options.curseForgeFetch,
        externalModCurseForgeApiBaseUrl: options.curseForgeApiBaseUrl,
        externalModCurseForgeApiKey:
          options.curseForgeApiKey ?? env.CURSEFORGE_API_KEY,
        sourceAcquisitionGradleDiscovery: gradleSourceDiscovery,
        sourceAcquisitionRouteOrigins: input.preparationRoutes as
          | SourceAcquisitionOrigin[]
          | undefined,
        sourceAcquisitionWorkItemHandlers:
          createMcpServerSourceAcquisitionWorkItemHandlers({
            requestText: input.requestText,
            runtimeRoot,
            externalModRequests,
            remoteMetadataPolicy:
              input.preparationPolicy?.remoteMetadataPolicy ?? "disabled",
            localJarMode: resolveLocalJarMode(input),
            modrinthFetch: options.modrinthFetch,
            modrinthApiBaseUrl: options.modrinthApiBaseUrl,
            curseForgeFetch: options.curseForgeFetch,
            curseForgeApiBaseUrl: options.curseForgeApiBaseUrl,
            curseForgeApiKey: options.curseForgeApiKey ?? env.CURSEFORGE_API_KEY,
            mappingIndexProvider: resolveMappingIndexProvider({
              options,
              env
            })
          })
      }
    });

    return {
      content: [
        {
          type: "text",
          text: formatMcpDevelopResultText(
            result,
            mdmReleaseInstall,
            mdmPackageRecommendations
          )
        }
      ],
      structuredContent: toStructuredContent(result, {
        mdmResources,
        mdmReleaseInstall,
        mdmDocs: mdmDocs.summary,
        mdmPackageRecommendations,
        runtimeEnvironment
      })
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: formatToolError(error)
        }
      ]
    };
  }
}

async function resolveJavaDiagnosticsPreparation(
  input: McpDevelopToolInput,
  options: McpToolRuntimeOptions,
  workspaceRoot: string
): Promise<McpJavaDiagnosticsPreparation | undefined> {
  if (!options.javaDiagnosticsRuntime) {
    return undefined;
  }
  if (!shouldPrepareJavaDiagnostics(input.requestText)) {
    return undefined;
  }

  return options.javaDiagnosticsRuntime.prepare({
    workspaceRoot,
    requestText: input.requestText
  });
}

function toStructuredContent(
  result: McpServerRequestExecutorResult,
  options: {
    mdmResources?: MdmResourceStatusContext;
    mdmReleaseInstall?: McpMdmReleaseInstallResult;
    mdmDocs?: MdmDocsResourceSummary;
    mdmPackageRecommendations?: MdmPackageRecommendations;
    runtimeEnvironment?: McpRuntimeEnvironment;
  }
): Record<string, unknown> {
  return buildMcpDevelopStructuredContent(result, options);
}

function shouldRefreshMdmResourceStatus(
  mdmReleaseInstall: McpMdmReleaseInstallResult | undefined
): boolean {
  return (
    mdmReleaseInstall?.status === "downloaded" ||
    mdmReleaseInstall?.status === "ready"
  );
}

function resolveMcpOperations(
  input: McpDevelopToolInput
): Array<{ kind: AgentRuntimeTaskRouteStep; input?: McpOperationInput }> | undefined {
  if (input.operations) {
    return input.operations.map((operation) => ({
      kind: operation.kind,
      input: {
        docsQuery: operation.docsQuery,
        sourceAcquisition: operation.sourceAcquisition,
        workspaceSource: operation.workspaceSource,
        probeJs: operation.probeJs,
        modArchive: operation.modArchive,
        externalModRequests: operation.externalModRequests as
          | McpServerExternalModResolutionRequest[]
          | undefined,
        datapack: operation.datapack,
        logFiles: operation.logFiles,
        vanillaSource: operation.vanillaSource
      }
    }));
  }

  if (input.externalModRequests) {
    return [
      {
        kind: "external_mod_resolution",
        input: {
          externalModRequests: input.externalModRequests as
            McpServerExternalModResolutionRequest[]
        }
      }
    ];
  }

  return undefined;
}

function resolveExternalModRequests(
  input: McpDevelopToolInput,
  operations: ReturnType<typeof resolveMcpOperations>
): McpServerExternalModResolutionRequest[] | undefined {
  return (
    (input.externalModRequests as
      | McpServerExternalModResolutionRequest[]
      | undefined) ??
    operations
      ?.filter((operation) => operation.kind === "external_mod_resolution")
      .flatMap((operation) => operation.input?.externalModRequests ?? [])
  );
}
