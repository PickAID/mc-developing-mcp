import {
  selectDocsPackages,
  type DocsPackageSelectionResult
} from "minecraft-developing-mcp-docs-retrieval";
import type { AgentRuntimeTaskRouteStep, McpServerRequestPlan } from "minecraft-developing-mcp-shared-types";

export function buildMcpServerDocsSelection(
  requestPlan: McpServerRequestPlan,
  candidate: Pick<{ routeStep: AgentRuntimeTaskRouteStep }, "routeStep">
): DocsPackageSelectionResult | undefined {
  if (candidate.routeStep !== "docs_lookup") {
    return undefined;
  }

  return selectDocsPackages({
    requestPlan,
    routeStep: candidate.routeStep
  });
}
