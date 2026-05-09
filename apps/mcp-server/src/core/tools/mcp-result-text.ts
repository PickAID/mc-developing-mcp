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
  const javaDiagnostics = formatJavaDiagnostics(result);
  if (javaDiagnostics) {
    lines.push(`Java diagnostics: ${javaDiagnostics}`);
  }
  const kubeJsQuality = formatKubeJsQuality(result);
  if (kubeJsQuality) {
    lines.push(`KubeJS quality: ${kubeJsQuality}`);
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

function formatKubeJsQuality(
  result: McpServerRequestExecutorResult
): string | undefined {
  const quality = result.executions
    .map((execution) => recordValue(execution.payload))
    .map((payload) => recordValue(payload?.scriptQualityEvidence))
    .find((candidate) => candidate !== undefined);

  if (!quality) {
    return undefined;
  }

  const issueCount = numberValue(quality.issueCount);
  const severities = recordValue(quality.severityCounts);
  const errors = numberValue(severities?.error) ?? 0;
  const warnings = numberValue(severities?.warning) ?? 0;
  const firstIssue = arrayOfRecords(quality.issues)[0];
  const issueLocation = formatKubeJsIssueLocation(firstIssue);
  const counts =
    issueCount !== undefined
      ? `issues=${issueCount}, errors=${errors}, warnings=${warnings}`
      : undefined;

  return [counts, issueLocation].filter(Boolean).join("; ") || undefined;
}

function formatKubeJsIssueLocation(
  issue: Record<string, unknown> | undefined
): string | undefined {
  if (!issue) {
    return undefined;
  }

  const file = stringValue(issue.file);
  const line = numberValue(issue.line);
  const kind = stringValue(issue.kind);
  if (!file || line === undefined || !kind) {
    return undefined;
  }

  return `${file}:${line} ${kind}`;
}

function formatJavaDiagnostics(
  result: McpServerRequestExecutorResult
): string | undefined {
  const payload = result.executions
    .map((execution) => recordValue(execution.payload))
    .find((candidate) => candidate?.mode === "java_diagnostics");
  const firstFile = arrayOfRecords(payload?.files)[0];
  const firstDiagnostic = arrayOfRecords(firstFile?.diagnostics)[0];
  const message = stringValue(firstDiagnostic?.message);

  if (!firstFile || !message) {
    return undefined;
  }

  const relativePath = stringValue(firstFile.relativePath) ?? "unknown.java";
  const start = recordValue(recordValue(firstDiagnostic.range)?.start);
  const line = numberValue(start?.line);
  const character = numberValue(start?.character);
  const location =
    line !== undefined && character !== undefined
      ? `${relativePath}:${line + 1}:${character + 1}`
      : relativePath;

  return `${location} ${message}`;
}

function formatResourceActions(
  recommendations: MdmPackageRecommendations | undefined
): string | undefined {
  const actions = recommendations?.suggestions
    .flatMap((suggestion) => [
      ...localVanillaSourceActionIds(suggestion.packageId),
      ...(suggestion.mdmReleaseInstall
        ? [`[mdm-install] install_mdm_${suggestion.packageId}`]
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
    ? [
        `[local-generation] generate_local_minecraft_${match.groups.version}_source_pack`
      ]
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
