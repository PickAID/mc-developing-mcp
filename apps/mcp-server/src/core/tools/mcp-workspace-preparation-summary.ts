import type { McpServerRequestExecutorResult } from "../../request/execution/request-executor.js";

export function buildWorkspacePreparationEvidenceSummary(
  payload: Record<string, unknown>,
  executions: McpServerRequestExecutorResult["executions"]
) {
  const workItemExecutions = arrayOfRecords(payload.workItemExecutions);
  const summary = {
    gradle: summarizeGradleExecution(workItemExecutions),
    probejs: summarizeProbeJsExecution(workItemExecutions),
    localJar: summarizeJarExecution(workItemExecutions),
    sourceIndex: summarizeSourceIndexPreview(payload.sourceIndexPreview),
    javaDiagnostics: summarizeJavaDiagnosticsExecution(workItemExecutions),
    ftbQuests: summarizeFtbQuestsExecution(executions)
  };

  return Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value !== undefined)
  );
}

function summarizeGradleExecution(executions: Array<Record<string, unknown>>) {
  const execution = findWorkItemPayload(executions, "workspace_gradle_dependencies");
  if (!execution || execution.source !== "workspace_gradle") {
    return undefined;
  }
  const declaredSourceArchiveCount =
    numberValue(execution.declaredDependencySourceArchiveCount) ?? 0;
  const declaredBinaryArchiveCount =
    numberValue(execution.declaredDependencyBinaryArchiveCount) ?? 0;
  const gradleCacheSourceArchiveCount =
    numberValue(execution.gradleCacheSourceArchiveCount) ?? 0;
  const gradleCacheBinaryArchiveCount =
    numberValue(execution.gradleCacheBinaryArchiveCount) ?? 0;
  const declaredSourceArchives = archivePaths(execution.declaredDependencySourceArchives);
  const declaredBinaryArchives = archivePaths(execution.declaredDependencyBinaryArchives);
  const gradleCacheSourceArchives = archivePaths(execution.gradleCacheSourceArchives);
  const gradleCacheBinaryArchives = archivePaths(execution.gradleCacheBinaryArchives);

  return {
    dependencyCount: numberValue(execution.dependencyCount),
    repositoryCount: numberValue(execution.repositoryCount),
    declaredSourceArchiveCount,
    declaredBinaryArchiveCount,
    gradleCacheSourceArchiveCount,
    gradleCacheBinaryArchiveCount,
    sourceArchiveCount: declaredSourceArchiveCount + gradleCacheSourceArchiveCount,
    binaryArchiveCount: declaredBinaryArchiveCount + gradleCacheBinaryArchiveCount,
    declaredSourceArchives,
    declaredBinaryArchives,
    gradleCacheSourceArchives,
    gradleCacheBinaryArchives,
    sourceArchives: declaredSourceArchives.concat(gradleCacheSourceArchives),
    binaryArchives: declaredBinaryArchives.concat(gradleCacheBinaryArchives)
  };
}

function summarizeProbeJsExecution(executions: Array<Record<string, unknown>>) {
  const execution = findWorkItemPayload(executions, "workspace_probejs_types");
  const probeResources = isRecord(execution?.probeResources)
    ? execution.probeResources
    : undefined;
  const summary = isRecord(probeResources?.summary)
    ? probeResources.summary
    : undefined;

  if (!summary) {
    return undefined;
  }

  return {
    counts: summary.counts,
    totalCounts: summary.totalCounts,
    cacheHit: execution?.probeResourceCacheHit
  };
}

function summarizeJarExecution(executions: Array<Record<string, unknown>>) {
  const execution = findWorkItemPayload(executions, "jar_index");
  if (!execution || execution.source !== "source_acquisition_jar_index") {
    return undefined;
  }

  const cache = isRecord(execution.cache) ? execution.cache : undefined;

  return {
    mode: execution.mode,
    archiveCount: numberValue(execution.archiveCount),
    entryCount: numberValue(execution.entryCount),
    tokenPolicy: execution.tokenPolicy,
    cache: cache
      ? {
          archiveHits: numberValue(cache.archiveHits),
          archiveMisses: numberValue(cache.archiveMisses)
        }
      : undefined,
    domainCounts: execution.domainCounts
  };
}

