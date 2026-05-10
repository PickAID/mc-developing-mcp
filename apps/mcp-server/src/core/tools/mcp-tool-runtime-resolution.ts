import { homedir } from "node:os";
import { join } from "node:path";

import type {
  McpDevelopToolInput,
  McpToolRuntimeOptions
} from "./mcp-tools.js";

export function resolveToolEnv(
  options: McpToolRuntimeOptions
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...options.env
  };
}

export function resolveRuntimeRoot(
  input: McpDevelopToolInput,
  options: McpToolRuntimeOptions
): string {
  return (
    input.runtimeRoot ??
    options.env?.MC_DEVELOPING_MCP_RUNTIME_ROOT ??
    process.env.MC_DEVELOPING_MCP_RUNTIME_ROOT ??
    join(homedir(), ".cache", "mc-developing-mcp", "runtime")
  );
}

export function resolveWorkspaceRoot(
  input: McpDevelopToolInput,
  options: McpToolRuntimeOptions
): string {
  return (
    input.workspaceRoot ??
    options.env?.MC_DEVELOPING_MCP_WORKSPACE_ROOT ??
    process.env.MC_DEVELOPING_MCP_WORKSPACE_ROOT ??
    options.cwd ??
    process.cwd()
  );
}

export function resolveLocalJarMode(
  input: McpDevelopToolInput
): "inspect" | "prewarm_entry_index" {
  if (input.preparationPolicy?.localJarMode) {
    return input.preparationPolicy.localJarMode;
  }

  return hasLocalJarPrewarmIntent(input.requestText)
    ? "prewarm_entry_index"
    : "inspect";
}

export function resolveGradleSourceDiscovery(input: McpDevelopToolInput) {
  return {
    gradleUserHome: input.gradleSourceDiscovery?.gradleUserHome,
    includeDefaultGradleUserHome:
      input.gradleSourceDiscovery?.includeDefaultGradleUserHome ?? false
  };
}

export function hasLocalJarPrewarmIntent(requestText: string): boolean {
  const normalizedText = requestText.toLowerCase();

  return (
    /\b(?:prewarm|warm\s+up|index|indexes)\b/.test(normalizedText) ||
    /预热|索引|缓存索引/.test(requestText)
  );
}

export function formatToolError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return [
    "mc_develop failed before it could return workspace evidence.",
    `Reason: ${message}`,
    "Check that workspaceRoot points at the Minecraft project or modpack root and runtimeRoot is writable."
  ].join("\n");
}
