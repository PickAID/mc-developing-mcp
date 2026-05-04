import type { CurrentRuntime, Loader } from "@mcpskill/shared-types";

import type {
  ClientVisualSourceEvidence,
  ClientVisualSourceEvidenceKind,
  ClientVisualSourceScan
} from "./client-visual-source-scanner.js";

type SupportedLoader = Extract<Loader, "forge" | "neoforge" | "fabric">;
type ApiSurfaceName =
  | "renderer"
  | "screen"
  | "model"
  | "reload"
  | "dynamicTexture"
  | "network"
  | "clientInit"
  | "kubejs";
type LoaderHint = SupportedLoader | "common" | "kubejs" | "unknown";

export interface ClientVisualApiProofInput {
  descriptor?: {
    currentRuntime?: CurrentRuntime;
    hasKubeJS?: boolean;
  };
  currentRuntime?: CurrentRuntime;
  sourceScan?: ClientVisualSourceScan;
  maxEvidencePerSurface?: number;
}

export interface ClientVisualApiProofEvidence {
  surface: ApiSurfaceName;
  loaderHint: LoaderHint;
  kind: ClientVisualSourceEvidenceKind;
  file: string;
  line: number;
  language: ClientVisualSourceEvidence["language"];
  symbol?: string;
  value?: string;
}

export interface ClientVisualApiMismatchRisk {
  kind:
    | "loader_surface_mismatch"
    | "missing_loader"
    | "missing_minecraft_version";
  surface?: ApiSurfaceName;
  expectedLoader?: SupportedLoader;
  observedLoader?: LoaderHint;
  symbol?: string;
  summary: string;
}

export interface ClientVisualApiProof {
  tokenPolicy: "compact_client_visual_api_proof";
  loader?: SupportedLoader;
  minecraftVersion?: string;
  apiSurfaces: Record<
    ApiSurfaceName,
    {
      count: number;
      evidence: ClientVisualApiProofEvidence[];
    }
  >;
  apiMismatchRisks: ClientVisualApiMismatchRisk[];
}

const DEFAULT_MAX_EVIDENCE_PER_SURFACE = 6;

export function buildClientVisualApiProof(
  input: ClientVisualApiProofInput
): ClientVisualApiProof {
  const runtime = input.currentRuntime ?? input.descriptor?.currentRuntime;
  const loader = normalizeLoader(runtime?.loader);
  const proof = emptyProof(loader, runtime?.minecraftVersion);
  const maxEvidence = normalizeLimit(
    input.maxEvidencePerSurface,
    DEFAULT_MAX_EVIDENCE_PER_SURFACE
  );

  for (const sourceEvidence of input.sourceScan?.evidence ?? []) {
    const classified = classifyEvidence(sourceEvidence);
    if (!classified) {
      continue;
    }

    const surface = proof.apiSurfaces[classified.surface];
    surface.count += 1;
    if (surface.evidence.length < maxEvidence) {
      surface.evidence.push({
        surface: classified.surface,
        loaderHint: classified.loaderHint,
        kind: sourceEvidence.kind,
        file: sourceEvidence.file,
        line: sourceEvidence.line,
        language: sourceEvidence.language,
        symbol: sourceEvidence.symbol,
        value: sourceEvidence.value
      });
    }

    addMismatchRisk(proof, loader, classified, sourceEvidence.symbol);
  }

  if (!loader) {
    proof.apiMismatchRisks.push({
      kind: "missing_loader",
      summary: "Workspace loader is unknown; client visual API proof cannot choose loader-specific guidance."
    });
  }
  if (!proof.minecraftVersion) {
    proof.apiMismatchRisks.push({
      kind: "missing_minecraft_version",
      summary: "Minecraft version is unknown; client visual API proof cannot validate version-specific names."
    });
  }

  return proof;
}

function emptyProof(
  loader: SupportedLoader | undefined,
  minecraftVersion: string | undefined
): ClientVisualApiProof {
  return {
    tokenPolicy: "compact_client_visual_api_proof",
    loader,
    minecraftVersion,
    apiSurfaces: {
      renderer: emptySurface(),
      screen: emptySurface(),
      model: emptySurface(),
      reload: emptySurface(),
      dynamicTexture: emptySurface(),
      network: emptySurface(),
      clientInit: emptySurface(),
      kubejs: emptySurface()
    },
    apiMismatchRisks: []
  };
}

