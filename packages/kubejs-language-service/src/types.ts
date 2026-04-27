export type KubeJsScriptScope = "server" | "startup" | "client" | "shared";

export interface ProbeJsLanguageProjectFile {
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
  mtimeMs: number;
}

export interface DiscoverProbeJsLanguageProjectOptions {
  workspaceRoot: string;
  scope: KubeJsScriptScope;
  maxDeclarationFiles?: number;
}

export interface ProbeJsLanguageProject {
  workspaceRoot: string;
  scope: KubeJsScriptScope;
  declarationFiles: ProbeJsLanguageProjectFile[];
  snippetFiles: ProbeJsLanguageProjectFile[];
  totalDeclarationBytes: number;
  truncated: boolean;
}

export interface CreateKubeJsLanguageServiceProjectOptions {
  workspaceRoot: string;
  scriptFiles: string[];
  declarationFiles: string[];
  virtualFiles?: Array<{
    filePath: string;
    content: string;
  }>;
}

export interface KubeJsLanguageServiceProject {
  workspaceRoot: string;
  scriptFiles: string[];
  declarationFiles: string[];
  dispose(): void;
  updateVirtualFile(filePath: string, content: string): void;
}

export interface KubeJsPositionSearchInput {
  filePath: string;
  search: string;
}

export interface KubeJsDiagnosticsInput {
  filePath: string;
  maxDiagnostics?: number;
}

export interface KubeJsCompletionEntry {
  name: string;
  kind: string;
  source?: string;
}

export interface KubeJsCompletionsResult {
  entries: KubeJsCompletionEntry[];
}

export interface KubeJsQuickInfoResult {
  text: string;
}

export interface KubeJsDiagnostic {
  filePath: string;
  message: string;
  code: number;
  category: string;
  line?: number;
  character?: number;
}
