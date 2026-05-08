import type {
  DatapackDiscovery,
  DatapackResourceReferenceTrace,
  DatapackSearchMatch
} from "minecraft-developing-mcp-datapack-adapter";
import type { WorkspaceDescriptor } from "minecraft-developing-mcp-shared-types";

import {
  buildClientVisualApiProof,
  type ClientVisualApiProof
} from "../api-proof/client-visual-api-proof.js";
import type { ClientVisualSourceScan } from "../source-scan/client-visual-source-scanner.js";
import type { ExternalShaderReferenceResult } from "../../external-mod/shader/external-shader-reference.js";
import { buildSourceReadNextReads } from "../../source-bundle/shared/source-read-next.js";

export interface ClientVisualEvidencePacketInput {
  descriptor?: WorkspaceDescriptor;
  discovery: DatapackDiscovery;
  resourceSummary: {
    byDomain: Record<string, number>;
    byKind: Record<string, number>;
    byNamespace: Record<string, number>;
  };
  queries: string[];
  requestedPaths: string[];
  matches: DatapackSearchMatch[];
  sourceScan?: ClientVisualSourceScan;
  externalShaderReference?: ExternalShaderReferenceResult;
  resourceReferenceTrace?: Pick<
    DatapackResourceReferenceTrace,
    "references" | "unresolved" | "truncated"
  >;
}

export function buildClientVisualEvidencePacket(
  input: ClientVisualEvidencePacketInput
) {
  const matchedAssetPaths = input.matches.map((match) => match.file.relativePath);
  const requestedResourceLocations = input.queries.filter((query) =>
    query.includes(":")
  );
  const apiProof = buildClientVisualApiProof({
    descriptor: input.descriptor,
    sourceScan: input.sourceScan
  });

  return {
    intent: "client_visual_resources" as const,
    workspaceEvidence: {
      hasJavaSource: input.descriptor?.hasJavaSource ?? false,
      hasKubeJS: input.descriptor?.hasKubeJS ?? false,
      hasProbeJS: input.descriptor?.hasProbeJS ?? false,
      hasDatapack: input.descriptor?.hasDatapack ?? false,
      hasModArchives: input.descriptor?.hasModArchives ?? false,
      hasResourcePack: input.discovery.assetKinds.length > 0
    },
    sourceEvidence: sourceEvidence(input.sourceScan),
    apiProof,
    assetEvidence: {
      namespaces: Object.keys(input.resourceSummary.byNamespace).sort(),
      byDomain: input.resourceSummary.byDomain,
      byKind: input.resourceSummary.byKind,
      referenceTraceAvailable:
        input.resourceReferenceTrace !== undefined &&
        input.resourceReferenceTrace.references.length > 0,
      unresolvedReferenceCount: input.resourceReferenceTrace?.unresolved.length ?? 0,
      binaryContentReturned: false
    },
    registryToAssetSummary: {
      requestedResourceLocations,
      requestedAssetPaths: input.requestedPaths,
      matchedAssetPaths,
      missingAssetKinds: missingAssetKinds(input.matches)
    },
    missingEvidence: missingEvidence(input.sourceScan),
    evidenceLimitations: evidenceLimitations(input.sourceScan),
    ...(input.externalShaderReference
      ? { externalShaderReference: input.externalShaderReference }
      : {}),
    implementationSkeleton: implementationSkeleton({
      sourceScan: input.sourceScan,
      apiProof,
      matchedAssetPaths,
      missingAssetKinds: missingAssetKinds(input.matches)
    }),
    nextReads: nextAssetReads(input.matches)
  };
}

function sourceEvidence(sourceScan: ClientVisualSourceScan | undefined) {
  return {
    candidateRegistries: sourceScan?.counts.candidateRegistries ?? 0,
    candidateClientInit: sourceScan?.counts.candidateClientInit ?? 0,
    candidateRendererBindings:
      sourceScan?.counts.candidateRendererBindings ?? 0,
    candidateScreenRegistrations:
      sourceScan?.counts.candidateScreenRegistrations ?? 0,
    candidateModelLayerRegistrations:
      sourceScan?.counts.candidateModelLayerRegistrations ?? 0,
    resourceLocationReferences:
      sourceScan?.counts.resourceLocationReferences ?? 0,
    kubeJsClientHooks: sourceScan?.counts.kubeJsClientHooks ?? 0,
    dynamicTextureHints: sourceScan?.counts.dynamicTextureHints ?? 0,
    resourceReloadHooks: sourceScan?.counts.resourceReloadHooks ?? 0,
    networkSyncHints: sourceScan?.counts.networkSyncHints ?? 0,
    animationStateHints: sourceScan?.counts.animationStateHints ?? 0,
    uiLayoutHints: sourceScan?.counts.uiLayoutHints ?? 0,
    renderPipelineHints: sourceScan?.counts.renderPipelineHints ?? 0,
    shaderPipelineHints: sourceScan?.counts.shaderPipelineHints ?? 0,
    renderPerformanceRisks: sourceScan?.counts.renderPerformanceRisks ?? 0,
    scannedFiles: sourceScan?.scannedFiles ?? 0,
    truncated: sourceScan?.truncated ?? false,
    evidence: sourceScan?.evidence ?? []
  };
}

function missingEvidence(
  sourceScan: ClientVisualSourceScan | undefined
): string[] {
  if (!sourceScan || sourceScan.scannedFiles === 0) {
    return [
      "source registry evidence not proven by current scan",
      "renderer binding evidence not proven by current scan"
    ];
  }

  const missing = [];
  if (sourceScan.counts.candidateRegistries === 0) {
    missing.push("source registry evidence not proven by current scan");
  }
  if (sourceScan.counts.candidateRendererBindings === 0) {
    missing.push("renderer binding evidence not proven by current scan");
  }
  return missing;
}

