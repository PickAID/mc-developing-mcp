import type {
  McpServerBootstrap,
  McpServerRequestContext,
  WorkspaceBootstrapContext
} from "minecraft-developing-mcp-shared-types";
import {
  buildHarnessBriefFromSnapshot,
  buildHarnessSnapshot,
  buildHarnessTaskBriefFromSnapshot
} from "minecraft-developing-mcp-agent-harness/internal";

export function buildMcpServerRequestContext(
  bootstrap: Pick<McpServerBootstrap, "workspaceContext">,
  requestText?: string
): McpServerRequestContext {
  const harnessSnapshot = buildHarnessSnapshot(bootstrap.workspaceContext);

  return {
    appId: "mcp-server",
    requestText,
    workspaceContext: bootstrap.workspaceContext,
    harnessSnapshot,
    harnessBrief: buildHarnessBriefFromSnapshot(harnessSnapshot),
    taskBrief: buildHarnessTaskBriefFromSnapshot(harnessSnapshot, requestText)
  };
}

export function buildMcpServerRequestContextFromBootstrap(
  input: { workspaceContext?: WorkspaceBootstrapContext; requestText?: string }
): McpServerRequestContext {
  return buildMcpServerRequestContext(input, input.requestText);
}
