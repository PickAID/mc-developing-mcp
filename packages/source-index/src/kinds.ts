import { basename, extname } from "node:path";

import type { SourceIndexedFileKind } from "./types.js";

export function detectSourceIndexedFileKind(path: string): SourceIndexedFileKind {
  const name = basename(path);
  const extension = extname(path).toLowerCase();

  if (path.endsWith(".d.ts")) {
    return "dts";
  }
  if (extension === ".java") {
    return "java";
  }
  if (extension === ".json") {
    return "json";
  }
  if (name === "pack.mcmeta" || extension === ".mcmeta") {
    return "mcmeta";
  }
  if (extension === ".js" || extension === ".ts") {
    return "script";
  }
  if (extension === ".mcfunction") {
    return "function";
  }
  if (extension === ".lang") {
    return "lang";
  }

  return "other";
}

export function isTextIndexableKind(kind: SourceIndexedFileKind): boolean {
  return kind !== "other";
}
