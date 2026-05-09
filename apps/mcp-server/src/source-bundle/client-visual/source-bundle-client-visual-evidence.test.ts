import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildClientVisualEvidencePacket } from "../../client-visual/evidence/client-visual-evidence-packet.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";
import { buildMcpServerSourceBundleExecutor } from "../core/source-bundle-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("source.bundle client visual evidence", () => {
  it("returns a compact registry-to-asset evidence packet for visual resources", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createVisualWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "Wire the block entity renderer, blockstate, model registration, and client init for demo:block/gear."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "datapack_files"
    );

    if (!candidate) {
      throw new Error("datapack_files candidate missing");
    }

    const result = await buildMcpServerSourceBundleExecutor({ runtimeRoot })({
      candidate,
      evidencePlan,
      requestPlan
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "datapack_files",
        matches: [
          { file: { relativePath: "assets/demo/blockstates/block/gear.json" } },
          { file: { relativePath: "assets/demo/models/block/gear.json" } },
          { file: { relativePath: "assets/demo/textures/block/gear.png" } }
        ],
        clientVisualEvidence: {
          intent: "client_visual_resources",
          workspaceEvidence: {
            hasJavaSource: true,
            hasResourcePack: true
          },
          sourceEvidence: {
            candidateRegistries: 1,
            candidateClientInit: 1,
            candidateRendererBindings: 1,
            uiLayoutHints: 1,
            renderPipelineHints: 1,
            shaderPipelineHints: 1,
            scannedFiles: 1,
            evidence: expect.arrayContaining([
              expect.objectContaining({
                kind: "candidateRendererBindings",
                file: "src/main/java/demo/VisualBlock.java",
                language: "java"
              })
            ])
          },
          apiProof: {
            tokenPolicy: "compact_client_visual_api_proof",
            loader: "forge",
            minecraftVersion: "1.20.1",
            apiSurfaces: {
              renderer: { count: 1 },
              ui: { count: 1 },
              renderPipeline: { count: 1 },
              shader: { count: 1 },
              clientInit: { count: 1 }
            },
            apiMismatchRisks: []
          },
          assetEvidence: {
            namespaces: ["demo"],
            byKind: {
              blockstates: 1,
              models: 1,
              textures: 1
            },
            binaryContentReturned: false
          },
          registryToAssetSummary: {
            requestedResourceLocations: ["demo:block/gear"],
            matchedAssetPaths: [
              "assets/demo/blockstates/block/gear.json",
              "assets/demo/models/block/gear.json",
              "assets/demo/textures/block/gear.png"
            ],
            missingAssetKinds: []
          },
          missingEvidence: [],
          visualVerifier: {
            tokenPolicy: "compact_client_visual_verifier",
            overall: "missing",
            checks: {
              registry: { status: "proven" },
              client_init: { status: "proven" },
              renderer_or_screen_binding: { status: "proven" },
              asset_chain: { status: "proven" },
              resource_reload_or_dynamic_texture: { status: "missing" },
              api_version: { status: "proven" }
            }
          },
          implementationSkeleton: {
            tokenPolicy: "compact_client_visual_implementation_skeleton",
            evidenceBackedSteps: expect.arrayContaining([
              "registry_id",
              "client_init",
              "renderer_binding",
              "loader_version_api_proof",
              "ui_layout",
              "render_pipeline_state",
              "shader_or_post_chain",
              "asset_chain"
            ]),
            requiredSteps: expect.arrayContaining([
              "choose static JSON model vs runtime renderer/model loader",
              "bind renderer or screen from client-only initialization",
              "separate UI layout, render pipeline state, and shader/post chain ownership"
            ]),
            cautions: expect.arrayContaining([
              "do not collapse moving parts into blockstate explosion"
            ])
          },
          nextReads: [
            "source.read assets/demo/blockstates/block/gear.json:1-1",
            "source.read assets/demo/models/block/gear.json:1-1"
          ]
        }
      }
    });
  });

  it("reports missing client visual evidence as an unproven bounded scan", () => {
    expect(
      buildClientVisualEvidencePacket({
        discovery: {
          roots: [],
          namespaces: [],
          dataKinds: [],
          assetKinds: []
        },
        resourceSummary: {
          byDomain: {},
          byKind: {},
          byNamespace: {}
        },
        queries: ["demo:block/gear"],
        requestedPaths: [],
        matches: []
      })
    ).toMatchObject({
      missingEvidence: [
        "source registry evidence not proven by current scan",
        "renderer binding evidence not proven by current scan"
      ],
      evidenceLimitations: [
        "No client visual source files were scanned; missing evidence is not absence proof."
      ],
      implementationSkeleton: {
        missingSteps: expect.arrayContaining([
          "registry evidence not proven by current scan",
          "renderer binding evidence not proven by current scan"
        ])
      }
    });
  });
});

async function createVisualWorkspace(): Promise<string> {
  const root = await createTempRoot("mcpskill-client-visual-");

  await writeText(
    join(root, "build.gradle"),
    [
      'plugins { id "net.minecraftforge.gradle" }',
      "dependencies {",
      '  minecraft "net.minecraftforge:forge:1.20.1-47.2.0"',
      "}"
    ].join("\n")
  );
  await writeText(
    join(root, "src", "main", "java", "demo", "VisualBlock.java"),
    [
      "package demo;",
      "class VisualBlock {",
      "  DeferredRegister<Block> blocks;",
      "  void client(FMLClientSetupEvent event) {",
      "    BlockEntityRenderers.register(DemoBlockEntities.GEAR.get(), GearRenderer::new);",
      "    GuiGraphics graphics;",
      "    graphics.blit(new ResourceLocation(\"demo\", \"textures/gui/gear.png\"), 0, 0, 0, 0, 176, 166);",
      "    RenderSystem.enableBlend();",
      "    PostChain chain;",
      "  }",
      "}"
    ].join("\n")
  );
  await writeText(join(root, "assets", "demo", "blockstates", "block", "gear.json"), "{}\n");
  await writeText(join(root, "assets", "demo", "models", "block", "gear.json"), "{}\n");
  await writeText(
    join(root, "assets", "demo", "textures", "block", "gear.png"),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])
  );

  return root;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string | Buffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
