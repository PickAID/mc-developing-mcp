import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { executeMcpServerRequest } from "./request-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("mc_develop client visual harness eval", () => {
  it.each([
    [
      "complex model",
      "我有个很复杂的方块模型，不知道应该放哪里、怎么让游戏里显示出来，帮我检查 demo:block/gear 的模型、方块状态和加载代码。"
    ],
    [
      "machine screen",
      "我想做一个会打开界面的 demo:block/gear 机器方块，但不知道具体怎么实现，帮我看菜单界面、客户端初始化、渲染绑定和资源是不是连起来了。"
    ],
    [
      "dynamic mechanical texture",
      "这个 demo:block/gear 机器想做动态材质和机械视觉效果，看起来像会转动或发光，帮我检查 renderer、材质、模型和注册是不是缺了。"
    ]
  ])("grounds a low-knowledge %s request in source and asset evidence", async (
    _caseName,
    requestText
  ) => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createClientVisualWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot,
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText
    });

    expect(result.requestPlan.requestContext.taskBrief).toMatchObject({
      intent: {
        id: "client_visual_resources",
        confidence: "high"
      }
    });
    expect(result.requestPlan.requestContext.taskBrief.promptFragments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task_client_visual_capability_policy",
          text: expect.stringContaining("registry id -> client init")
        }),
        expect.objectContaining({
          id: "task_evidence_policy",
          text: expect.stringContaining("resource reload/cache boundaries")
        }),
        expect.objectContaining({
          id: "task_client_visual_capability_policy",
          text: expect.stringContaining("loader/version-specific renderer")
        }),
        expect.objectContaining({
          id: "task_client_visual_capability_policy",
          text: expect.stringContaining("clientVisualEvidence.apiProof")
        })
      ])
    );
    expect(result.selectedEvidence).toMatchObject({
      routeStep: "datapack_files",
      preferredTool: "source.bundle",
      status: "selected",
      payload: {
        source: "datapack_files",
        clientVisualEvidence: {
          intent: "client_visual_resources",
          workspaceEvidence: {
            hasJavaSource: true,
            hasResourcePack: true
          },
          sourceEvidence: {
            candidateRegistries: expect.any(Number),
            candidateClientInit: expect.any(Number),
            candidateRendererBindings: expect.any(Number),
            scannedFiles: expect.any(Number),
            evidence: expect.arrayContaining([
              expect.objectContaining({
                kind: "candidateRendererBindings",
                file: expect.stringMatching(/^src\/main\/java\//)
              })
            ])
          },
          apiProof: {
            tokenPolicy: "compact_client_visual_api_proof",
            loader: "forge",
            minecraftVersion: "1.20.1",
            apiSurfaces: {
              renderer: { count: expect.any(Number) },
              screen: { count: expect.any(Number) },
              model: { count: expect.any(Number) },
              clientInit: { count: expect.any(Number) }
            },
            apiMismatchRisks: []
          },
          registryToAssetSummary: {
            requestedResourceLocations: expect.arrayContaining(["demo:block/gear"]),
            matchedAssetPaths: expect.arrayContaining([
              "assets/demo/blockstates/block/gear.json",
              "assets/demo/models/block/gear.json",
              "assets/demo/textures/block/gear.png"
            ]),
            missingAssetKinds: []
          },
          assetEvidence: {
            binaryContentReturned: false
          },
          implementationSkeleton: {
            tokenPolicy: "compact_client_visual_implementation_skeleton",
            requiredSteps: expect.arrayContaining([
              "confirm registry id",
              "choose static JSON model vs runtime renderer/model loader",
              "verify blockstate -> model -> texture chain",
              "bind renderer or screen from client-only initialization",
              "use reload/cache lifecycle for dynamic textures or generated assets"
            ]),
            evidenceBackedSteps: expect.arrayContaining([
              "registry_id",
              "client_init",
              "renderer_binding",
              "loader_version_api_proof",
              "asset_chain"
            ]),
            cautions: expect.arrayContaining([
              "avoid per-frame file IO, JSON parsing, registration, or texture allocation"
            ])
          }
        }
      }
    });
    expect(JSON.stringify(result.selectedEvidence?.payload)).not.toContain(
      "class MachineRenderer"
    );
  });
});

async function createClientVisualWorkspace(): Promise<string> {
  const root = await createTempRoot("mcpskill-client-visual-eval-");

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
    join(root, "src", "main", "java", "demo", "Registry.java"),
    "class Registry { DeferredRegister<Block> BLOCKS; RegistryObject<Block> GEAR; }\n"
  );
  await writeText(
    join(root, "src", "main", "java", "demo", "ClientInit.java"),
    [
      "package demo;",
      "class ClientInit {",
      "  void setup(FMLClientSetupEvent event) {",
      "    BlockEntityRenderers.register(DemoBlockEntities.GEAR.get(), MachineRenderer::new);",
      "    MenuScreens.register(DemoMenus.GEAR.get(), MachineScreen::new);",
      "    ModelLayerLocation layer = new ModelLayerLocation(new ResourceLocation(\"demo\", \"block/gear\"), \"main\");",
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
