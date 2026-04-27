import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";

import { formatKubeJsDiagnostics } from "./diagnostics.js";
import type {
  CreateKubeJsLanguageServiceProjectOptions,
  KubeJsCompletionsResult,
  KubeJsDiagnosticsInput,
  KubeJsDiagnostic,
  KubeJsLanguageServiceProject,
  KubeJsPositionSearchInput,
  KubeJsQuickInfoResult
} from "./types.js";

interface InternalKubeJsLanguageServiceProject
  extends KubeJsLanguageServiceProject {
  service: ts.LanguageService;
  virtualFiles: Map<string, string>;
}

export function createKubeJsLanguageServiceProject(
  options: CreateKubeJsLanguageServiceProjectOptions
): KubeJsLanguageServiceProject {
  const workspaceRoot = resolve(options.workspaceRoot);
  const scriptFiles = options.scriptFiles.map((file) => resolve(file));
  const declarationFiles = options.declarationFiles.map((file) => resolve(file));
  const virtualFiles = new Map(
    (options.virtualFiles ?? []).map((file) => [
      resolve(file.filePath),
      file.content
    ])
  );
  const files = new Set([...scriptFiles, ...declarationFiles, ...virtualFiles.keys()]);
  const versions = new Map([...files].map((file) => [file, 1]));
  const compilerOptions: ts.CompilerOptions = {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    types: []
  };
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => compilerOptions,
    getScriptFileNames: () => [...files],
    getScriptVersion: (fileName) => String(versions.get(resolve(fileName)) ?? 1),
    getScriptSnapshot: (fileName) => {
      const resolvedFile = resolve(fileName);
      const virtualContent = virtualFiles.get(resolvedFile);
      if (virtualContent !== undefined) {
        return ts.ScriptSnapshot.fromString(virtualContent);
      }
      if (!existsSync(resolvedFile)) {
        return undefined;
      }
      return ts.ScriptSnapshot.fromString(readFileSync(resolvedFile, "utf8"));
    },
    getCurrentDirectory: () => workspaceRoot,
    getDefaultLibFileName: (settings) => ts.getDefaultLibFilePath(settings),
    fileExists: (fileName) => virtualFiles.has(resolve(fileName)) || existsSync(fileName),
    readFile: (fileName) => {
      const virtualContent = virtualFiles.get(resolve(fileName));
      if (virtualContent !== undefined) {
        return virtualContent;
      }
      return existsSync(fileName) ? readFileSync(fileName, "utf8") : undefined;
    },
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames
  };
  const service = ts.createLanguageService(host);

  const project: InternalKubeJsLanguageServiceProject = {
    workspaceRoot,
    scriptFiles,
    declarationFiles,
    service,
    virtualFiles,
    dispose: () => service.dispose(),
    updateVirtualFile: (filePath, content) => {
      const resolvedFile = resolve(filePath);
      virtualFiles.set(resolvedFile, content);
      files.add(resolvedFile);
      versions.set(resolvedFile, (versions.get(resolvedFile) ?? 1) + 1);
    }
  };

  return project;
}

export function getKubeJsCompletions(
  project: KubeJsLanguageServiceProject,
  input: KubeJsPositionSearchInput
): KubeJsCompletionsResult {
  const internal = asInternalProject(project);
  const position =
    findPosition(internal, input.filePath, input.search) + input.search.length;
  const completions = internal.service.getCompletionsAtPosition(
    input.filePath,
    position,
    {}
  );

  return {
    entries:
      completions?.entries.map((entry) => ({
        name: entry.name,
        kind: entry.kind,
        source: entry.source
      })) ?? []
  };
}

export function getKubeJsQuickInfo(
  project: KubeJsLanguageServiceProject,
  input: KubeJsPositionSearchInput
): KubeJsQuickInfoResult {
  const internal = asInternalProject(project);
  const position = findPosition(internal, input.filePath, input.search);
  const quickInfo = internal.service.getQuickInfoAtPosition(input.filePath, position);

  return {
    text: ts.displayPartsToString(quickInfo?.displayParts)
  };
}

export function getKubeJsDiagnostics(
  project: KubeJsLanguageServiceProject,
  input: KubeJsDiagnosticsInput
): KubeJsDiagnostic[] {
  const internal = asInternalProject(project);
  const diagnostics = [
    ...internal.service.getSyntacticDiagnostics(input.filePath),
    ...internal.service.getSemanticDiagnostics(input.filePath)
  ];

  return formatKubeJsDiagnostics(diagnostics, input.maxDiagnostics);
}

function asInternalProject(
  project: KubeJsLanguageServiceProject
): InternalKubeJsLanguageServiceProject {
  return project as InternalKubeJsLanguageServiceProject;
}

function findPosition(
  project: InternalKubeJsLanguageServiceProject,
  filePath: string,
  search: string
): number {
  const content =
    project.virtualFiles.get(resolve(filePath)) ?? readFileSync(filePath, "utf8");
  const position = content.indexOf(search);

  if (position < 0) {
    throw new Error(`Search text was not found in KubeJS script: ${search}`);
  }

  return position;
}
