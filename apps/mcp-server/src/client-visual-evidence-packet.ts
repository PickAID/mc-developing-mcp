import type {
  DatapackDiscovery,
  DatapackResourceReferenceTrace,
  DatapackSearchMatch
} from "@mcpskill/datapack-adapter";
import type { WorkspaceDescriptor } from "@mcpskill/shared-types";

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
    sourceEvidence: {
      candidateRegistries: 0,
      candidateClientInit: 0,
      candidateRendererBindings: 0,
      candidateSyncPaths: 0
    },
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
    missingEvidence: [
      "source registry scan not implemented",
      "renderer binding scan not implemented"
    ],
    nextReads: nextAssetReads(input.matches)
  };
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
