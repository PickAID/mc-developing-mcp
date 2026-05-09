import type { ClientVisualApiProof } from "../api-proof/client-visual-api-proof.js";
import type { ClientVisualSourceScan } from "../source-scan/client-visual-source-scanner.js";

export type ClientVisualProofStatus = "proven" | "partial" | "missing" | "risky";

export type ClientVisualVerifierCheckId =
  | "registry"
  | "client_init"
  | "renderer_or_screen_binding"
  | "asset_chain"
  | "resource_reload_or_dynamic_texture"
  | "shader_or_post_chain"
  | "api_version";

export interface ClientVisualVerifierCheck {
  status: ClientVisualProofStatus;
  evidenceCount: number;
  summary: string;
}

export interface ClientVisualVerifier {
  tokenPolicy: "compact_client_visual_verifier";
  overall: ClientVisualProofStatus;
  checks: Record<ClientVisualVerifierCheckId, ClientVisualVerifierCheck>;
  nextProofSteps: string[];
}

export function buildClientVisualVerifier(input: {
  sourceScan: ClientVisualSourceScan | undefined;
  apiProof: ClientVisualApiProof;
  matchedAssetPaths: string[];
}): ClientVisualVerifier {
  const counts = input.sourceScan?.counts;
  const checks: Record<ClientVisualVerifierCheckId, ClientVisualVerifierCheck> = {
    registry: check(
      counts?.candidateRegistries ?? 0,
      "registry ownership proven from source scan",
      "registry ownership not proven from source scan"
    ),
    client_init: check(
      counts?.candidateClientInit ?? 0,
      "client-only initialization proven from source scan",
      "client-only initialization not proven from source scan"
    ),
    renderer_or_screen_binding: check(
      (counts?.candidateRendererBindings ?? 0) +
        (counts?.candidateScreenRegistrations ?? 0) +
        (counts?.candidateModelLayerRegistrations ?? 0),
      "renderer, screen, or model binding proven from source scan",
      "renderer, screen, or model binding not proven from source scan"
    ),
    asset_chain: assetChainCheck(input.matchedAssetPaths),
    resource_reload_or_dynamic_texture: check(
      (counts?.resourceReloadHooks ?? 0) + (counts?.dynamicTextureHints ?? 0),
      "resource reload or dynamic texture lifecycle proven from source scan",
      "resource reload or dynamic texture lifecycle not proven from source scan"
    ),
    shader_or_post_chain: check(
      counts?.shaderPipelineHints ?? 0,
      "shader or post-processing chain proven from source scan",
      "shader or post-processing chain not proven from source scan"
    ),
    api_version: apiVersionCheck(input.apiProof)
  };

  return {
    tokenPolicy: "compact_client_visual_verifier",
    overall: overallStatus(Object.values(checks)),
    checks,
    nextProofSteps: nextProofSteps(checks)
  };
}

function check(
  evidenceCount: number,
  provenSummary: string,
  missingSummary: string
): ClientVisualVerifierCheck {
  if (evidenceCount > 0) {
    return {
      status: "proven",
      evidenceCount,
      summary: provenSummary
    };
  }

  return {
    status: "missing",
    evidenceCount: 0,
    summary: missingSummary
  };
}

function assetChainCheck(matchedAssetPaths: string[]): ClientVisualVerifierCheck {
  const hasBlockstate = matchedAssetPaths.some((path) =>
    path.includes("/blockstates/")
  );
  const hasModel = matchedAssetPaths.some((path) => path.includes("/models/"));
  const hasTexture = matchedAssetPaths.some((path) => path.includes("/textures/"));
  const evidenceCount = [hasBlockstate, hasModel, hasTexture].filter(Boolean).length;

  if (evidenceCount === 3) {
    return {
      status: "proven",
      evidenceCount,
      summary: "blockstate, model, and texture asset chain proven"
    };
  }
  if (evidenceCount > 0) {
    return {
      status: "partial",
      evidenceCount,
      summary: "asset chain is partially proven; read missing asset links next"
    };
  }

  return {
    status: "missing",
    evidenceCount: 0,
    summary: "blockstate, model, and texture asset chain not proven"
  };
}

function apiVersionCheck(apiProof: ClientVisualApiProof): ClientVisualVerifierCheck {
  if (apiProof.apiMismatchRisks.length > 0) {
    return {
      status: "risky",
      evidenceCount: apiProof.apiMismatchRisks.length,
      summary: "loader/version API proof has mismatch or missing runtime risks"
    };
  }

  if (apiProof.loader && apiProof.minecraftVersion) {
    return {
      status: "proven",
      evidenceCount: 1,
      summary: "loader and Minecraft version are proven for client API guidance"
    };
  }

  return {
    status: "missing",
    evidenceCount: 0,
    summary: "loader and Minecraft version are not proven for client API guidance"
  };
}

function overallStatus(
  checks: ClientVisualVerifierCheck[]
): ClientVisualProofStatus {
  if (checks.some((entry) => entry.status === "risky")) {
    return "risky";
  }
  if (checks.some((entry) => entry.status === "missing")) {
    return "missing";
  }
  if (checks.some((entry) => entry.status === "partial")) {
    return "partial";
  }
  return "proven";
}

function nextProofSteps(
  checks: Record<ClientVisualVerifierCheckId, ClientVisualVerifierCheck>
): string[] {
  const steps: Partial<Record<ClientVisualVerifierCheckId, string>> = {
    registry: "prove registry ownership from Java/KubeJS source before editing visual code",
    client_init: "prove client-only initialization entrypoint before binding render code",
    renderer_or_screen_binding:
      "prove renderer, screen, or model layer binding before generating implementation",
    asset_chain: "trace blockstate, model, and texture asset chain before editing resources",
    resource_reload_or_dynamic_texture:
      "prove reload/cache lifecycle before generating dynamic textures or resources",
    shader_or_post_chain:
      "prove shader or post-processing ownership before suggesting shader code",
    api_version: "resolve loader/version API mismatch before naming client methods or events"
  };

  return Object.entries(checks)
    .filter(([, checkEntry]) => checkEntry.status !== "proven")
    .map(([id]) => steps[id as ClientVisualVerifierCheckId])
    .filter((step): step is string => step !== undefined);
}
