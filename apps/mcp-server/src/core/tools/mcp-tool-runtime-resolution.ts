import { homedir } from "node:os";
import { join } from "node:path";

import type {
  McpDevelopToolInput,
  McpToolRuntimeOptions
} from "./mcp-tools.js";

const DEFAULT_RUNTIME_ROOT = join(
  homedir(),
  ".cache",
  "mc-developing-mcp",
  "runtime"
);
const DEFAULT_MDM_SOURCES_ROOT = join(
  homedir(),
  ".local",
  "share",
  "mc-developing-mcp",
  "mdm-sources"
);

export type McpRuntimeEnvironmentSource =
  | "input"
  | "instance_env"
  | "instance_default"
  | "process_env"
  | "process_default"
  | "default";

export interface McpRuntimeEnvironment {
  env: NodeJS.ProcessEnv;
  values: {
    runtimeRoot: string;
    workspaceRoot: string;
    prismRoot?: string;
    mdmSourcesRoot: string;
  };
  sources: {
    runtimeRoot: McpRuntimeEnvironmentSource;
    workspaceRoot: McpRuntimeEnvironmentSource;
    prismRoot?: McpRuntimeEnvironmentSource;
    mdmSourcesRoot: McpRuntimeEnvironmentSource;
  };
  inputPatch: {
    runtimeRoot: string;
    workspaceRoot: string;
    mdmSourcesRoot: string;
    prismRoot?: string;
  };
  envPatch: {
    MC_DEVELOPING_MCP_RUNTIME_ROOT: string;
    MC_DEVELOPING_MCP_WORKSPACE_ROOT: string;
    MC_DEVELOPING_MCP_PRISM_ROOT?: string;
    MDM_SOURCES_ROOT: string;
  };
}

export function resolveToolEnv(
  options: McpToolRuntimeOptions
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...options.env
  };
}

export function resolveMcpRuntimeEnvironment(
  input: McpDevelopToolInput,
  options: McpToolRuntimeOptions
): McpRuntimeEnvironment {
  const env = resolveToolEnv(options);
  const runtimeRootResolution = resolveValueWithSource(
    input.runtimeRoot,
    options.env?.MC_DEVELOPING_MCP_RUNTIME_ROOT,
    undefined,
    process.env.MC_DEVELOPING_MCP_RUNTIME_ROOT,
    undefined,
    DEFAULT_RUNTIME_ROOT
  );
  const workspaceRootResolution = resolveValueWithSource(
    input.workspaceRoot,
    options.env?.MC_DEVELOPING_MCP_WORKSPACE_ROOT,
    undefined,
    process.env.MC_DEVELOPING_MCP_WORKSPACE_ROOT,
    undefined,
    options.cwd ?? process.cwd()
  );
  const prismRootResolution = resolveOptionalValueWithSource(
    input.prismRoot,
    options.env?.MC_DEVELOPING_MCP_PRISM_ROOT,
    process.env.MC_DEVELOPING_MCP_PRISM_ROOT
  );
  const mdmSourcesRootResolution = resolveValueWithSource(
    input.mdmSourcesRoot,
    options.env?.MDM_SOURCES_ROOT,
    options.env?.MDM_SOURCES_DEFAULT_ROOT,
    process.env.MDM_SOURCES_ROOT,
    process.env.MDM_SOURCES_DEFAULT_ROOT,
    DEFAULT_MDM_SOURCES_ROOT
  );
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...env,
    MC_DEVELOPING_MCP_RUNTIME_ROOT: runtimeRootResolution.value,
    MC_DEVELOPING_MCP_WORKSPACE_ROOT: workspaceRootResolution.value,
    MDM_SOURCES_ROOT: mdmSourcesRootResolution.value
  };

  if (prismRootResolution) {
    runtimeEnv.MC_DEVELOPING_MCP_PRISM_ROOT = prismRootResolution.value;
  }

  return {
    env: runtimeEnv,
    values: {
      runtimeRoot: runtimeRootResolution.value,
      workspaceRoot: workspaceRootResolution.value,
      prismRoot: prismRootResolution?.value,
      mdmSourcesRoot: mdmSourcesRootResolution.value
    },
    sources: {
      runtimeRoot: runtimeRootResolution.source,
      workspaceRoot: workspaceRootResolution.source,
      prismRoot: prismRootResolution?.source,
      mdmSourcesRoot: mdmSourcesRootResolution.source
    },
    inputPatch: {
      runtimeRoot: runtimeRootResolution.value,
      workspaceRoot: workspaceRootResolution.value,
      mdmSourcesRoot: mdmSourcesRootResolution.value,
      prismRoot: prismRootResolution?.value
    },
    envPatch: {
      MC_DEVELOPING_MCP_RUNTIME_ROOT: runtimeRootResolution.value,
      MC_DEVELOPING_MCP_WORKSPACE_ROOT: workspaceRootResolution.value,
      MC_DEVELOPING_MCP_PRISM_ROOT: prismRootResolution?.value,
      MDM_SOURCES_ROOT: mdmSourcesRootResolution.value
    }
  };
}

export function resolveRuntimeRoot(
  input: McpDevelopToolInput,
  options: McpToolRuntimeOptions
): string {
  return resolveMcpRuntimeEnvironment(input, options).values.runtimeRoot;
}

export function resolveWorkspaceRoot(
  input: McpDevelopToolInput,
  options: McpToolRuntimeOptions
): string {
  return resolveMcpRuntimeEnvironment(input, options).values.workspaceRoot;
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
      input.gradleSourceDiscovery?.includeDefaultGradleUserHome ?? true
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

function resolveValueWithSource(
  inputValue: string | undefined,
  instanceEnvValue: string | undefined,
  instanceDefaultValue: string | undefined,
  processEnvValue: string | undefined,
  processDefaultValue: string | undefined,
  defaultValue: string
): { value: string; source: McpRuntimeEnvironmentSource } {
  if (inputValue) {
    return { value: inputValue, source: "input" };
  }
  if (instanceEnvValue) {
    return { value: instanceEnvValue, source: "instance_env" };
  }
  if (instanceDefaultValue) {
    return { value: instanceDefaultValue, source: "instance_default" };
  }
  if (processEnvValue) {
    return { value: processEnvValue, source: "process_env" };
  }
  if (processDefaultValue) {
    return { value: processDefaultValue, source: "process_default" };
  }

  return { value: defaultValue, source: "default" };
}

function resolveOptionalValueWithSource(
  inputValue: string | undefined,
  instanceEnvValue: string | undefined,
  processEnvValue: string | undefined
): { value: string; source: McpRuntimeEnvironmentSource } | undefined {
  if (inputValue) {
    return { value: inputValue, source: "input" };
  }
  if (instanceEnvValue) {
    return { value: instanceEnvValue, source: "instance_env" };
  }
  if (processEnvValue) {
    return { value: processEnvValue, source: "process_env" };
  }

  return undefined;
}
