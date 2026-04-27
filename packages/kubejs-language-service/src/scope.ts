import { relative } from "node:path";

import type { KubeJsScriptScope } from "./types.js";

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
