import type {
  AgentRuntimePromptFragment,
  AgentRuntimePromptFragmentId,
  McpServerPromptAssembly,
  McpServerPromptSection,
  McpServerRequestContext
} from "minecraft-developing-mcp-shared-types";

export function buildMcpServerPromptAssembly(
  requestContext: McpServerRequestContext
): McpServerPromptAssembly {
  const sections = buildPromptSections(requestContext);

  return {
    sections,
    text: sections.map(formatPromptSection).join("\n\n")
  };
}

function buildPromptSections(
  requestContext: McpServerRequestContext
): McpServerPromptSection[] {
  const sections: McpServerPromptSection[] = [];

  if (requestContext.requestText) {
    sections.push({
      id: "request_text",
      role: "user",
      title: "User Request",
      text: requestContext.requestText
    });
  }

  for (const fragment of requestContext.taskBrief.promptFragments) {
    sections.push({
      id: fragment.id,
      role: "system",
      title: formatFragmentTitle(fragment.id),
      text: fragment.text
    });
  }

  return sections;
}

function formatPromptSection(section: McpServerPromptSection): string {
  return `[${section.title}]\n${section.text}`;
}

function formatFragmentTitle(id: AgentRuntimePromptFragmentId): string {
  switch (id) {
    case "workspace_summary":
      return "Workspace Summary";
    case "route_policy":
      return "Default Route Policy";
    case "tool_policy":
      return "Tool Policy";
    case "kubejs_authoring_policy":
      return "KubeJS Authoring Policy";
    case "service_profile":
      return "Service Profile";
    case "task_intent_summary":
      return "Task Intent";
    case "task_route_policy":
      return "Task Route Policy";
    case "task_tool_policy":
      return "Task Tool Policy";
    case "task_evidence_policy":
      return "Task Evidence Policy";
    case "task_workspace_preparation_policy":
      return "Task Workspace Preparation Policy";
    case "task_client_visual_capability_policy":
      return "Task Client Visual Capability Policy";
    case "task_kubejs_scripting_policy":
      return "Task KubeJS Scripting Policy";
  }
}