function emptySurface(): { count: number; evidence: ClientVisualApiProofEvidence[] } {
  return { count: 0, evidence: [] };
}

function classifyEvidence(
  evidence: ClientVisualSourceEvidence
): { surface: ApiSurfaceName; loaderHint: LoaderHint } | undefined {
  switch (evidence.kind) {
    case "candidateRendererBindings":
      return { surface: "renderer", loaderHint: symbolLoader(evidence.symbol) };
    case "candidateScreenRegistrations":
      return { surface: "screen", loaderHint: symbolLoader(evidence.symbol) };
    case "candidateModelLayerRegistrations":
      return { surface: "model", loaderHint: symbolLoader(evidence.symbol) };
    case "resourceReloadHooks":
      return { surface: "reload", loaderHint: symbolLoader(evidence.symbol) };
    case "dynamicTextureHints":
      return { surface: "dynamicTexture", loaderHint: "common" };
    case "networkSyncHints":
      return { surface: "network", loaderHint: symbolLoader(evidence.symbol) };
    case "candidateClientInit":
      return { surface: "clientInit", loaderHint: symbolLoader(evidence.symbol) };
    case "kubeJsClientHooks":
      return { surface: "kubejs", loaderHint: "kubejs" };
    default:
      return undefined;
  }
}

function symbolLoader(symbol: string | undefined): LoaderHint {
  if (!symbol) {
    return "unknown";
  }

  if (
    symbol === "ClientModInitializer" ||
    symbol === "EntityRendererRegistry.register" ||
    symbol === "HandledScreens.register" ||
    symbol === "EntityModelLayerRegistry.registerModelLayer" ||
    symbol === "IdentifiableResourceReloadListener"
  ) {
    return "fabric";
  }

  if (
    symbol === "RegisterClient" ||
    symbol === "RegisterClientReloadListenersEvent" ||
    symbol === "CustomPacketPayload"
  ) {
    return "neoforge";
  }

  if (
    symbol === "FMLClientSetupEvent" ||
    symbol === "Dist.CLIENT" ||
    symbol === "RegisterGeometryLoaders" ||
    symbol === "AddReloadListenerEvent" ||
    symbol === "SimpleChannel"
  ) {
    return "forge";
  }

  if (
    symbol === "BlockEntityRenderers.register" ||
    symbol === "EntityRenderers.register" ||
    symbol === "MenuScreens.register" ||
    symbol === "ModelLayerLocation" ||
    symbol === "RegisterLayerDefinitions" ||
    symbol === "BakedModel" ||
    symbol === "ResourceManagerReloadListener" ||
    symbol === "PreparableReloadListener" ||
    symbol === "sendToServer" ||
    symbol === "PacketDistributor" ||
    symbol === "SynchedEntityData" ||
    symbol === "EntityDataAccessor" ||
    symbol === "DataSlot" ||
    symbol === "sync"
  ) {
    return "common";
  }

  return "unknown";
}

function addMismatchRisk(
  proof: ClientVisualApiProof,
  loader: SupportedLoader | undefined,
  classified: { surface: ApiSurfaceName; loaderHint: LoaderHint },
  symbol: string | undefined
): void {
  if (
    !loader ||
    classified.loaderHint === "common" ||
    classified.loaderHint === "unknown" ||
    classified.loaderHint === "kubejs" ||
    classified.loaderHint === loader
  ) {
    return;
  }

  const duplicate = proof.apiMismatchRisks.some(
    (risk) =>
      risk.kind === "loader_surface_mismatch" &&
      risk.surface === classified.surface &&
      risk.observedLoader === classified.loaderHint
  );
  if (duplicate) {
    return;
  }

  proof.apiMismatchRisks.push({
    kind: "loader_surface_mismatch",
    surface: classified.surface,
    expectedLoader: loader,
    observedLoader: classified.loaderHint,
    symbol,
    summary: `${classified.surface} evidence looks ${classified.loaderHint}-specific while workspace loader is ${loader}.`
  });
}

function normalizeLoader(loader: Loader | undefined): SupportedLoader | undefined {
  if (loader === "forge" || loader === "neoforge" || loader === "fabric") {
    return loader;
  }

  return undefined;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}
