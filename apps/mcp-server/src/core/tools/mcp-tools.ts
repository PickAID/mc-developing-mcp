import { homedir } from "node:os";
import { join } from "node:path";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { LspDiagnosticRegistry } from "@mcpskill/java-jdtls-adapter";
import type {
  MdmArtifactFetch,
  MdmReleaseFetch
} from "@mcpskill/resource-registry";
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
import {
  buildMcpServerRequestContextWithServiceProfile
} from "../../request/planning/service-profile-context.js";
import {
  installMdmReleasePackage,
  type McpMdmReleaseInstallResult
} from "../../docs/mdm-resource/mdm-release-install.js";
import {
  loadMdmDocsResourcesFromStatus,
  type MdmDocsResourceSummary
} from "../../docs/mdm-docs/mdm-docs-records.js";

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

const mcpDevelopInputSchema = z.object({
  requestText: z
    .string()
    .min(1)
    .describe("Natural-language Minecraft Java, KubeJS, datapack, or modpack request."),
  workspaceRoot: z
    .string()
    .optional()
    .describe("Minecraft project or modpack root. Defaults to MCPSKILL_WORKSPACE_ROOT or process cwd."),
  runtimeRoot: z
    .string()
    .optional()
    .describe("Managed MCP runtime/cache root. Defaults to MCPSKILL_RUNTIME_ROOT or ~/.cache/mc-developing-mcp/runtime."),
  prismRoot: z
    .string()
    .optional()
    .describe("Optional PrismLauncher root when the workspace is a Prism instance."),
  mdmReleaseInstall: mdmReleaseInstallSchema
    .optional()
    .describe("Optional explicit MDM Release artifact cache request.")
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
    const prismRoot = input.prismRoot ?? env.MCPSKILL_PRISM_ROOT;
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
    }

    const mdmDocs = await loadMdmDocsResourcesFromStatus(mdmResources);
    const requestContext =
      await buildMcpServerRequestContextWithServiceProfile(bootstrap, {
        requestText: input.requestText,
        runtimeRoot,
        includeDefaultGradleUserHome: false,
        env,
        mdmResources
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
      contextQuery: {
        docsRecords: mdmDocs.records,
        docsSqliteArtifacts: mdmDocs.sqliteArtifacts
      }
    });

    return {
      content: [
        {
          type: "text",
          text: formatMcpDevelopResultText(result, mdmReleaseInstall)
        }
      ],
      structuredContent: toStructuredContent(result, {
        mdmResources,
        mdmReleaseInstall,
        mdmDocs: mdmDocs.summary
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

function resolveToolEnv(options: McpToolRuntimeOptions): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...options.env
  };
}

function resolveRuntimeRoot(
  input: McpDevelopToolInput,
  options: McpToolRuntimeOptions
): string {
  return (
    input.runtimeRoot ??
    options.env?.MCPSKILL_RUNTIME_ROOT ??
    process.env.MCPSKILL_RUNTIME_ROOT ??
    join(homedir(), ".cache", "mc-developing-mcp", "runtime")
  );
}

function resolveWorkspaceRoot(
  input: McpDevelopToolInput,
  options: McpToolRuntimeOptions
): string {
  return (
    input.workspaceRoot ??
    options.env?.MCPSKILL_WORKSPACE_ROOT ??
    process.env.MCPSKILL_WORKSPACE_ROOT ??
    options.cwd ??
    process.cwd()
  );
}

function formatMcpDevelopResultText(
  result: McpServerRequestExecutorResult,
  mdmReleaseInstall?: McpMdmReleaseInstallResult
): string {
  const selected = result.selectedEvidence;
  const lines = [
    selected
      ? `Selected: ${selected.candidateId} (${selected.routeStep}, ${selected.preferredTool})`
      : "Selected: none",
    `Route: ${result.trace.routeSteps.join(" -> ")}`,
    `Executed: ${result.trace.executedCandidateIds.join(", ") || "none"}`
  ];

  if (result.trace.contextCandidateIds.length > 0) {
    lines.push(`Context: ${result.trace.contextCandidateIds.join(", ")}`);
  }
  if (selected?.summary) {
    lines.push(`Summary: ${selected.summary}`);
  }
  if (mdmReleaseInstall) {
    lines.push(
      `MDM release install: ${mdmReleaseInstall.status} (${mdmReleaseInstall.packageId})`
    );
  }

  return lines.join("\n");
}

function buildMcpDevelopToolDescription(): string {
  return [
    "Use before guessing Minecraft modding code, KubeJS scripts, datapack JSON, Gradle dependencies, or modpack crash causes.",
    "This single progressive tool detects the workspace, applies the harness route, and chooses local evidence before optional docs.",
    "It treats KubeJS as Minecraft scripting instead of generic JavaScript, checks ProbeJS/d.ts context when available, and can inspect Gradle files, Java sources, datapack data/assets, logs, and mod JAR contents.",
    "It can cache MDM Release artifacts only when mdmReleaseInstall.downloadPolicy is explicitly allowed; otherwise it returns a confirmation requirement.",
    "Return value includes a compact text summary plus structured route/evidence data for follow-up reasoning."
  ].join(" ");
}

function shouldPrepareJavaDiagnostics(requestText: string): boolean {
  return /(?:compile error|compilation error|cannot resolve|cannot be resolved|unresolved symbol|unresolved import|missing symbol|diagnostic|diagnostics|javac|type mismatch|method undefined|编译|诊断|找不到符号|无法解析)/i.test(
    requestText
  );
}

function toStructuredContent(
  result: McpServerRequestExecutorResult,
  options: {
    mdmResources?: MdmResourceStatusContext;
    mdmReleaseInstall?: McpMdmReleaseInstallResult;
    mdmDocs?: MdmDocsResourceSummary;
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

function formatToolError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return [
    "mc_develop failed before it could return workspace evidence.",
    `Reason: ${message}`,
    "Check that workspaceRoot points at the Minecraft project or modpack root and runtimeRoot is writable."
  ].join("\n");
}
