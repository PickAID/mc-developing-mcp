import {
  buildMinecraftServiceProfile,
  buildServiceProfilePromptFragment,
  type BuildMinecraftServiceProfileOptions
} from "@mcpskill/service-profile";
import type {
  McpServerBootstrap,
  McpServerRequestContext
} from "@mcpskill/shared-types";

import { buildMcpServerRequestContext } from "./request-context.js";

export interface BuildMcpServerRequestContextWithServiceProfileOptions
  extends Omit<BuildMinecraftServiceProfileOptions, "workspaceRoot"> {
  requestText?: string;
}

export async function buildMcpServerRequestContextWithServiceProfile(
  bootstrap: Pick<McpServerBootstrap, "workspaceContext">,
  options: BuildMcpServerRequestContextWithServiceProfileOptions = {}
): Promise<McpServerRequestContext> {
  const context = buildMcpServerRequestContext(bootstrap, options.requestText);
  const workspaceRoot = bootstrap.workspaceContext?.workspaceRoot;

  if (!workspaceRoot) {
    return context;
  }

  const { requestText: _requestText, ...serviceProfileOptions } = options;
  const serviceProfile = await buildMinecraftServiceProfile({
    ...serviceProfileOptions,
    workspaceRoot
  });
  const serviceProfileFragment =
    buildServiceProfilePromptFragment(serviceProfile);

  return {
    ...context,
    taskBrief: {
      ...context.taskBrief,
      promptFragments: [
        ...context.taskBrief.promptFragments,
        serviceProfileFragment
      ]
    }
  };
}
