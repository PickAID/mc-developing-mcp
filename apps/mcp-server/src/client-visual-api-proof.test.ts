import { describe, expect, it } from "vitest";

import { buildClientVisualApiProof } from "./client-visual-api-proof.js";
import type { ClientVisualSourceScan } from "./client-visual-source-scanner.js";

describe("buildClientVisualApiProof", () => {
  it("summarizes NeoForge client visual API surfaces from scanner evidence", () => {
    const apiProof = buildClientVisualApiProof({
      currentRuntime: runtime("neoforge", "1.21.1"),
      sourceScan: scan([
        evidence("candidateRendererBindings", "BlockEntityRenderers.register"),
        evidence("candidateScreenRegistrations", "MenuScreens.register"),
        evidence("candidateModelLayerRegistrations", "RegisterLayerDefinitions"),
        evidence("resourceReloadHooks", "RegisterClientReloadListenersEvent"),
        evidence("dynamicTextureHints", "DynamicTexture"),
        evidence("networkSyncHints", "CustomPacketPayload")
      ])
    });

    expect(apiProof).toMatchObject({
      tokenPolicy: "compact_client_visual_api_proof",
      loader: "neoforge",
      minecraftVersion: "1.21.1",
      apiSurfaces: {
        renderer: { count: 1 },
        screen: { count: 1 },
        model: { count: 1 },
        reload: { count: 1 },
        dynamicTexture: { count: 1 },
        network: { count: 1 },
        kubejs: { count: 0 }
      },
      apiMismatchRisks: []
    });
    expect(apiProof.apiSurfaces.renderer.evidence[0]).toMatchObject({
      loaderHint: "common",
      symbol: "BlockEntityRenderers.register"
    });
    expect(apiProof.apiSurfaces.reload.evidence[0]).toMatchObject({
      loaderHint: "neoforge"
    });
  });

  it("flags Fabric API hints when the detected loader is Forge", () => {
    const apiProof = buildClientVisualApiProof({
      currentRuntime: runtime("forge", "1.20.1"),
      sourceScan: scan([
        evidence("candidateClientInit", "ClientModInitializer"),
        evidence("candidateRendererBindings", "EntityRendererRegistry.register"),
        evidence("resourceReloadHooks", "IdentifiableResourceReloadListener")
      ])
    });

    expect(apiProof.apiSurfaces.renderer).toMatchObject({
      count: 1,
      evidence: [
        expect.objectContaining({
          loaderHint: "fabric",
          symbol: "EntityRendererRegistry.register"
        })
      ]
    });
    expect(apiProof.apiMismatchRisks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "loader_surface_mismatch",
          expectedLoader: "forge",
          observedLoader: "fabric",
          surface: "clientInit"
        }),
        expect.objectContaining({
          kind: "loader_surface_mismatch",
          expectedLoader: "forge",
          observedLoader: "fabric",
          surface: "reload"
        })
      ])
    );
  });

  it("uses descriptor runtime and identifies KubeJS lifecycle surfaces", () => {
    const apiProof = buildClientVisualApiProof({
      descriptor: {
        currentRuntime: runtime("fabric", "1.20.1"),
        hasKubeJS: true
      },
      sourceScan: scan([
        evidence("kubeJsClientHooks", "ClientEvents"),
        evidence("resourceLocationReferences", undefined, "demo:block/gear")
      ])
    });

    expect(apiProof).toMatchObject({
      loader: "fabric",
      minecraftVersion: "1.20.1",
      apiSurfaces: {
        kubejs: {
          count: 1,
          evidence: [
            expect.objectContaining({
              loaderHint: "kubejs",
              symbol: "ClientEvents"
            })
          ]
        }
      }
    });
    expect(apiProof.apiMismatchRisks).toEqual([]);
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
  evidenceEntries: ClientVisualSourceScan["evidence"]
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
      renderPerformanceRisks: 0
    },
    evidence: evidenceEntries
  };
}

function evidence(
  kind: ClientVisualSourceScan["evidence"][number]["kind"],
  symbol?: string,
  value?: string
): ClientVisualSourceScan["evidence"][number] {
  return {
    kind,
    file: "src/main/java/demo/client/ClientVisual.java",
    line: 1,
    language: kind === "kubeJsClientHooks" ? "kubejs" : "java",
    symbol,
    value
  };
}
