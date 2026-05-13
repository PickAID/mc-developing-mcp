import type {
  AgentRuntimeTaskRouteStep,
  AgentRuntimeToolName,
  McpServerRequestPlan
} from "minecraft-developing-mcp-shared-types";
import type { McpOperationInput } from "./evidence-operation-input.js";

export type McpServerEvidenceProvenance =
  | "logs"
  | "java_diagnostics"
  | "workspace_source"
  | "source_acquisition"
  | "vanilla_source"
  | "mod_archive_content"
  | "external_mod_resolution"
  | "probejs_types"
  | "resource_pack_files"
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
  operationInput?: McpOperationInput;
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
  const routeSteps = expandRouteSteps(requestPlan);
  return buildEvidencePlanForRouteSteps(requestPlan, routeSteps);
}

export function buildMcpServerEvidencePlanForRouteSteps(
  requestPlan: McpServerRequestPlan,
  routeSteps: AgentRuntimeTaskRouteStep[]
): McpServerEvidencePlan {
  return buildEvidencePlanForRouteSteps(requestPlan, routeSteps);
}

export function buildMcpServerEvidencePlanForOperations(
  requestPlan: McpServerRequestPlan,
  operations: Array<{ kind: AgentRuntimeTaskRouteStep; input?: McpOperationInput }>
): McpServerEvidencePlan {
  const candidates = operations.map((operation, index) => {
    const candidate = buildCandidate(requestPlan, operation.kind, index);

    return applyOperationInput(candidate, operation.input, requestPlan);
  });

  return {
    appId: "mcp-server",
    requestPlan,
    candidates,
    trace: {
      routeSteps: operations.map((operation) => operation.kind),
      candidateIds: candidates.map((candidate) => candidate.id),
      fallbackCandidateIds: candidates
        .filter((candidate) => candidate.tier === "fallback")
        .map((candidate) => candidate.id)
    }
  };
}

function applyOperationInput(
  candidate: McpServerEvidenceCandidate,
  input: McpOperationInput | undefined,
  requestPlan: McpServerRequestPlan
): McpServerEvidenceCandidate {
  const queryHint = buildOperationQueryHint(input) ?? candidate.queryHint;
  const base = {
    ...candidate,
    operationInput: input,
    queryHint
  };

  if (candidate.routeStep !== "workspace_source" || !input?.vanillaSource) {
    return base;
  }

  return {
    ...base,
    provenance: "vanilla_source",
    reason:
      "Resolve explicit vanilla source operation input before broader workspace docs.",
    pathHints: collectVanillaSourceHints(
      requestPlan.requestContext.workspaceContext?.descriptor,
      requestPlan.requestContext.workspaceContext?.workspaceRoot
    )
  };
}

function buildOperationQueryHint(
  input: McpOperationInput | undefined
): string | undefined {
  if (!input) {
    return undefined;
  }

  const parts = [
    input.docsQuery,
    input.sourceAcquisition?.sourceIndexQuery,
    input.sourceAcquisition?.minecraftVersion,
    input.sourceAcquisition?.mapping?.family,
    input.workspaceSource?.javaSymbols?.join(" "),
    input.workspaceSource?.javaPaths?.join(" "),
    input.workspaceSource?.buildFiles?.join(" "),
    input.probeJs?.symbol,
    input.probeJs?.resourceKinds?.join(" "),
    input.probeJs?.resourceQueries?.join(" "),
    input.modArchive?.archive,
    input.modArchive?.queries?.join(" "),
    input.modArchive?.entryPaths?.join(" "),
    input.modArchive?.classOwners?.join(" "),
    input.modArchive?.mixinTargets?.join(" "),
    input.modArchive?.decompileClasses?.join(" "),
    input.datapack?.resourceLocations?.join(" "),
    input.datapack?.paths?.join(" "),
    input.logFiles?.paths?.join(" "),
    input.vanillaSource?.symbol,
    input.vanillaSource?.relativePath
  ].filter((part): part is string => typeof part === "string" && part.length > 0);

  return parts.length > 0 ? parts.join(" ") : undefined;
}

