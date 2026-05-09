import type { RequestExecutionContext } from "./request-execution-context.js";

export function buildContextTexts(context: RequestExecutionContext): string[] {
  return [
    ...(context.classReferences.length > 0
      ? [`Crash log class references: ${context.classReferences.join(", ")}`]
      : []),
    ...(context.mixinTargetClassReferences.length > 0
      ? [
          `Crash log mixin target class references: ${context.mixinTargetClassReferences.join(", ")}`
        ]
      : []),
    ...(context.resourceLocations.length > 0
      ? [`Crash log resource references: ${context.resourceLocations.join(", ")}`]
      : []),
    ...(context.resourcePaths.length > 0
      ? [`Crash log resource paths: ${context.resourcePaths.join(", ")}`]
      : []),
    ...(context.loaderModIds.length > 0
      ? [`Crash log loader mod ids: ${context.loaderModIds.join(", ")}`]
      : []),
    ...context.loaderDependencySummaries.map(
      (summary) => `Crash log loader dependency: ${summary}`
    ),
    ...(context.ftbQuestsErrorSummaries.length > 0
      ? [
          `Crash log FTB Quests schema errors: ${context.ftbQuestsErrorSummaries.join("; ")}`
        ]
      : []),
    ...(context.javaDiagnostics.length > 0
      ? [`Java diagnostics: ${context.javaDiagnostics.join("; ")}`]
      : []),
    ...(context.javaSourcePaths.length > 0
      ? [`Java diagnostic source files: ${context.javaSourcePaths.join(", ")}`]
      : [])
  ];
}
