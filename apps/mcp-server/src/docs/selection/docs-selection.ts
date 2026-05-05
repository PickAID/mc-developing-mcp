import {
  selectDocsPackages,
  type DocsPackageSelectionResult
} from "@mcpskill/docs-retrieval";
import type { AgentRuntimeTaskRouteStep, McpServerRequestPlan } from "@mcpskill/shared-types";

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
