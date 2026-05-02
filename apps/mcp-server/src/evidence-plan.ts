import type {
  AgentRuntimeTaskRouteStep,
  AgentRuntimeToolName,
  McpServerRequestPlan
} from "@mcpskill/shared-types";

export type McpServerEvidenceProvenance =
  | "logs"
  | "java_diagnostics"
  | "workspace_source"
  | "vanilla_source"
  | "mod_archive_content"
  | "external_mod_resolution"
  | "probejs_types"
  | "datapack_files"
  | "docs";

export interface McpServerEvidenceCandidate {
  id: string;
  priority: number;
  tier: "primary" | "fallback";
  routeStep: AgentRuntimeTaskRouteStep;
  provenance: McpServerEvidenceProvenance;
  preferredTool: AgentRuntimeToolName;
  estimatedCost: "low" | "medium";
  reliability: "high" | "medium";
  reason: string;
  pathHints: string[];
  queryHint?: string;
}

export interface McpServerEvidencePlan {
  appId: "mcp-server";
  requestPlan: McpServerRequestPlan;
  candidates: McpServerEvidenceCandidate[];
  trace: {
    routeSteps: AgentRuntimeTaskRouteStep[];
    candidateIds: string[];
    fallbackCandidateIds: string[];
  };
}

const MAX_MOD_ARCHIVE_PATH_HINTS = 16;

export function buildMcpServerEvidencePlan(
  requestPlan: McpServerRequestPlan
): McpServerEvidencePlan {
  const candidates = requestPlan.toolGuidance.routeSteps.map((step, index) =>
    buildCandidate(requestPlan, step, index)
  );

  return {
    appId: "mcp-server",
    requestPlan,
    candidates,
    trace: {
      routeSteps: [...requestPlan.toolGuidance.routeSteps],
      candidateIds: candidates.map((candidate) => candidate.id),
      fallbackCandidateIds: candidates
        .filter((candidate) => candidate.tier === "fallback")
        .map((candidate) => candidate.id)
    }
  };
}

