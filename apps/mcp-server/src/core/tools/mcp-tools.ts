import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { LspDiagnosticRegistry } from "minecraft-developing-mcp-java-jdtls-adapter";
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
  resolveRuntimeRoot,
  resolveToolEnv,
  resolveWorkspaceRoot
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
    .describe(gradleSourceDiscoverySchema.description ?? "")
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
    const runtimeRoot = resolveRuntimeRoot(input, options);
    const workspaceRoot = resolveWorkspaceRoot(input, options);
    const env = resolveToolEnv(options);
    const prismRoot = input.prismRoot ?? env.MC_DEVELOPING_MCP_PRISM_ROOT;
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot, prismRoot }
    });
    let mdmResources = await buildMdmResourceStatusContext({
      runtimeRoot,
      mdmSourcesRoot: env.MDM_SOURCES_ROOT
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
        mdmSourcesRoot: env.MDM_SOURCES_ROOT
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
    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: input.requestText,
      requestContext,
      lspDiagnostics,
      javaDiagnosticsPreparation,
      sourceBundle: {
        vanillaReleaseCatalog,
        sourceIndexDatabasePaths,
        gradleSourceDiscovery
      },
      contextQuery: {
        docsRecords: mdmDocs.records,
        docsSqliteArtifacts: mdmDocs.sqliteArtifacts,
        sourceIndexDatabasePaths,
        sourceAcquisitionGradleDiscovery: gradleSourceDiscovery,
        sourceAcquisitionRouteOrigins: input.preparationRoutes as
          | SourceAcquisitionOrigin[]
          | undefined,
        sourceAcquisitionWorkItemHandlers:
          createMcpServerSourceAcquisitionWorkItemHandlers({
            requestText: input.requestText,
            runtimeRoot,
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
        mdmPackageRecommendations
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
