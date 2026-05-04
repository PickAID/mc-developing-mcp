import type {
  AgentRuntimeTaskRouteStep,
  DocsPackageManifest,
  McpServerRequestPlan
} from "@mcpskill/shared-types";
import {
  buildPackageRegistry,
  type PackageRegistry
} from "@mcpskill/package-registry";

import { BUILTIN_DOCS_PACKAGES } from "./builtin-packages.js";

export interface DocsPackageSelection {
  packageId: string;
  score: number;
  reasons: string[];
  matchedSignals: string[];
  manifest: DocsPackageManifest;
}

export interface DocsPackageRejection {
  packageId: string;
  reason: string;
}

export interface DocsPackageSelectionResult {
  selections: DocsPackageSelection[];
  trace: {
    registryPackageIds: string[];
    requestRuntimeVersion?: string;
    taskIntentId: string;
    routeStep?: AgentRuntimeTaskRouteStep;
    rejectedPackages: DocsPackageRejection[];
  };
}

export interface SelectDocsPackagesInput {
  requestPlan: McpServerRequestPlan;
  routeStep?: AgentRuntimeTaskRouteStep;
  registry?: PackageRegistry<DocsPackageManifest>;
}

export function buildBuiltinDocsRegistry(): PackageRegistry<DocsPackageManifest> {
  return buildPackageRegistry(BUILTIN_DOCS_PACKAGES);
}

export function selectDocsPackages(
  input: SelectDocsPackagesInput
): DocsPackageSelectionResult {
  const registry = input.registry ?? buildBuiltinDocsRegistry();
  const requestText = [
    input.requestPlan.requestText,
    input.requestPlan.requestContext.requestText
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  const runtimeVersion =
    input.requestPlan.requestContext.workspaceContext?.descriptor.currentRuntime.minecraftVersion;
  const taskIntentId = input.requestPlan.trace.taskIntent.id;
  const descriptor = input.requestPlan.requestContext.workspaceContext?.descriptor;
  const rejectedPackages: DocsPackageRejection[] = [];
  const selections: DocsPackageSelection[] = [];

  for (const manifest of registry.packages) {
    if (!manifest.preferredIntents.includes(taskIntentId)) {
      rejectedPackages.push({
        packageId: manifest.packageId,
        reason: `task intent ${taskIntentId} is outside the package intent scope`
      });
      continue;
    }

    if (
      runtimeVersion &&
      manifest.versionFence.strict &&
      !manifest.versionFence.minecraftVersions.includes(runtimeVersion)
    ) {
      rejectedPackages.push({
        packageId: manifest.packageId,
        reason: `workspace runtime ${runtimeVersion} is outside the package version fence`
      });
      continue;
    }

    if (input.routeStep && input.routeStep !== "docs_lookup") {
      rejectedPackages.push({
        packageId: manifest.packageId,
        reason: `route step ${input.routeStep} does not request docs retrieval`
      });
      continue;
    }

    const reasons = [`task intent is ${taskIntentId}`];
    let score = 5;

    if (runtimeVersion && manifest.minecraftVersions.includes(runtimeVersion)) {
      reasons.push(`workspace runtime matches Minecraft ${runtimeVersion}`);
      score += 4;
    } else if (!runtimeVersion && mentionsStrictVersion(requestText, manifest)) {
      reasons.push(
        `request text matches strict Minecraft ${manifest.minecraftVersions[0]} fence`
      );
      score += 3;
    }

    if (input.routeStep === "docs_lookup") {
      reasons.push("route step is docs_lookup");
      score += 1;
    }

    if (descriptor?.hasKubeJS || descriptor?.hasProbeJS) {
      reasons.push("workspace exposes KubeJS or ProbeJS signals");
      score += 2;
    }

    const matchedSignals = collectMatchedSignals(requestText, manifest);
    if (matchedSignals.length > 0) {
      reasons.push(`query matches package signals: ${matchedSignals.join(", ")}`);
      score += matchedSignals.length;
    }

    selections.push({
      packageId: manifest.packageId,
      score,
      reasons,
      matchedSignals,
      manifest
    });
  }

  selections.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    return left.packageId.localeCompare(right.packageId);
  });

  return {
    selections,
    trace: {
      registryPackageIds: [...registry.packageIds],
      requestRuntimeVersion: runtimeVersion,
      taskIntentId,
      routeStep: input.routeStep,
      rejectedPackages
    }
  };
}

function mentionsStrictVersion(
  requestText: string,
  manifest: DocsPackageManifest
): boolean {
  return manifest.versionFence.minecraftVersions.some((version) =>
    requestText.includes(version.toLowerCase())
  );
}

function collectMatchedSignals(
  requestText: string,
  manifest: DocsPackageManifest
): string[] {
  const matched = new Set<string>();

  for (const signal of [
    ...manifest.querySignals.queryTerms,
    ...manifest.querySignals.addonNames,
    ...manifest.querySignals.scriptScopes,
    ...manifest.querySignals.eventNames,
    ...(manifest.querySignals.assetKinds ?? []),
    ...(manifest.querySignals.resourceFormats ?? []),
    ...(manifest.querySignals.shaderTerms ?? []),
    ...(manifest.querySignals.apiSymbols ?? []),
    ...(manifest.querySignals.migrationTerms ?? [])
  ]) {
    if (requestText.includes(signal.toLowerCase())) {
      matched.add(signal.toLowerCase());
    }
  }

  return [...matched];
}