function buildEvidencePlanForRouteSteps(
  requestPlan: McpServerRequestPlan,
  routeSteps: AgentRuntimeTaskRouteStep[]
): McpServerEvidencePlan {
  const candidates = routeSteps.map((step, index) =>
    buildCandidate(requestPlan, step, index)
  );

  return {
    appId: "mcp-server",
    requestPlan,
    candidates,
    trace: {
      routeSteps,
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
  const sourceDerivedSchemaRequest = mentionsSourceDerivedSchemaRequest(
    requestPlan.requestText
  );
  const resourcePackRequest =
    requestPlan.trace.taskIntent.id === "resource_pack_lookup";
  const clientVisualRequest =
    requestPlan.trace.taskIntent.id === "client_visual_resources";

  switch (routeStep) {
    case "source_acquisition_plan":
      return {
        id: buildCandidateId(priority, routeStep),
        priority,
        tier: "primary",
        routeStep,
        provenance: "source_acquisition",
        preferredTool: "context.query",
        estimatedCost: "low",
        reliability: "high",
        reason:
          "Plan workspace, cache, jar, official, and remote source acquisition before resolving external mod artifacts.",
        pathHints: [],
        queryHint: requestPlan.requestText
      };
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
        provenance: resourcePackRequest || clientVisualRequest
          ? "resource_pack_files"
          : "datapack_files",
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
          : clientVisualRequest
          ? "Inspect resource-pack assets, models, blockstates, textures, and client visual evidence before docs."
          : resourcePackRequest
          ? "Inspect resource-pack assets before secondary docs."
          : "Inspect datapack files before secondary docs.",
        pathHints: vanillaAssetsRequest
          ? collectVanillaAssetsHints(descriptor)
          : vanillaDatapackRequest
          ? collectVanillaDatapackHints(descriptor)
          : resourcePackRequest || clientVisualRequest
          ? collectResourcePackHints(descriptor, workspaceRoot)
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
        reliability: sourceDerivedSchemaRequest ? "high" : "medium",
        reason: sourceDerivedSchemaRequest
          ? "Use source-derived schema evidence from vanilla-mcdoc and misode after local datapack/assets evidence; do not invent JSON fields from generic docs."
          : "Use docs only after exact workspace or typed evidence.",
        pathHints: sourceDerivedSchemaRequest
          ? [
              "mdm-package:vanilla-schema-docs",
              "source-derived:SpyglassMC/vanilla-mcdoc",
              "source-derived:misode/misode.github.io"
            ]
          : [],
        queryHint: sourceDerivedSchemaRequest
          ? buildSourceDerivedSchemaQueryHint(requestPlan.requestText)
          : requestPlan.requestText
      };
  }
}

function expandRouteSteps(
  requestPlan: McpServerRequestPlan
): AgentRuntimeTaskRouteStep[] {
  const steps = requestPlan.toolGuidance.routeSteps;
  if (
    !steps.includes("external_mod_resolution") ||
    steps.includes("source_acquisition_plan") ||
    !mentionsSourceAcquisitionRequest(requestPlan.requestText)
  ) {
    return [...steps];
  }

  return steps.flatMap((step) =>
    step === "external_mod_resolution"
      ? ["source_acquisition_plan", step]
      : [step]
  );
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

function collectResourcePackHints(
  descriptor?: { resourcePackRoots?: string[] },
  workspaceRoot?: string
): string[] {
  const roots = descriptor?.resourcePackRoots ?? [];

  return roots.length > 0 ? roots : workspaceRoot ? [workspaceRoot] : [];
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

function mentionsSourceAcquisitionRequest(requestText?: string): boolean {
  if (!requestText) {
    return false;
  }

  const normalized = requestText.toLowerCase();
  return /(?:source|sources|源码|jar|cache|cached|offline|workspace|bundle|bundles|prewarm|prepare|index|indexes|工作区|缓存|离线|本地|打包|预热|准备|索引)/.test(
    normalized
  );
}

function mentionsSourceDerivedSchemaRequest(requestText?: string): boolean {
  if (!requestText) {
    return false;
  }

  const normalized = requestText.toLowerCase();
  const schemaSignal =
    /(?:schema|mcdoc|misode|explain|format|格式|结构|解释器|解释)/u.test(
      normalized
    );
  const packSignal =
    /(?:datapack|data pack|resourcepack|resource pack|assets|recipe|loot|advancement|predicate|tag|model|blockstate|texture|数据包|资源包|配方|战利品|标签|模型|纹理)/u.test(
      normalized
    );

  return schemaSignal && packSignal;
}

function buildSourceDerivedSchemaQueryHint(requestText?: string): string {
  const base = requestText?.trim() || "vanilla datapack resource-pack schema";

  return `${base}\nPrefer source-derived schema evidence: vanilla-mcdoc mcdoc schemas and misode generator/interpreter logic.`;
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
