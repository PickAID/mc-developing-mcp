import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { scanClientVisualSourceEvidence } from "./client-visual-source-scanner.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("scanClientVisualSourceEvidence", () => {
  it("finds bounded Java client visual source evidence", async () => {
    const root = await createTempRoot();
    const javaRoot = join(root, "src", "main", "java");

    await writeText(
      join(javaRoot, "demo", "client", "DemoClient.java"),
      [
        "package demo.client;",
        "import net.minecraft.client.renderer.blockentity.BlockEntityRenderers;",
        "class DemoClient {",
        "  void setup(FMLClientSetupEvent event) {",
        "    BlockEntityRenderers.register(DemoBlockEntities.GEAR.get(), GearRenderer::new);",
        "    MenuScreens.register(DemoMenus.GEAR.get(), GearScreen::new);",
        "    event.registerLayerDefinition(new ModelLayerLocation(new ResourceLocation(\"demo\", \"gear\"), \"main\"), GearModel::createBodyLayer);",
        "  }",
        "}"
      ].join("\n")
    );
    await writeText(
      join(javaRoot, "demo", "Registry.java"),
      "class Registry { DeferredRegister<Block> BLOCKS; RegistryObject<Block> GEAR; }\n"
    );

    await expect(
      scanClientVisualSourceEvidence({
        workspaceRoot: root
      })
    ).resolves.toMatchObject({
      tokenPolicy: "compact_client_visual_source_scan",
      scannedFiles: 2,
      counts: {
        candidateRegistries: 1,
        candidateClientInit: 1,
        candidateRendererBindings: 1,
        candidateScreenRegistrations: 1,
        candidateModelLayerRegistrations: 1,
        resourceLocationReferences: 1
      },
      evidence: expect.arrayContaining([
        expect.objectContaining({
          kind: "candidateRendererBindings",
          file: "src/main/java/demo/client/DemoClient.java",
          language: "java"
        }),
        expect.objectContaining({
          kind: "candidateRegistries",
          file: "src/main/java/demo/Registry.java"
        })
      ])
    });
  });

  it("finds KubeJS client visual hooks without treating KubeJS as generic JS", async () => {
    const root = await createTempRoot();

    await writeText(
      join(root, "kubejs", "client_scripts", "visuals.js"),
      [
        "ClientEvents.lang('en_us', event => {",
        "  event.add('block.demo.gear', 'Gear');",
        "});",
        "const id = 'demo:block/gear';"
      ].join("\n")
    );

    await expect(
      scanClientVisualSourceEvidence({
        workspaceRoot: root
      })
    ).resolves.toMatchObject({
      counts: {
        kubeJsClientHooks: 1,
        resourceLocationReferences: 1
      },
      evidence: expect.arrayContaining([
        expect.objectContaining({
          kind: "kubeJsClientHooks",
          file: "kubejs/client_scripts/visuals.js",
          language: "kubejs",
          symbol: "ClientEvents"
        })
      ])
    });
  });

  it("ignores MCP workspace metadata directories when scanning client visual sources", async () => {
    const root = await createTempRoot();

    await writeText(
      join(root, ".mc-developing-mcp", "jdtls", "Generated.java"),
      "class Generated { void render() { RenderSystem.enableBlend(); } }\n"
    );
    await writeText(
      join(root, "src", "main", "java", "demo", "Client.java"),
      "class Client { void render(GuiGraphics graphics) { graphics.blit(TEXTURE, 0, 0, 0, 0, 16, 16); } }\n"
    );

    await expect(
      scanClientVisualSourceEvidence({
        workspaceRoot: root
      })
    ).resolves.toMatchObject({
      scannedFiles: 1,
      evidence: expect.arrayContaining([
        expect.objectContaining({
          file: "src/main/java/demo/Client.java",
          kind: "uiLayoutHints"
        })
      ])
    });
  });

  it("finds dynamic texture, reload, sync, animation, and performance hints", async () => {
    const root = await createTempRoot();
    const javaRoot = join(root, "src", "main", "java");

    await writeText(
      join(javaRoot, "demo", "client", "VisualSystems.java"),
      [
        "package demo.client;",
        "class VisualSystems implements ResourceManagerReloadListener {",
        "  private DynamicTexture preview;",
        "  private NativeImage image;",
        "  private float previousAngle;",
        "  private float angle;",
        "  void reload(ResourceManager manager) { image.upload(0, 0, 0, false); }",
        "  void click() { CHANNEL.sendToServer(new SyncVisualPacket(angle)); }",
        "  void render(float partialTick) {",
        "    float value = Mth.lerp(partialTick, previousAngle, angle);",
        "    new DynamicTexture(image);",
        "    readFileEveryFrame();",
        "  }",
        "}"
      ].join("\n")
    );

    await expect(
      scanClientVisualSourceEvidence({
        workspaceRoot: root,
        maxEntriesPerKind: 1
      })
    ).resolves.toMatchObject({
      counts: {
        dynamicTextureHints: 1,
        resourceReloadHooks: 1,
        networkSyncHints: 1,
        animationStateHints: 1,
        renderPerformanceRisks: 1
      },
      evidence: expect.arrayContaining([
        expect.objectContaining({
          kind: "dynamicTextureHints",
          language: "java",
          symbol: "DynamicTexture"
        }),
        expect.objectContaining({
          kind: "resourceReloadHooks",
          symbol: "ResourceManagerReloadListener"
        }),
        expect.objectContaining({
          kind: "networkSyncHints",
          symbol: "sendToServer"
        }),
        expect.objectContaining({
          kind: "animationStateHints",
          symbol: "Mth.lerp"
        }),
        expect.objectContaining({
          kind: "renderPerformanceRisks",
          symbol: "new DynamicTexture"
        })
      ])
    });
  });

  it("finds UI layout, render pipeline, and shader pipeline hints", async () => {
    const root = await createTempRoot();
    const javaRoot = join(root, "src", "main", "java");

    await writeText(
      join(javaRoot, "demo", "client", "AdvancedVisuals.java"),
      [
        "package demo.client;",
        "class AdvancedVisuals extends Screen {",
        "  void init() { addRenderableWidget(new Button.Builder(Component.literal(\"Go\"), b -> {}).pos(leftPos + 8, topPos + 8).size(80, 20).build()); }",
        "  void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {",
        "    RenderSystem.enableBlend();",
        "    MultiBufferSource.BufferSource buffers = Minecraft.getInstance().renderBuffers().bufferSource();",
        "    graphics.blit(new ResourceLocation(\"demo\", \"textures/gui/gear.png\"), leftPos, topPos, 0, 0, imageWidth, imageHeight);",
        "  }",
        "  void shaders() {",
        "    PostChain chain;",
        "    ShaderInstance shader;",
        "    RenderType.entityTranslucent(new ResourceLocation(\"demo\", \"textures/block/glow.png\"));",
        "  }",
        "}"
      ].join("\n")
    );

    await expect(
      scanClientVisualSourceEvidence({
        workspaceRoot: root
      })
    ).resolves.toMatchObject({
      counts: {
        uiLayoutHints: 1,
        renderPipelineHints: 1,
        shaderPipelineHints: 1,
        resourceLocationReferences: 2
      },
      evidence: expect.arrayContaining([
        expect.objectContaining({
          kind: "uiLayoutHints",
          symbol: "GuiGraphics.blit"
        }),
        expect.objectContaining({
          kind: "renderPipelineHints",
          symbol: "RenderSystem"
        }),
        expect.objectContaining({
          kind: "shaderPipelineHints",
          symbol: "PostChain"
        })
      ])
    });
  });
});

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-client-source-"));
  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
