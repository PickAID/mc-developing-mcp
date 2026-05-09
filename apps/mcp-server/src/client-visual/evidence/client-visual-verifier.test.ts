import { describe, expect, it } from "vitest";

import { buildClientVisualApiProof } from "../api-proof/client-visual-api-proof.js";
import type { ClientVisualSourceScan } from "../source-scan/client-visual-source-scanner.js";
import { buildClientVisualVerifier } from "./client-visual-verifier.js";

describe("buildClientVisualVerifier", () => {
  it("classifies a complete client visual evidence chain as proven", () => {
    const sourceScan = scan({
      candidateRegistries: 1,
      candidateClientInit: 1,
      candidateRendererBindings: 1,
      resourceReloadHooks: 1,
      dynamicTextureHints: 1,
      shaderPipelineHints: 1
    });
    const apiProof = buildClientVisualApiProof({
      currentRuntime: runtime("forge", "1.20.1"),
      sourceScan
    });

    expect(
      buildClientVisualVerifier({
        sourceScan,
        apiProof,
        matchedAssetPaths: [
          "assets/demo/blockstates/gear.json",
          "assets/demo/models/block/gear.json",
          "assets/demo/textures/block/gear.png"
        ]
      })
    ).toMatchObject({
      tokenPolicy: "compact_client_visual_verifier",
      overall: "proven",
      checks: {
        registry: { status: "proven" },
        client_init: { status: "proven" },
        renderer_or_screen_binding: { status: "proven" },
        asset_chain: { status: "proven" },
        resource_reload_or_dynamic_texture: { status: "proven" },
        shader_or_post_chain: { status: "proven" },
        api_version: { status: "proven" }
      },
      nextProofSteps: []
    });
  });

  it("keeps missing proof separate from risky API proof", () => {
    const sourceScan = scan({
      candidateClientInit: 1,
      candidateRendererBindings: 1
    });
    const apiProof = buildClientVisualApiProof({
      currentRuntime: runtime("forge", "1.20.1"),
      sourceScan: {
        ...sourceScan,
        evidence: [
          evidence("candidateClientInit", "ClientModInitializer"),
          evidence("candidateRendererBindings", "EntityRendererRegistry.register")
        ]
      }
    });

    expect(
      buildClientVisualVerifier({
        sourceScan,
        apiProof,
        matchedAssetPaths: []
      })
    ).toMatchObject({
      overall: "risky",
      checks: {
        registry: { status: "missing" },
        client_init: { status: "proven" },
        renderer_or_screen_binding: { status: "proven" },
        asset_chain: { status: "missing" },
        resource_reload_or_dynamic_texture: { status: "missing" },
        shader_or_post_chain: { status: "missing" },
        api_version: { status: "risky" }
      },
      nextProofSteps: expect.arrayContaining([
        "prove registry ownership from Java/KubeJS source before editing visual code",
        "resolve loader/version API mismatch before naming client methods or events"
      ])
    });
  });

  it("does not treat an absent source scan as absence proof", () => {
    const apiProof = buildClientVisualApiProof({});

    expect(
      buildClientVisualVerifier({
        sourceScan: undefined,
        apiProof,
        matchedAssetPaths: []
      })
    ).toMatchObject({
      overall: "risky",
      checks: {
        registry: { status: "missing" },
        client_init: { status: "missing" },
        renderer_or_screen_binding: { status: "missing" },
        asset_chain: { status: "missing" },
        api_version: { status: "risky" }
      }
    });
  });
});

function runtime(loader: "forge" | "neoforge" | "fabric", minecraftVersion: string) {
  return {
    loader,
    minecraftVersion,
    source: "workspace-detect" as const,
    confidence: "high" as const,
    evidenceSources: [],
    candidates: [],
    evidence: []
  };
}

function scan(
  counts: Partial<ClientVisualSourceScan["counts"]>
): ClientVisualSourceScan {
  return {
    tokenPolicy: "compact_client_visual_source_scan",
    scannedFiles: 1,
    skippedFiles: 0,
    truncated: false,
    counts: {
      candidateRegistries: 0,
      candidateClientInit: 0,
      candidateRendererBindings: 0,
      candidateScreenRegistrations: 0,
      candidateModelLayerRegistrations: 0,
      resourceLocationReferences: 0,
      kubeJsClientHooks: 0,
      dynamicTextureHints: 0,
      resourceReloadHooks: 0,
      networkSyncHints: 0,
      animationStateHints: 0,
      uiLayoutHints: 0,
      renderPipelineHints: 0,
      shaderPipelineHints: 0,
      renderPerformanceRisks: 0,
      ...counts
    },
    evidence: Object.entries(counts)
      .filter(([, count]) => (count ?? 0) > 0)
      .map(([kind]) => evidence(kind as ClientVisualSourceScan["evidence"][number]["kind"]))
  };
}

function evidence(
  kind: ClientVisualSourceScan["evidence"][number]["kind"],
  symbol = symbolFor(kind)
): ClientVisualSourceScan["evidence"][number] {
  return {
    kind,
    file: "src/main/java/demo/client/ClientVisual.java",
    line: 1,
    language: "java",
    symbol
  };
}

function symbolFor(kind: ClientVisualSourceScan["evidence"][number]["kind"]): string {
  switch (kind) {
    case "candidateClientInit":
      return "FMLClientSetupEvent";
    case "candidateRendererBindings":
      return "BlockEntityRenderers.register";
    case "resourceReloadHooks":
      return "ResourceManagerReloadListener";
    case "dynamicTextureHints":
      return "DynamicTexture";
    case "shaderPipelineHints":
      return "PostChain";
    default:
      return "DeferredRegister";
  }
}
