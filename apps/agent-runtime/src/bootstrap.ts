import type {
  AgentRuntimeBootstrap,
  AgentRuntimeBootstrapOptions,
  WorkspaceBootstrapContext,
  WorkspaceBootstrapInput
} from "minecraft-developing-mcp-shared-types";
import {
  buildHarnessBriefFromSnapshot,
  buildHarnessSnapshot
} from "minecraft-developing-mcp-agent-harness/internal";
import { createDefaultRuntimePolicy } from "minecraft-developing-mcp-runtime-manager";
import {
  detectWorkspace,
  WORKSPACE_DETECTOR_PACKAGE
} from "minecraft-developing-mcp-workspace-detector";

export function buildAgentRuntimeBootstrap(
  runtimeRoot: string
): AgentRuntimeBootstrap;
export function buildAgentRuntimeBootstrap(
  options: AgentRuntimeBootstrapOptions
): Promise<AgentRuntimeBootstrap>;
export function buildAgentRuntimeBootstrap(
  input: string | AgentRuntimeBootstrapOptions
): AgentRuntimeBootstrap | Promise<AgentRuntimeBootstrap> {
  if (typeof input === "string") {
    return createBaseBootstrap(input);
  }

  if (!input.workspace) {
    return Promise.resolve(createBaseBootstrap(input.runtimeRoot));
  }

  return buildWorkspaceContext(input.workspace).then((workspaceContext) => {
    const harnessSnapshot = buildHarnessSnapshot(workspaceContext);

    return {
      ...createBaseBootstrap(input.runtimeRoot),
      workspaceContext,
      defaultRoutePlan: harnessSnapshot.routePlan,
      harnessSnapshot,
      harnessBrief: buildHarnessBriefFromSnapshot(harnessSnapshot)
    };
  });
}

function createBaseBootstrap(runtimeRoot: string): AgentRuntimeBootstrap {
  return {
    appId: "agent-runtime",
    runtimePolicy: createDefaultRuntimePolicy(runtimeRoot),
    harnessPackage: "minecraft-developing-mcp-agent-harness",
    traceEnabled: true
  };
}

async function buildWorkspaceContext(
  workspace: WorkspaceBootstrapInput | undefined
): Promise<WorkspaceBootstrapContext | undefined> {
  if (!workspace) {
    return undefined;
  }

  const descriptor = await detectWorkspace(workspace.workspaceRoot, {
    prismRoot: workspace.prismRoot
  });

  return {
    workspaceRoot: workspace.workspaceRoot,
    prismRoot: workspace.prismRoot,
    detectorPackage: WORKSPACE_DETECTOR_PACKAGE,
    descriptor
  };
}