function evidenceLimitations(
  sourceScan: ClientVisualSourceScan | undefined
): string[] {
  if (!sourceScan || sourceScan.scannedFiles === 0) {
    return [
      "No client visual source files were scanned; missing evidence is not absence proof."
    ];
  }

  return sourceScan.truncated
    ? ["Client visual source scan was truncated; missing evidence is not absence proof."]
    : ["Missing evidence means not proven from the current bounded scan."];
}

function missingAssetKinds(matches: DatapackSearchMatch[]): string[] {
  const kinds = new Set(matches.map((match) => match.file.kind));
  const expectedKinds = ["blockstates", "models", "textures"] as const;
  return expectedKinds.filter((kind) => !kinds.has(kind));
}

function implementationSkeleton(input: {
  sourceScan: ClientVisualSourceScan | undefined;
  apiProof: ClientVisualApiProof;
  matchedAssetPaths: string[];
  missingAssetKinds: string[];
}) {
  const counts = input.sourceScan?.counts;
  const hasApiProof =
    input.apiProof.loader !== undefined &&
    input.apiProof.minecraftVersion !== undefined &&
    input.apiProof.apiMismatchRisks.length === 0;
  const evidenceBackedSteps = [
    ...(counts?.candidateRegistries ? ["registry_id"] : []),
    ...(counts?.candidateClientInit ? ["client_init"] : []),
    ...(counts?.candidateRendererBindings ? ["renderer_binding"] : []),
    ...(counts?.candidateScreenRegistrations ? ["screen_binding"] : []),
    ...(counts?.candidateModelLayerRegistrations ? ["model_layer_or_loader"] : []),
    ...(hasApiProof ? ["loader_version_api_proof"] : []),
    ...(input.matchedAssetPaths.length > 0 ? ["asset_chain"] : []),
    ...(counts?.networkSyncHints ? ["network_sync"] : []),
    ...(counts?.animationStateHints ? ["animation_state"] : []),
    ...(counts?.resourceReloadHooks ? ["resource_reload"] : []),
    ...(counts?.dynamicTextureHints ? ["dynamic_texture_lifecycle"] : []),
    ...(counts?.uiLayoutHints ? ["ui_layout"] : []),
    ...(counts?.renderPipelineHints ? ["render_pipeline_state"] : []),
    ...(counts?.shaderPipelineHints ? ["shader_or_post_chain"] : [])
  ];

  return {
    tokenPolicy: "compact_client_visual_implementation_skeleton" as const,
    chain: [
      "registry_id",
      "server_state_or_menu",
      "client_init",
      "renderer_or_screen_binding",
      "asset_chain",
      "sync_or_reload_boundary"
    ],
    requiredSteps: [
      "confirm registry id",
      "choose static JSON model vs runtime renderer/model loader",
      "verify blockstate -> model -> texture chain",
      "bind renderer or screen from client-only initialization",
      "prove loader/version-specific client API before naming methods or events",
      "separate UI layout, render pipeline state, and shader/post chain ownership",
      "keep authoritative state server-side",
      "use interpolation for animated state",
      "use reload/cache lifecycle for dynamic textures or generated assets"
    ],
    evidenceBackedSteps,
    missingSteps: missingImplementationSteps(evidenceBackedSteps),
    cautions: implementationCautions(input.sourceScan, input.apiProof)
  };
}

function missingImplementationSteps(evidenceBackedSteps: string[]): string[] {
  const backed = new Set(evidenceBackedSteps);
  return [
    ["registry_id", "registry evidence not proven by current scan"],
    ["client_init", "client-only initialization evidence not proven by current scan"],
    ["renderer_binding", "renderer binding evidence not proven by current scan"],
    ["loader_version_api_proof", "loader/version-specific API proof not proven"],
    ["asset_chain", "asset chain evidence not proven by current scan"],
    ["ui_layout", "UI layout evidence not proven by current scan"],
    ["render_pipeline_state", "render pipeline state evidence not proven by current scan"],
    ["shader_or_post_chain", "shader or post-processing evidence not proven by current scan"],
    ["network_sync", "network or menu sync evidence not proven by current scan"],
    ["resource_reload", "resource reload/cache evidence not proven by current scan"]
  ]
    .filter(([key]) => !backed.has(key))
    .map(([, label]) => label);
}

function implementationCautions(
  sourceScan: ClientVisualSourceScan | undefined,
  apiProof: ClientVisualApiProof
): string[] {
  const cautions = [
    "do not collapse moving parts into blockstate explosion",
    "avoid per-frame file IO, JSON parsing, registration, or texture allocation",
    "do not let screen or renderer mutate authoritative state directly"
  ];

  if (sourceScan?.counts.renderPerformanceRisks) {
    cautions.push("render performance risk evidence found in source scan");
  }
  if (apiProof.apiMismatchRisks.length > 0) {
    cautions.push("loader/version API mismatch risk found; do not mix loader patterns");
  }

  return cautions;
}

function nextAssetReads(matches: DatapackSearchMatch[]): string[] {
  return matches
    .filter((match) => match.file.relativePath.endsWith(".json"))
    .flatMap((match) =>
      buildSourceReadNextReads({
        path: match.file.relativePath,
        startLine: match.line ?? 1,
        endLine: match.line ?? 1
      })
    )
    .slice(0, 8);
}
