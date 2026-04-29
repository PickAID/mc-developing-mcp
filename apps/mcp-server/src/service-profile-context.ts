import {
  buildMinecraftServiceProfile,
  buildServiceProfilePromptFragment,
  type BuildMinecraftServiceProfileOptions
} from "@mcpskill/service-profile";
import type {
  McpServerBootstrap,
  McpServerRequestContext
} from "@mcpskill/shared-types";

import {
  formatMdmResourceStatusPrompt,
  type MdmResourceStatusContext
} from "./mdm-resource-status.js";
import { buildMcpServerRequestContext } from "./request-context.js";

export interface BuildMcpServerRequestContextWithServiceProfileOptions
  extends Omit<BuildMinecraftServiceProfileOptions, "workspaceRoot"> {
  requestText?: string;
  mdmResources?: MdmResourceStatusContext;
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

  const {
    requestText: _requestText,
    mdmResources,
    ...serviceProfileOptions
  } = options;
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
        appendMdmResourceStatus(serviceProfileFragment, mdmResources)
      ]
    }
  };
}

function appendMdmResourceStatus(
  fragment: ReturnType<typeof buildServiceProfilePromptFragment>,
  mdmResources: MdmResourceStatusContext | undefined
): ReturnType<typeof buildServiceProfilePromptFragment> {
  if (!mdmResources) {
    return fragment;
  }

  return {
    ...fragment,
    text: `${fragment.text}\n${formatMdmResourceStatusPrompt(mdmResources)}`
  };
}
