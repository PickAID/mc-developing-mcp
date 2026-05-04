import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import type {
  KubeJsScriptScope,
  ProbeJsLanguageProjectFile
} from "@mcpskill/kubejs-language-service";

export interface KubeJsLifecycleEvidenceInput {
  workspaceRoot: string;
  requestText?: string;
  selectedScriptFile: string;
  selectedScope: KubeJsScriptScope;
  declarationFiles: ProbeJsLanguageProjectFile[];
  scriptFiles: string[];
}

export function buildKubeJsLifecycleEvidence(
  input: KubeJsLifecycleEvidenceInput
) {
  return buildKubeJsLifecycleEvidenceAsync(input);
}

async function buildKubeJsLifecycleEvidenceAsync(
  input: KubeJsLifecycleEvidenceInput
) {
  const declarationSymbols = await inspectDeclarationSymbols(
    input.declarationFiles
  );
  const globalState = await inspectGlobalStateUsages(input);

  return {
    lifecycleEvidence: {
      selectedScope: input.selectedScope,
      selectedScriptFile: relativePath(input.workspaceRoot, input.selectedScriptFile),
      declarationScopes: summarizeDeclarationScopes(input.declarationFiles),
      requestMentions: extractLifecycleMentions(input.requestText)
    },
    nativeEventEvidence: {
      forgeEvents: eventSymbolEvidence("ForgeEvents", input, declarationSymbols),
      forgeModEvents: eventSymbolEvidence("ForgeModEvents", input, declarationSymbols),
      nativeEvents: eventSymbolEvidence("NativeEvents", input, declarationSymbols)
    },
    globalStateEvidence: globalState
  };
}

async function inspectDeclarationSymbols(files: ProbeJsLanguageProjectFile[]) {
  const symbols = new Map<string, string[]>();

  for (const file of files.slice(0, 40)) {
    const text = await readLimitedText(file.absolutePath, 96_000);
    for (const symbol of ["ForgeEvents", "ForgeModEvents", "NativeEvents"]) {
      if (new RegExp(`\\b${symbol}\\b`).test(text)) {
        const existing = symbols.get(symbol) ?? [];
        existing.push(file.relativePath);
        symbols.set(symbol, existing);
      }
    }
  }

  return symbols;
}

function eventSymbolEvidence(
  symbol: string,
  input: KubeJsLifecycleEvidenceInput,
  declarationSymbols: Map<string, string[]>
) {
  const declarationFiles = declarationSymbols.get(symbol) ?? [];
  const requested = requestMentions(input.requestText, symbol);
  const availability =
    declarationFiles.length > 0 ? "verified_by_probejs" : "not_verified";
  const warnings: string[] = [];

  if (symbol === "ForgeEvents" && input.selectedScope !== "startup") {
    warnings.push(
      "Core KubeJS 1.20.1 exposes ForgeEvents as startup-only; require ProbeJS/addon evidence before using it in reloadable scopes."
    );
  }
  if (symbol === "NativeEvents" && declarationFiles.length === 0) {
    warnings.push(
      "NativeEvents must be proven by current ProbeJS declarations or addon evidence before recommendation."
    );
  }

  return {
    requested,
    availability,
    declarationFiles: declarationFiles.slice(0, 8),
    selectedScope: input.selectedScope,
    warnings
  };
}

async function inspectGlobalStateUsages(input: KubeJsLifecycleEvidenceInput) {
  const usages = [];

  for (const file of input.scriptFiles.slice(0, 200)) {
    const text = await readLimitedText(file, 64_000);
    const scope = inferScopeFromPath(file, input.workspaceRoot);
    usages.push(...extractGlobalUsages(input.workspaceRoot, file, scope, text));
  }

  const keys = [...new Set(usages.map((usage) => usage.key))].sort();

  return {
    usageCount: usages.length,
    keys: keys.slice(0, 30),
    usages: usages.slice(0, 40),
    riskyKeys: keys.filter(isRiskyGlobalKey).slice(0, 12),
    warnings: [
      "Treat global/Global as lifecycle-sensitive shared state; require ownership evidence before mutating existing keys."
    ]
  };
}

function extractGlobalUsages(
  workspaceRoot: string,
  filePath: string,
  scope: KubeJsScriptScope,
  text: string
) {
  const usages = [];
  const pattern =
    /\b(global|Global)(?:\.([A-Za-z_$][\w$]*)|\[\s*["']([^"']+)["']\s*\])\s*(=|\(|\+\+|--)?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const key = match[2] ?? match[3];
    if (!key) {
      continue;
    }
    usages.push({
      file: relativePath(workspaceRoot, filePath),
      line: lineNumberAt(text, match.index),
      scope,
      object: match[1],
      key,
      operation: classifyOperation(match[4])
    });
  }

  return usages;
}

function classifyOperation(operator: string | undefined) {
  switch (operator) {
    case "=":
      return "write";
    case "(":
      return "call";
    case "++":
    case "--":
      return "update";
    default:
      return "read";
  }
}

function summarizeDeclarationScopes(files: ProbeJsLanguageProjectFile[]) {
  const scopes = new Set(files.map((file) => scopeSegment(file.relativePath)));
  return [...scopes].sort();
}

function scopeSegment(path: string): string {
  if (path.includes("/server/")) {
    return "server";
  }
  if (path.includes("/startup/")) {
    return "startup";
  }
  if (path.includes("/client/")) {
    return "client";
  }
  return "legacy_or_shared";
}

function inferScopeFromPath(
  filePath: string,
  workspaceRoot: string
): KubeJsScriptScope {
  const relativeScript = relativePath(workspaceRoot, filePath);
  if (relativeScript.includes("/startup_scripts/")) {
    return "startup";
  }
  if (relativeScript.includes("/client_scripts/")) {
    return "client";
  }
  if (relativeScript.includes("/server_scripts/")) {
    return "server";
  }
  return "shared";
}

function extractLifecycleMentions(requestText: string | undefined): string[] {
  const normalized = requestText?.toLowerCase() ?? "";
  return ["startup_scripts", "server_scripts", "client_scripts", "startup", "server", "client"]
    .filter((term) => normalized.includes(term));
}

function requestMentions(requestText: string | undefined, symbol: string): boolean {
  return new RegExp(`\\b${symbol}\\b`, "i").test(requestText ?? "");
}

function isRiskyGlobalKey(key: string): boolean {
  return /^(data|cache|state|temp|tmp|config|registry|items?)$/i.test(key);
}

async function readLimitedText(path: string, maxBytes: number): Promise<string> {
  const buffer = await readFile(path);
  return buffer.subarray(0, maxBytes).toString("utf8");
}

function relativePath(workspaceRoot: string, filePath: string): string {
  return relative(resolve(workspaceRoot), resolve(filePath)).replaceAll("\\", "/");
}

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}
