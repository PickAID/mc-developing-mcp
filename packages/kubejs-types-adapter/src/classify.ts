import { extname } from "node:path";

import type { KubeJsTypeSourceKind } from "./types.js";

export function classifyKubeJsTypeResource(relativePath: string): KubeJsTypeSourceKind {
  const normalized = relativePath.replaceAll("\\", "/").toLowerCase();
  const segments = normalized.split("/");

  if (normalized.endsWith(".code-snippets")) {
    return "snippet";
  }
  if (extname(normalized) === ".ts" && normalized.endsWith(".d.ts")) {
    return "dts";
  }
  if (segments.includes("snippets")) {
    return "snippet";
  }
  if (segments.includes("items")) {
    return "item";
  }
  if (segments.includes("registries")) {
    return "registry";
  }

  return "other";
}
