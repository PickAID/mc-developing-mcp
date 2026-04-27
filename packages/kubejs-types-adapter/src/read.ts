import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { discoverKubeJsTypeResources } from "./discovery.js";
import { isInsideWorkspace, normalizeWorkspaceRoot } from "./paths.js";
import type {
  KubeJsTypeReadResult,
  KubeJsTypeResourceFile,
  ReadKubeJsTypeResourceOptions
} from "./types.js";

export async function readKubeJsTypeResource(
  options: ReadKubeJsTypeResourceOptions
): Promise<KubeJsTypeReadResult> {
  const workspaceRoot = normalizeWorkspaceRoot(options.workspaceRoot);
  const requestedPath = resolveRequestedPath(workspaceRoot, options);
  const file = await findDiscoveredFile(workspaceRoot, requestedPath);
  const content = await readBudgetedUtf8(file.absolutePath, options.maxBytes);

  return {
    file,
    content: content.text,
    bytesRead: content.bytesRead,
    truncated: content.truncated
  };
}

export async function readBudgetedUtf8(
  absolutePath: string,
  maxBytes: number | undefined
): Promise<{ text: string; bytesRead: number; truncated: boolean }> {
  const bytes = await readFile(absolutePath);
  const budget = normalizeByteBudget(maxBytes, bytes.length);
  const sliced = bytes.subarray(0, budget);

  return {
    text: sliced.toString("utf8"),
    bytesRead: sliced.length,
    truncated: sliced.length < bytes.length
  };
}

async function findDiscoveredFile(
  workspaceRoot: string,
  absolutePath: string
): Promise<KubeJsTypeResourceFile> {
  if (!isInsideWorkspace(workspaceRoot, absolutePath)) {
    throw new Error("requested resource must be inside workspaceRoot");
  }

  const discovered = await discoverKubeJsTypeResources({ workspaceRoot });
  const file = discovered.files.find((candidate) => candidate.absolutePath === absolutePath);

  if (file === undefined) {
    throw new Error("requested resource was not found in discovered ProbeJS roots");
  }

  return file;
}

function resolveRequestedPath(
  workspaceRoot: string,
  options: ReadKubeJsTypeResourceOptions
): string {
  if (options.absolutePath !== undefined) {
    return resolve(options.absolutePath);
  }
  if (options.relativePath !== undefined) {
    return resolve(join(workspaceRoot, options.relativePath));
  }
  throw new Error("absolutePath or relativePath is required");
}

function normalizeByteBudget(maxBytes: number | undefined, fileSize: number): number {
  if (maxBytes === undefined) {
    return fileSize;
  }
  return Math.max(0, Math.min(fileSize, Math.floor(maxBytes)));
}