function buildCandidate(
  requestPlan: McpServerRequestPlan,
  routeStep: AgentRuntimeTaskRouteStep,
  index: number
): McpServerEvidenceCandidate {
  const priority = index + 1;
  const workspaceContext = requestPlan.requestContext.workspaceContext;
  const descriptor = workspaceContext?.descriptor;
  const workspaceRoot = workspaceContext?.workspaceRoot;
  const vanillaSourceRequest = mentionsVanillaSourceRequest(
    requestPlan.requestText
  );
  const vanillaDatapackRequest = mentionsVanillaDatapackRequest(
    requestPlan.requestText
  );
  const vanillaAssetsRequest = mentionsVanillaAssetsRequest(
    requestPlan.requestText
  );

  switch (routeStep) {
    case "java_diagnostics":
      return {
        id: buildCandidateId(priority, routeStep),
        priority,
        tier: "primary",
        routeStep,
        provenance: "java_diagnostics",
        preferredTool: "workspace.analyze",
        estimatedCost: "low",
        reliability: "high",
        reason: "Inspect pending Java LSP diagnostics before source or docs.",
        pathHints: collectWorkspaceSourceHints(descriptor, workspaceRoot),
        queryHint: requestPlan.requestText
      };
    case "log_files":
      return {
        id: buildCandidateId(priority, routeStep),
        priority,
        tier: "primary",
        routeStep,
        provenance: "logs",
        preferredTool: "workspace.analyze",
        estimatedCost: "low",
        reliability: "high",
        reason: "Inspect concrete crash logs before source or docs.",
        pathHints: [...(descriptor?.logPaths ?? [])],
        queryHint: requestPlan.requestText
      };
    case "workspace_source":
      return {
        id: buildCandidateId(priority, routeStep),
        priority,
        tier: "primary",
        routeStep,
        provenance: vanillaSourceRequest ? "vanilla_source" : "workspace_source",
        preferredTool: "source.bundle",
        estimatedCost: "medium",
        reliability: "high",
        reason: vanillaSourceRequest
          ? buildVanillaSourceReason(
              descriptor?.currentRuntime.minecraftVersion
            )
          : "Inspect exact workspace source or build files before docs.",
        pathHints: vanillaSourceRequest
          ? collectVanillaSourceHints(descriptor, workspaceRoot)
          : collectWorkspaceSourceHints(descriptor, workspaceRoot),
        queryHint: requestPlan.requestText
      };
    case "probejs_types":
      return {
        id: buildCandidateId(priority, routeStep),
        priority,
        tier: "primary",
        routeStep,
        provenance: "probejs_types",
        preferredTool: "context.query",
        estimatedCost: "low",
        reliability: "high",
        reason: "Inspect ProbeJS or d.ts context before broader docs.",
        pathHints: collectProbeJsHints(workspaceRoot),
        queryHint: requestPlan.requestText
      };
    case "mod_archive_content":
      return {
        id: buildCandidateId(priority, routeStep),
        priority,
        tier: "primary",
        routeStep,
        provenance: "mod_archive_content",
        preferredTool: "context.query",
        estimatedCost: "medium",
        reliability: "high",
        reason: "Inspect discovered mod jar data, assets, and class paths before docs.",
        pathHints: collectModArchiveHints(descriptor, workspaceRoot),
        queryHint: requestPlan.requestText
      };
    case "external_mod_resolution":
      return {
        id: buildCandidateId(priority, routeStep),
        priority,
        tier: "primary",
        routeStep,
        provenance: "external_mod_resolution",
        preferredTool: "context.query",
        estimatedCost: "low",
        reliability: "high",
        reason:
          "Resolve API-backed external mod candidates and Maven coordinates before docs.",
        pathHints: [],
        queryHint: requestPlan.requestText
      };
    case "datapack_files":
      return {
        id: buildCandidateId(priority, routeStep),
        priority,
        tier: "primary",
        routeStep,
        provenance: "datapack_files",
        preferredTool: "source.bundle",
        estimatedCost: "medium",
        reliability: "high",
        reason: vanillaAssetsRequest
          ? buildVanillaAssetsReason(
              descriptor?.currentRuntime.minecraftVersion
            )
          : vanillaDatapackRequest
          ? buildVanillaDatapackReason(
              descriptor?.currentRuntime.minecraftVersion
            )
          : "Inspect datapack files before secondary docs.",
        pathHints: vanillaAssetsRequest
          ? collectVanillaAssetsHints(descriptor)
          : vanillaDatapackRequest
          ? collectVanillaDatapackHints(descriptor)
          : [...(descriptor?.datapackRoots ?? [])],
        queryHint: requestPlan.requestText
      };
    case "docs_lookup":
      return {
        id: buildCandidateId(priority, routeStep),
        priority,
        tier: "fallback",
        routeStep,
        provenance: "docs",
        preferredTool: "context.query",
        estimatedCost: "medium",
        reliability: "medium",
        reason: "Use docs only after exact workspace or typed evidence.",
        pathHints: [],
        queryHint: requestPlan.requestText
      };
  }
}

function buildCandidateId(
  priority: number,
  routeStep: AgentRuntimeTaskRouteStep
): string {
  return `candidate-${priority}-${routeStep}`;
}

function collectWorkspaceSourceHints(
  descriptor?: { javaSourceRoots: string[]; buildFiles: string[] },
  workspaceRoot?: string
): string[] {
  const pathHints = [
    ...(descriptor?.javaSourceRoots ?? []),
    ...(descriptor?.buildFiles ?? [])
  ];

  if (pathHints.length > 0) {
    return pathHints;
  }

  return workspaceRoot ? [workspaceRoot] : [];
}

function collectProbeJsHints(workspaceRoot?: string): string[] {
  if (!workspaceRoot) {
    return [];
  }

  return [`${workspaceRoot}/.probejs`, `${workspaceRoot}/kubejs/probe`];
}

