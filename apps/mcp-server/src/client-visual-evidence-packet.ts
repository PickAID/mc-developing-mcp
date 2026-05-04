import type {
  DatapackDiscovery,
  DatapackResourceReferenceTrace,
  DatapackSearchMatch
} from "@mcpskill/datapack-adapter";
import type { WorkspaceDescriptor } from "@mcpskill/shared-types";

import type { ClientVisualSourceScan } from "./client-visual-source-scanner.js";

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
    scannedFiles: sourceScan?.scannedFiles ?? 0,
    truncated: sourceScan?.truncated ?? false,
    evidence: sourceScan?.evidence ?? []
  };
}

function missingEvidence(
  sourceScan: ClientVisualSourceScan | undefined
): string[] {
  if (!sourceScan || sourceScan.scannedFiles === 0) {
    return ["source registry scan not available", "renderer binding scan not available"];
  }

  const missing = [];
  if (sourceScan.counts.candidateRegistries === 0) {
    missing.push("source registry evidence not found");
  }
  if (sourceScan.counts.candidateRendererBindings === 0) {
    missing.push("renderer binding evidence not found");
  }
  return missing;
}

function missingAssetKinds(matches: DatapackSearchMatch[]): string[] {
  const kinds = new Set(matches.map((match) => match.file.kind));
  const expectedKinds = ["blockstates", "models", "textures"] as const;
  return expectedKinds.filter((kind) => !kinds.has(kind));
}

function nextAssetReads(matches: DatapackSearchMatch[]): string[] {
  return matches
    .map((match) => match.file.relativePath)
    .filter((path) => path.endsWith(".json"))
    .slice(0, 8);
}
