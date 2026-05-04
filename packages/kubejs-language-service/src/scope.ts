import { relative } from "node:path";

import type { KubeJsScriptScope } from "./types.js";

export type InferredKubeJsScriptScope = "startup" | "server" | "client" | "unknown";
export type KubeJsScriptScopeConfidence = "high" | "medium" | "low" | "unknown";

export interface InferKubeJsScriptScopeInput {
  request?: string;
  selectedPath?: string;
}

export interface InferKubeJsScriptScopeResult {
  scope: InferredKubeJsScriptScope;
  confidence: KubeJsScriptScopeConfidence;
  reasons: string[];
  mismatch?: {
    requested?: string;
    selected?: string;
  };
}

export function classifyKubeJsScriptScope(
  filePath: string,
  workspaceRoot: string
): KubeJsScriptScope {
  const relativePath = relative(workspaceRoot, filePath).replaceAll("\\", "/");
  const segments = relativePath.split("/");
  const kubejsIndex = segments.lastIndexOf("kubejs");
  const scopeDirectory = kubejsIndex >= 0 ? segments[kubejsIndex + 1] : undefined;

  switch (scopeDirectory) {
    case "server_scripts":
      return "server";
    case "startup_scripts":
      return "startup";
    case "client_scripts":
      return "client";
    default:
      return "shared";
  }
}

export function inferKubeJSScriptScope(
  input: InferKubeJsScriptScopeInput
): InferKubeJsScriptScopeResult {
  const selected = inferScopeFromPath(input.selectedPath);
  const requested = inferScopeFromRequest(input.request);
  const reasons = [...selected.reasons, ...requested.reasons];

  if (selected.scope && requested.scope && selected.scope !== requested.scope) {
    reasons.push("selectedPath and request imply different scopes");

    return {
      scope: selected.scope,
      confidence: "medium",
      reasons,
      mismatch: {
        requested: requested.scope,
        selected: selected.scope
      }
    };
  }

  if (selected.scope) {
    return {
      scope: selected.scope,
      confidence: "high",
      reasons
    };
  }

  if (requested.scope) {
    return {
      scope: requested.scope,
      confidence: "medium",
      reasons
    };
  }

  return {
    scope: "unknown",
    confidence: "unknown",
    reasons: ["no KubeJS scope signal found"]
  };
}

function inferScopeFromPath(
  selectedPath: string | undefined
): { scope?: InferredKubeJsScriptScope; reasons: string[] } {
  const normalized = selectedPath?.replaceAll("\\", "/").toLowerCase();

  if (!normalized) {
    return { reasons: [] };
  }

  if (normalized.includes("kubejs/startup_scripts/")) {
    return {
      scope: "startup",
      reasons: ["selectedPath matched kubejs/startup_scripts"]
    };
  }

  if (normalized.includes("kubejs/server_scripts/")) {
    return {
      scope: "server",
      reasons: ["selectedPath matched kubejs/server_scripts"]
    };
  }

  if (normalized.includes("kubejs/client_scripts/")) {
    return {
      scope: "client",
      reasons: ["selectedPath matched kubejs/client_scripts"]
    };
  }

  return { reasons: [] };
}

function inferScopeFromRequest(
  request: string | undefined
): { scope?: InferredKubeJsScriptScope; reasons: string[] } {
  const text = request?.toLowerCase() ?? "";
  const reasons: string[] = [];

  if (hasWord(text, "startup")) {
    reasons.push("request mentioned startup");
  }

  if (hasLifecycleStartupSignal(text)) {
    reasons.push("request mentioned lifecycle startup context");
  }

  if (reasons.length > 0) {
    return { scope: "startup", reasons };
  }

  if (hasWord(text, "server")) {
    return { scope: "server", reasons: ["request mentioned server"] };
  }

  if (hasWord(text, "client")) {
    return { scope: "client", reasons: ["request mentioned client"] };
  }

  return { reasons: [] };
}

function hasLifecycleStartupSignal(text: string): boolean {
  return /\b(lifecycle|registry|registries|register|startup_events)\b/.test(text);
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`).test(text);
}
