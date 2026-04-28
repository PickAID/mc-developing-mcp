import { homedir } from "node:os";
import { join } from "node:path";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import {
  executeMcpServerRequest,
  type McpServerRequestExecutorResult
} from "./request-executor.js";
import { buildMcpDevelopStructuredContent } from "./mcp-structured-content.js";

export const MC_DEVELOP_TOOL_NAME = "mc_develop";

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
    .describe("Optional PrismLauncher root when the workspace is a Prism instance.")
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
}

export function registerMcpServerTools(
  registry: McpToolRegistry,
  options: McpToolRuntimeOptions = {}
): void {
  registry.registerTool(
    MC_DEVELOP_TOOL_NAME,
    {
      title: "Minecraft Development Assistant",
      description: buildMcpDevelopToolDescription(),
      inputSchema: mcpDevelopInputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    (input) => executeMcpDevelopTool(input, options)
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
    const prismRoot =
      input.prismRoot ??
      options.env?.MCPSKILL_PRISM_ROOT ??
      process.env.MCPSKILL_PRISM_ROOT;
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot, prismRoot }
    });
    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: input.requestText
    });

    return {
      content: [
        {
          type: "text",
          text: formatMcpDevelopResultText(result)
        }
      ],
      structuredContent: toStructuredContent(result)
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
  result: McpServerRequestExecutorResult
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

  return lines.join("\n");
}

function buildMcpDevelopToolDescription(): string {
  return [
    "Use before guessing Minecraft modding code, KubeJS scripts, datapack JSON, Gradle dependencies, or modpack crash causes.",
    "This single progressive tool detects the workspace, applies the harness route, and chooses local evidence before optional docs.",
    "It treats KubeJS as Minecraft scripting instead of generic JavaScript, checks ProbeJS/d.ts context when available, and can inspect Gradle files, Java sources, datapack data/assets, logs, and mod JAR contents.",
    "Return value includes a compact text summary plus structured route/evidence data for follow-up reasoning."
  ].join(" ");
}

function toStructuredContent(
  result: McpServerRequestExecutorResult
): Record<string, unknown> {
  return buildMcpDevelopStructuredContent(result);
}

function formatToolError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return [
    "mc_develop failed before it could return workspace evidence.",
    `Reason: ${message}`,
    "Check that workspaceRoot points at the Minecraft project or modpack root and runtimeRoot is writable."
  ].join("\n");
}
