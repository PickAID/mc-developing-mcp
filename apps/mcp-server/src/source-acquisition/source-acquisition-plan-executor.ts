import { planSourceAcquisition } from "@mcpskill/source-package-manager";

import type {
  McpServerEvidenceExecutorInput,
  McpServerEvidenceExecutorResult
} from "../request/execution/request-handler.js";

export function executeMcpServerSourceAcquisitionPlan(
  input: McpServerEvidenceExecutorInput
): McpServerEvidenceExecutorResult {
  if (input.candidate.routeStep !== "source_acquisition_plan") {
    return {
      matched: false,
      summary: `source acquisition executor cannot handle ${input.candidate.routeStep}.`
    };
  }

  const descriptor = input.requestPlan.requestContext.workspaceContext?.descriptor;
  const plan = planSourceAcquisition({
    request: {
      purpose: "source_lookup",
      minecraftVersion: descriptor?.currentRuntime.minecraftVersion,
      loader: descriptor?.currentRuntime.loader,
      localJarPaths: descriptor?.modArchivePaths,
      remoteSources: inferRemoteSources(input.requestPlan.requestText ?? "")
    },
    workspace: {
      available: descriptor !== undefined,
      hasGradle: descriptor?.hasGradle,
      hasProbeJs: descriptor?.hasProbeJS
    },
    policies: {
      remoteDownloads: "confirm",
      curseforgeCredentials: false
    }
  });

  return {
    matched: true,
    summary: `Planned ${plan.routes.length} source acquisition routes.`,
    payload: {
      source: "source_acquisition_plan",
      requiresWorkspace: plan.requiresWorkspace,
      routes: plan.routes.map((route) => ({
        origin: route.origin,
        artifactStrategy: route.artifactStrategy,
        cacheMode: route.cacheMode,
        warnings: route.warnings
      }))
    }
  };
}

function inferRemoteSources(
  requestText: string
): Array<"official" | "modrinth" | "curseforge" | "github"> {
  const normalized = requestText.toLowerCase();
  const sources: Array<"official" | "modrinth" | "curseforge" | "github"> = [];

  if (/\b(?:minecraft|vanilla|official)\b|原版|官方/.test(normalized)) {
    sources.push("official");
  }
  if (/\bmodrinth\b/.test(normalized)) {
    sources.push("modrinth");
  }
  if (/\bcurseforge\b|\bcurse\b/.test(normalized)) {
    sources.push("curseforge");
  }
  if (/\bgithub\b|github\.com/.test(normalized)) {
    sources.push("github");
  }

  return sources.length > 0 ? sources : ["official", "modrinth", "curseforge"];
}