function summarizeSourceIndexPreview(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }
  const matches = arrayOfRecords(value.matches);

  return {
    query: value.query,
    searchedDatabaseCount: numberValue(value.searchedDatabaseCount),
    matchCount: matches.length,
    topPaths: matches
      .map((match) => optionalString(match.path))
      .filter((path): path is string => path !== undefined)
      .slice(0, 5),
    warnings: value.warnings
  };
}

function summarizeJavaDiagnosticsExecution(
  executions: Array<Record<string, unknown>>
) {
  const execution = findWorkItemPayload(executions, "java_diagnostics");
  if (!execution || execution.mode !== "java_diagnostics") {
    return undefined;
  }

  const firstFile = arrayOfRecords(execution.files)[0];
  const firstDiagnostic = arrayOfRecords(firstFile?.diagnostics)[0];
  const firstMessage = optionalString(firstDiagnostic?.message);
  if (!firstFile || !firstMessage) {
    return {
      totalDiagnostics: numberValue(execution.totalDiagnostics)
    };
  }

  return {
    totalDiagnostics: numberValue(execution.totalDiagnostics),
    firstLocation: formatDiagnosticLocation(firstFile, firstDiagnostic),
    firstMessage
  };
}

function summarizeFtbQuestsExecution(
  executions: McpServerRequestExecutorResult["executions"]
) {
  const execution = executions.find((item) => item.routeStep === "datapack_files");
  const payload = isRecord(execution?.payload) ? execution.payload : undefined;
  const summary = isRecord(payload?.ftbQuestsSummary)
    ? payload.ftbQuestsSummary
    : undefined;
  const logSignals = isRecord(summary?.logSignals) ? summary.logSignals : undefined;
  const firstLogError = arrayOfRecords(logSignals?.errors)[0];
  const firstSuggestedSchemaExtension = arrayOfRecords(
    logSignals?.suggestedSchemaExtensions
  )[0];
  const proposal = isRecord(logSignals?.settingsProposal)
    ? logSignals.settingsProposal
    : undefined;
  if (!summary) {
    return undefined;
  }

  return {
    fileCount: numberValue(summary.fileCount),
    schemaSource: isRecord(summary.schemaProfile)
      ? summary.schemaProfile.sourceEvidence
      : undefined,
    topPaths: arrayOfStrings(summary.topPaths).slice(0, 3),
    logErrorCount: numberValue(logSignals?.ftbQuestsErrorCount),
    firstLogError: firstLogError
      ? {
          kind: optionalString(firstLogError.kind),
          path: optionalString(firstLogError.path),
          message: optionalString(firstLogError.message)
        }
      : undefined,
    firstSuggestedSchemaExtension: firstSuggestedSchemaExtension
      ? {
          id: optionalString(firstSuggestedSchemaExtension.id),
          category: optionalString(firstSuggestedSchemaExtension.category),
          paths: arrayOfStrings(firstSuggestedSchemaExtension.paths)
        }
      : undefined,
    settingsProposalTargetPath: proposal?.targetPath,
    settingsProposalMode: proposal?.mode,
    nextAction: isRecord(summary.decisionTrace)
      ? summary.decisionTrace.nextAction
      : undefined
  };
}

function formatDiagnosticLocation(
  file: Record<string, unknown>,
  diagnostic: Record<string, unknown>
): string {
  const relativePath = optionalString(file.relativePath) ?? "unknown.java";
  const start = isRecord(diagnostic.range)
    ? isRecord(diagnostic.range.start)
      ? diagnostic.range.start
      : undefined
    : undefined;
  const line = numberValue(start?.line);
  const character = numberValue(start?.character);

  return line !== undefined && character !== undefined
    ? `${relativePath}:${line + 1}:${character + 1}`
    : relativePath;
}

function findWorkItemPayload(
  executions: Array<Record<string, unknown>>,
  kind: string
): Record<string, unknown> | undefined {
  const execution = executions.find((item) => item.kind === kind);
  return isRecord(execution?.payload) ? execution.payload : undefined;
}

function archivePaths(value: unknown): string[] {
  return arrayOfRecords(value)
    .map((archive) => optionalString(archive.archivePath))
    .filter((path): path is string => path !== undefined)
    .slice(0, 5);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
