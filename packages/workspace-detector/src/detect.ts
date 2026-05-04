import type { WorkspaceDescriptor, WorkspaceKind } from "@mcpskill/shared-types";

import {
  collectHintFacts,
  type DetectWorkspaceOptions
} from "./collect-hints.js";
import { collectGradleFacts } from "./collect-gradle.js";
import { collectMetadataFacts } from "./collect-metadata.js";
import { scanWorkspace } from "./filesystem.js";
import { dedupeFacts, resolveCurrentRuntime } from "./runtime.js";

export type { DetectWorkspaceOptions } from "./collect-hints.js";

export async function detectWorkspace(
  root: string,
  options: DetectWorkspaceOptions = {}
): Promise<WorkspaceDescriptor> {
  if (root.trim() === "") {
    throw new Error("root must not be empty");
  }

  const scan = await scanWorkspace(root);
  const [gradleFacts, metadataFacts] = await Promise.all([
    collectGradleFacts(scan),
    collectMetadataFacts(scan)
  ]);
  const hintFacts = collectHintFacts(scan, options);
  const runtimeFacts = dedupeFacts([
    ...gradleFacts,
    ...metadataFacts,
    ...hintFacts
  ]);
  const currentRuntime = resolveCurrentRuntime(runtimeFacts);

  return {
    root: scan.root,
    kind: detectWorkspaceKind(scan, hintFacts.length > 0),
    hasGradle: scan.hasGradle,
    hasKubeJS: scan.hasKubeJS,
    hasProbeJS: scan.hasProbeJS,
    hasModArchives: scan.hasModArchives,
    hasJavaSource: scan.hasJavaSource,
    hasDatapack: scan.hasDatapack,
    hasResourcePack: scan.hasResourcePack,
    buildFiles: scan.buildFiles,
    javaSourceRoots: scan.javaSourceRoots,
    modArchivePaths: scan.modArchivePaths,
    datapackRoots: scan.datapackRoots,
    resourcePackRoots: scan.resourcePackRoots,
    logPaths: scan.logPaths,
    reasons: buildReasons(scan, hintFacts.length > 0),
    currentRuntime
  };
}

function detectWorkspaceKind(
  scan: Awaited<ReturnType<typeof scanWorkspace>>,
  _hasPrismHint: boolean
): WorkspaceKind {
  if (scan.hasGradle && scan.hasKubeJS) {
    return "modpack";
  }
  if (scan.hasModArchives && (scan.hasKubeJS || !scan.hasGradle)) {
    return "modpack";
  }
  if (scan.hasGradle) {
    return "java-mod";
  }
  if (scan.hasKubeJS) {
    return "kubejs";
  }
  return "unknown";
}

function buildReasons(
  scan: Awaited<ReturnType<typeof scanWorkspace>>,
  hasPrismHint: boolean
): string[] {
  const reasons: string[] = [];

  if (scan.hasGradle) {
    reasons.push("detected Gradle build files");
  }
  if (scan.hasJavaSource) {
    reasons.push("detected Java source roots");
  }
  if (scan.hasKubeJS) {
    reasons.push("detected KubeJS directory");
  }
  if (scan.hasProbeJS) {
    reasons.push("detected ProbeJS artifacts");
  }
  if (scan.hasModArchives) {
    reasons.push("detected runtime mod jars");
  }
  if (scan.hasDatapack) {
    reasons.push("detected datapack or resource-pack content");
  }
  if (hasPrismHint) {
    reasons.push("matched PrismLauncher instance layout");
  }

  return reasons;
}
