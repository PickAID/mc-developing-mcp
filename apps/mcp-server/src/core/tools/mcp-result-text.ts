import type { MdmPackageRecommendations } from "../../docs/mdm-resource/mdm-package-recommendations.js";
import type { McpMdmReleaseInstallResult } from "../../docs/mdm-resource/mdm-release-install.js";
import type { McpServerRequestExecutorResult } from "../../request/execution/request-executor.js";

export function formatMcpDevelopResultText(
  result: McpServerRequestExecutorResult,
  mdmReleaseInstall?: McpMdmReleaseInstallResult,
  mdmPackageRecommendations?: MdmPackageRecommendations
): string {
  const selected = result.selectedEvidence;
  const lines = [
    selected
      ? `Selected: ${selected.candidateId} (${selected.routeStep}, ${selected.preferredTool})`
      : "Selected: none",
    `Route: ${result.trace.routeSteps.join(" -> ")}`,
    `Executed: ${result.trace.executedCandidateIds.join(", ") || "none"}`
  ];
  const workspacePreparation = formatWorkspacePreparation(result);

  if (result.trace.contextCandidateIds.length > 0) {
    lines.push(`Context: ${result.trace.contextCandidateIds.join(", ")}`);
  }
  if (selected?.summary) {
    lines.push(`Summary: ${selected.summary}`);
  }
  if (workspacePreparation) {
    lines.push(`Workspace preparation: ${workspacePreparation}`);
  }
  const resourceActions = formatResourceActions(mdmPackageRecommendations);
  if (resourceActions) {
    lines.push(`Resource actions: ${resourceActions}`);
  }
  if (mdmReleaseInstall) {
    lines.push(
      `MDM release install: ${mdmReleaseInstall.status} (${mdmReleaseInstall.packageId})`
    );
  }

  return lines.join("\n");
}

function formatResourceActions(
  recommendations: MdmPackageRecommendations | undefined
): string | undefined {
  const actions = recommendations?.suggestions
    .flatMap((suggestion) => [
      ...localVanillaSourceActionIds(suggestion.packageId),
      ...(suggestion.mdmReleaseInstall
        ? [`install_mdm_${suggestion.packageId}`]
        : [])
    ])
    .slice(0, 3);

  return actions && actions.length > 0
    ? `${actions.join(", ")} (requires confirmation)`
    : undefined;
}

function localVanillaSourceActionIds(packageId: string): string[] {
  const match = packageId.match(
    /^minecraft-(?<version>.+)-vanilla-source-profile$/u
  );
  return match?.groups?.version
    ? [`generate_local_minecraft_${match.groups.version}_source_pack`]
    : [];
}

function formatWorkspacePreparation(
  result: McpServerRequestExecutorResult
): string | undefined {
  const execution = result.executions.find(
    (item) => item.routeStep === "source_acquisition_plan"
  );
  const payload = recordValue(execution?.payload);
  const workItems = arrayOfRecords(payload?.workItemExecutions);
  const parts = [
    formatGradle(workItems),
    formatProbeJs(workItems),
    formatLocalJar(workItems),
    formatSourceIndex(payload?.sourceIndexPreview)
  ].filter((part): part is string => part !== undefined);

  return parts.length > 0 ? parts.join("; ") : undefined;
}

function formatGradle(workItems: Array<Record<string, unknown>>) {
  const payload = workItemPayload(workItems, "workspace_gradle_dependencies");
  if (!payload || payload.source !== "workspace_gradle") {
    return undefined;
  }

  return compactCounts("gradle", [
    ["dependencies", payload.dependencyCount],
    ["repositories", payload.repositoryCount],
    ["source archives", payload.declaredDependencySourceArchiveCount],
    ["binary archives", payload.declaredDependencyBinaryArchiveCount]
  ]);
}

function formatProbeJs(workItems: Array<Record<string, unknown>>) {
  const payload = workItemPayload(workItems, "workspace_probejs_types");
  const resources = recordValue(payload?.probeResources);
  const summary = recordValue(resources?.summary);
  const counts = recordValue(summary?.totalCounts ?? summary?.counts);
  const itemCount = counts?.item;
  const recipeCount = counts?.recipe;

  if (typeof itemCount !== "number" && typeof recipeCount !== "number") {
    return undefined;
  }

  return compactCounts("probejs", [
    ["items", itemCount],
    ["recipes", recipeCount]
  ]);
}

function formatLocalJar(workItems: Array<Record<string, unknown>>) {
  const payload = workItemPayload(workItems, "jar_index");
  if (!payload || payload.source !== "source_acquisition_jar_index") {
    return undefined;
  }

  return compactCounts("local jar", [
    ["archives", payload.archiveCount],
    ["entries", payload.entryCount]
  ]);
}

function formatSourceIndex(value: unknown) {
  const preview = recordValue(value);
  const matches = arrayOfRecords(preview?.matches);
  if (!preview || matches.length === 0) {
    return undefined;
  }

  return compactCounts("source index", [
    ["databases", preview.searchedDatabaseCount],
    ["matches", matches.length]
  ]);
}

function workItemPayload(
  workItems: Array<Record<string, unknown>>,
  kind: string
): Record<string, unknown> | undefined {
  const item = workItems.find((candidate) => candidate.kind === kind);
  return recordValue(item?.payload);
}

function compactCounts(
  label: string,
  entries: Array<[string, unknown]>
): string | undefined {
  const parts = entries
    .filter(([, value]) => typeof value === "number")
    .map(([name, value]) => `${name}=${value}`);

  return parts.length > 0 ? `${label} ${parts.join(", ")}` : undefined;
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