function collectModArchiveHints(
  descriptor?: { modArchivePaths?: string[] },
  workspaceRoot?: string
): string[] {
  if (descriptor?.modArchivePaths && descriptor.modArchivePaths.length > 0) {
    const hints = descriptor.modArchivePaths.slice(0, MAX_MOD_ARCHIVE_PATH_HINTS);
    return descriptor.modArchivePaths.length > MAX_MOD_ARCHIVE_PATH_HINTS
      ? [
          ...hints,
          `mod-archive-hints:truncated:${descriptor.modArchivePaths.length}`
        ]
      : hints;
  }

  return workspaceRoot ? [`${workspaceRoot}/mods`] : [];
}

function mentionsVanillaSourceRequest(requestText?: string): boolean {
  if (!requestText) {
    return false;
  }

  return /\bnet\.minecraft(?:\.[A-Za-z_][A-Za-z0-9_]*)+\b/.test(requestText);
}

function mentionsVanillaDatapackRequest(requestText?: string): boolean {
  if (!requestText) {
    return false;
  }

  const normalized = requestText.toLowerCase();
  return (
    /\b(?:vanilla|official)\b|原版|官方/.test(normalized) &&
    /\bminecraft:[a-z0-9_.\/-]+\b|data\/minecraft\//.test(normalized)
  );
}

function mentionsVanillaAssetsRequest(requestText?: string): boolean {
  if (!requestText) {
    return false;
  }

  const normalized = requestText.toLowerCase();
  return (
    /\b(?:vanilla|official)\b|原版|官方/.test(normalized) &&
    /assets\/minecraft\//.test(normalized)
  );
}

function buildVanillaSourceReason(minecraftVersion?: string): string {
  if (!minecraftVersion) {
    return "Request targets net.minecraft.* and should resolve through version-bound vanilla source before docs.";
  }

  return `Request targets net.minecraft.* and should resolve through version-bound vanilla source for Minecraft ${minecraftVersion} before docs.`;
}

function collectVanillaSourceHints(
  descriptor?: { buildFiles: string[]; currentRuntime?: { minecraftVersion?: string } },
  workspaceRoot?: string
): string[] {
  const runtimeVersion = descriptor?.currentRuntime?.minecraftVersion;
  const hints = [
    ...(runtimeVersion
      ? [`vanilla-source-pack:minecraft:${runtimeVersion}:named`]
      : ["vanilla-source-pack:minecraft:unresolved:named"]),
    ...(descriptor?.buildFiles ?? [])
  ];

  if (hints.length > 1) {
    return hints;
  }

  return workspaceRoot ? [...hints, workspaceRoot] : hints;
}

function buildVanillaDatapackReason(minecraftVersion?: string): string {
  if (!minecraftVersion) {
    return "Request targets generated vanilla datapack evidence before docs.";
  }

  return `Request targets generated vanilla datapack evidence for Minecraft ${minecraftVersion} before docs.`;
}

function collectVanillaDatapackHints(
  descriptor?: { currentRuntime?: { minecraftVersion?: string } }
): string[] {
  const runtimeVersion = descriptor?.currentRuntime?.minecraftVersion;
  return [
    runtimeVersion
      ? `vanilla-datapack-package:minecraft:${runtimeVersion}:official`
      : "vanilla-datapack-package:minecraft:unresolved:official"
  ];
}

function buildVanillaAssetsReason(minecraftVersion?: string): string {
  if (!minecraftVersion) {
    return "Request targets generated vanilla assets evidence before docs.";
  }

  return `Request targets generated vanilla assets evidence for Minecraft ${minecraftVersion} before docs.`;
}

function collectVanillaAssetsHints(
  descriptor?: { currentRuntime?: { minecraftVersion?: string } }
): string[] {
  const runtimeVersion = descriptor?.currentRuntime?.minecraftVersion;
  return [
    runtimeVersion
      ? `vanilla-assets-package:minecraft:${runtimeVersion}:official`
      : "vanilla-assets-package:minecraft:unresolved:official"
  ];
}
