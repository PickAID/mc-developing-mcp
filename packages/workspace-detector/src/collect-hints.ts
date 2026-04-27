import { join, normalize, relative, resolve, sep } from "node:path";

import type { WorkspaceScan } from "./filesystem.js";
import type { CollectedRuntimeFact } from "./runtime.js";

export interface DetectWorkspaceOptions {
  prismRoot?: string;
}

export function collectHintFacts(
  scan: WorkspaceScan,
  options: DetectWorkspaceOptions = {}
): CollectedRuntimeFact[] {
  const prismFact = createPrismHintFact(scan, options.prismRoot);
  return prismFact ? [prismFact] : [];
}

function createPrismHintFact(
  scan: WorkspaceScan,
  prismRoot: string | undefined
): CollectedRuntimeFact | undefined {
  if (!prismRoot) {
    return undefined;
  }

  const normalizedPrismRoot = normalize(resolve(prismRoot));
  const instancesRoot = join(normalizedPrismRoot, "instances");
  const relativePath = relative(instancesRoot, scan.root);
  if (
    relativePath.startsWith("..") ||
    relativePath === "" ||
    relativePath.startsWith(`..${sep}`)
  ) {
    return undefined;
  }

  const segments = relativePath.split(sep).filter(Boolean);
  if (segments.length !== 2 || segments[1] !== "minecraft") {
    return undefined;
  }

  return {
    weight: "low",
    sourcePath: scan.root,
    kind: "prism-instance-root",
    detail: "workspace matches PrismLauncher instance layout",
    value: segments[0]
  };
}
