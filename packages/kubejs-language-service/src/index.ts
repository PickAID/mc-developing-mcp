export const KUBEJS_LANGUAGE_SERVICE_PACKAGE =
  "minecraft-developing-mcp-kubejs-language-service";

export { createKubeJsLanguageServiceCache } from "./cache.js";
export {
  createKubeJsLanguageServiceProject,
  getKubeJsCompletions,
  getKubeJsDiagnostics,
  getKubeJsQuickInfo
} from "./language-service.js";
export { discoverProbeJsLanguageProject } from "./probejs-project.js";
export { classifyKubeJsScriptScope, inferKubeJSScriptScope } from "./scope.js";
export type {
  InferKubeJsScriptScopeInput,
  InferKubeJsScriptScopeResult,
  InferredKubeJsScriptScope,
  KubeJsScriptScopeConfidence
} from "./scope.js";
export type {
  DisposableKubeJsLanguageProject,
  KubeJsLanguageServiceCache,
  KubeJsLanguageServiceCacheOptions
} from "./cache.js";
export type {
  CreateKubeJsLanguageServiceProjectOptions,
  DiscoverProbeJsLanguageProjectOptions,
  KubeJsCompletionEntry,
  KubeJsCompletionsResult,
  KubeJsDiagnostic,
  KubeJsDiagnosticsInput,
  KubeJsLanguageServiceProject,
  KubeJsPositionSearchInput,
  KubeJsQuickInfoResult,
  KubeJsScriptScope,
  ProbeJsLanguageProject,
  ProbeJsLanguageProjectFile
} from "./types.js";
