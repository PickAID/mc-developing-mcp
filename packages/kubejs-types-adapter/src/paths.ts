import { relative, resolve, sep } from "node:path";

export function normalizeWorkspaceRoot(workspaceRoot: string): string {
  const trimmed = workspaceRoot.trim();
  if (trimmed.length === 0) {
    throw new Error("workspaceRoot must not be empty");
  }
  return resolve(trimmed);
}

export function toPosixRelative(workspaceRoot: string, absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).split(sep).join("/");
}

export function isInsideWorkspace(workspaceRoot: string, absolutePath: string): boolean {
  const normalizedRoot = resolve(workspaceRoot);
  const normalizedPath = resolve(absolutePath);
  const rel = relative(normalizedRoot, normalizedPath);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`));
}
