import type {
  McpServerEvidenceCandidate,
  McpServerEvidencePlan
} from "../evidence/evidence-plan.js";
import type { McpServerRequestPlan } from "minecraft-developing-mcp-shared-types";

const WORKSPACE_PREPARATION_CONTEXT_STEPS = new Set(["datapack_files"]);

export function shouldContinueWorkspacePreparationCandidate(
  candidate: McpServerEvidenceCandidate,
  evidencePlan: McpServerEvidencePlan
): boolean {
  const requestPlan = evidencePlan.requestPlan;
  if (candidate.routeStep === "source_acquisition_plan") {
    return (
      requestPlan.trace.taskIntent.id === "workspace_preparation" &&
      mentionsLocalPackEvidence(requestPlan.requestText) &&
      hasLaterWorkspacePreparationContextStep(candidate, evidencePlan)
    );
  }

  return (
    requestPlan.trace.taskIntent.id === "workspace_preparation" &&
    mentionsLocalPackEvidence(requestPlan.requestText) &&
    WORKSPACE_PREPARATION_CONTEXT_STEPS.has(candidate.routeStep)
  );
}

function hasLaterWorkspacePreparationContextStep(
  candidate: McpServerEvidenceCandidate,
  evidencePlan: McpServerEvidencePlan
): boolean {
  return evidencePlan.candidates.some(
    (entry) =>
      entry.priority > candidate.priority &&
      WORKSPACE_PREPARATION_CONTEXT_STEPS.has(entry.routeStep)
  );
}

function mentionsLocalPackEvidence(requestText: string | undefined): boolean {
  return /ftb|quests?|datapacks?|resource\s*packs?|数据包|资源包|任务书|任务线/u.test(
    requestText ?? ""
  );
}
