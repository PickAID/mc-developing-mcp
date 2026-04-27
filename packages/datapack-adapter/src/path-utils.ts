import { isAbsolute, relative, resolve, sep } from "node:path";

export function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

export function relativePosix(from: string, to: string): string {
  return toPosixPath(relative(from, to));
}

export function isInside(parent: string, child: string): boolean {
  const resolvedParent = resolve(parent);
  const resolvedChild = resolve(child);
  const relativePath = relative(resolvedParent, resolvedChild);

  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}
